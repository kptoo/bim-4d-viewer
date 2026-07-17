import { sql }                  from '../../database/client'
import type { ActivityRow, ActivityLinkRow } from '../../database/types'
import type { Activity, CreateActivityPayload, UpdateActivityPayload } from '../../types'

// ── Row → Domain mapper ──────────────────────────────────────────────────────

/**
 * Converts a raw DB row into the Activity domain type.
 * linkedGlobalIds is populated separately via a join or second query.
 */
function rowToActivity(row: ActivityRow, linkedGlobalIds: string[] = []): Activity {
  return {
    id:              row.id,
    name:            row.name,
    startDate:       row.start_date,
    endDate:         row.end_date,
    color:           row.color,
    linkedGlobalIds,
    dependencies:    Array.isArray(row.dependencies)
      ? row.dependencies.map(String)
      : [],
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  }
}

// ── getActivities ────────────────────────────────────────────────────────────

/**
 * Fetches all activities with their linked IFC GlobalIds in a single query.
 * Activities are ordered by start_date ascending (schedule order).
 */
export async function getActivities(): Promise<Activity[]> {
  // Fetch all activities
  const rows = await sql<ActivityRow>`
    SELECT id, name, start_date, end_date, progress, color,
           parent_id, dependencies, created_at, updated_at
    FROM   activities
    ORDER  BY start_date ASC, created_at ASC
  `

  if (rows.length === 0) return []

  // Fetch all links in one query
  const activityIds = rows.map(r => r.id)
  const linkRows = await sql<ActivityLinkRow>`
    SELECT activity_id, global_id
    FROM   activity_object_links
    WHERE  activity_id = ANY(${activityIds}::uuid[])
    ORDER  BY activity_id, linked_at ASC
  `

  // Build a map of activityId → globalIds[]
  const linkMap = new Map<string, string[]>()
  for (const link of linkRows) {
    const existing = linkMap.get(link.activity_id) ?? []
    existing.push(link.global_id)
    linkMap.set(link.activity_id, existing)
  }

  return rows.map(row => rowToActivity(row, linkMap.get(row.id) ?? []))
}

// ── getActivityById ──────────────────────────────────────────────────────────

/**
 * Fetches a single activity by ID, including its linked GlobalIds.
 * Returns null if not found.
 */
export async function getActivityById(id: string): Promise<Activity | null> {
  const rows = await sql<ActivityRow>`
    SELECT id, name, start_date, end_date, progress, color,
           parent_id, dependencies, created_at, updated_at
    FROM   activities
    WHERE  id = ${id}
    LIMIT  1
  `

  if (rows.length === 0) return null

  const linkRows = await sql<ActivityLinkRow>`
    SELECT global_id
    FROM   activity_object_links
    WHERE  activity_id = ${id}
    ORDER  BY linked_at ASC
  `

  const linkedGlobalIds = linkRows.map(r => r.global_id)
  return rowToActivity(rows[0], linkedGlobalIds)
}

// ── createActivity ───────────────────────────────────────────────────────────

/**
 * Creates a new activity and its linked IFC GlobalIds.
 * Returns the created activity with server-generated id and timestamps.
 */
export async function createActivity(
  payload: CreateActivityPayload
): Promise<Activity> {
  // Insert the activity row — dates are passed as ISO strings; Postgres casts them.
  const rows = await sql<ActivityRow>`
    INSERT INTO activities (name, start_date, end_date, color, dependencies)
    VALUES (
      ${payload.name},
      ${payload.startDate},
      ${payload.endDate},
      ${payload.color},
      ${payload.dependencies.length > 0 ? payload.dependencies : []}::uuid[]
    )
    RETURNING id, name, start_date, end_date, progress, color,
              parent_id, dependencies, created_at, updated_at
  `

  if (rows.length === 0) {
    throw new Error('[activities.api] INSERT returned no rows')
  }

  const newId = rows[0].id

  // Insert links
  let linkedGlobalIds: string[] = []
  if (payload.linkedGlobalIds.length > 0) {
    await sql`
      INSERT INTO activity_object_links (activity_id, global_id)
      SELECT ${newId}::uuid, unnest(${payload.linkedGlobalIds}::text[])
      ON CONFLICT (activity_id, global_id) DO NOTHING
    `
    linkedGlobalIds = [...payload.linkedGlobalIds]
  }

  return rowToActivity(rows[0], linkedGlobalIds)
}

// ── updateActivity ───────────────────────────────────────────────────────────

/**
 * Updates an existing activity and optionally replaces its linked GlobalIds.
 * Returns the updated activity, or null if not found.
 *
 * Uses explicit field updates — only non-null payload fields are applied.
 * Dates are passed as ISO strings; PostgreSQL coerces them to DATE type.
 */
export async function updateActivity(
  payload: UpdateActivityPayload
): Promise<Activity | null> {
  const { id, ...fields } = payload

  // Always update updated_at; apply other fields only when provided.
  // We use COALESCE with explicit parameter passing for type safety.
  const rows = await sql<ActivityRow>`
    UPDATE activities
    SET
      name         = COALESCE(${fields.name         ?? null}, name),
      start_date   = COALESCE(${fields.startDate    ?? null}::date, start_date),
      end_date     = COALESCE(${fields.endDate      ?? null}::date, end_date),
      color        = COALESCE(${fields.color        ?? null}, color),
      dependencies = COALESCE(
        ${fields.dependencies != null ? fields.dependencies : null}::uuid[],
        dependencies
      )
    WHERE id = ${id}
    RETURNING id, name, start_date, end_date, progress, color,
              parent_id, dependencies, created_at, updated_at
  `

  if (rows.length === 0) return null

  // Replace linked GlobalIds if provided
  if (fields.linkedGlobalIds !== undefined) {
    // Delete all existing links for this activity
    await sql`
      DELETE FROM activity_object_links
      WHERE  activity_id = ${id}
    `
    // Insert new links
    if (fields.linkedGlobalIds.length > 0) {
      await sql`
        INSERT INTO activity_object_links (activity_id, global_id)
        SELECT ${id}::uuid, unnest(${fields.linkedGlobalIds}::text[])
        ON CONFLICT (activity_id, global_id) DO NOTHING
      `
    }

    return rowToActivity(rows[0], fields.linkedGlobalIds)
  }

  // Fetch current links unchanged
  const linkRows = await sql<ActivityLinkRow>`
    SELECT global_id
    FROM   activity_object_links
    WHERE  activity_id = ${id}
    ORDER  BY linked_at ASC
  `
  return rowToActivity(rows[0], linkRows.map(r => r.global_id))
}

// ── deleteActivity ───────────────────────────────────────────────────────────

/**
 * Deletes an activity and all its object links (CASCADE handles the links).
 * Returns true if deleted, false if not found.
 */
export async function deleteActivity(id: string): Promise<boolean> {
  const rows = await sql<{ id: string }>`
    DELETE FROM activities
    WHERE  id = ${id}
    RETURNING id
  `
  return rows.length > 0
}

// ── linkObjectsToActivity ─────────────────────────────────────────────────────

/**
 * Assigns one or more IFC GlobalIds to an activity.
 * Uses ON CONFLICT DO NOTHING — safe to call repeatedly.
 */
export async function linkObjectsToActivity(
  activityId: string,
  globalIds:  string[]
): Promise<void> {
  if (globalIds.length === 0) return

  await sql`
    INSERT INTO activity_object_links (activity_id, global_id)
    SELECT ${activityId}::uuid, unnest(${globalIds}::text[])
    ON CONFLICT (activity_id, global_id) DO NOTHING
  `
}

// ── unlinkObjectFromActivity ──────────────────────────────────────────────────

/**
 * Removes a specific IFC GlobalId from an activity.
 * Returns the number of rows deleted (0 or 1).
 */
export async function unlinkObjectFromActivity(
  activityId: string,
  globalId:   string
): Promise<number> {
  const rows = await sql<{ id: string }>`
    DELETE FROM activity_object_links
    WHERE  activity_id = ${activityId}
    AND    global_id   = ${globalId}
    RETURNING id
  `
  return rows.length
}

// ── buildGlobalIdToActivityIdsMap ─────────────────────────────────────────────

/**
 * Returns a map of globalId → activityIds[] for ALL links.
 * Used to seed IFCObject.activityIds in the viewer store.
 */
export async function buildGlobalIdToActivityIdsMap(): Promise<Map<string, string[]>> {
  const rows = await sql<{ global_id: string; activity_id: string }>`
    SELECT global_id, activity_id
    FROM   activity_object_links
    ORDER  BY global_id
  `
  const map = new Map<string, string[]>()
  for (const row of rows) {
    const existing = map.get(row.global_id) ?? []
    existing.push(row.activity_id)
    map.set(row.global_id, existing)
  }
  return map
}