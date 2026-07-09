import { sql }                  from '../../database/client'
import type { AssignmentRow }   from '../../database/types'
import type { LayerAssignment } from '../../types'

// ── Row → Domain mapper ──────────────────────────────────────────────────────

function rowToAssignment(row: AssignmentRow): LayerAssignment {
  return {
    id:         row.id,
    layerId:    row.layer_id,
    globalId:   row.global_id,
    assignedAt: row.assigned_at,
  }
}

// ── API methods ──────────────────────────────────────────────────────────────

/**
 * Fetches ALL assignments.
 * Used to seed the layer store after model load.
 */
export async function fetchAllAssignments(): Promise<LayerAssignment[]> {
  const rows = await sql<AssignmentRow>`
    SELECT id, layer_id, global_id, assigned_at
    FROM   layer_assignments
    ORDER  BY assigned_at DESC
  `
  return rows.map(rowToAssignment)
}

/**
 * Fetches all assignments for a specific layer.
 */
export async function fetchAssignmentsByLayer(
  layerId: string
): Promise<LayerAssignment[]> {
  const rows = await sql<AssignmentRow>`
    SELECT id, layer_id, global_id, assigned_at
    FROM   layer_assignments
    WHERE  layer_id = ${layerId}
    ORDER  BY assigned_at DESC
  `
  return rows.map(rowToAssignment)
}

/**
 * Fetches all layers assigned to a specific IFC object.
 */
export async function fetchAssignmentsByGlobalId(
  globalId: string
): Promise<LayerAssignment[]> {
  const rows = await sql<AssignmentRow>`
    SELECT id, layer_id, global_id, assigned_at
    FROM   layer_assignments
    WHERE  global_id = ${globalId}
    ORDER  BY assigned_at DESC
  `
  return rows.map(rowToAssignment)
}

/**
 * Assigns one or more IFC GlobalIds to a layer.
 *
 * Uses INSERT … ON CONFLICT DO NOTHING so repeated calls are safe.
 * Returns only the newly inserted assignments.
 */
export async function assignObjectsToLayer(
  layerId:   string,
  globalIds: string[]
): Promise<LayerAssignment[]> {
  if (globalIds.length === 0) return []

  // Build a VALUES list: ($1, $2), ($1, $3), …
  // We use a single parameterised query via Neon's tagged template.
  // Neon supports array parameters via unnest.
  const rows = await sql<AssignmentRow>`
    INSERT INTO layer_assignments (layer_id, global_id)
    SELECT ${layerId}, unnest(${globalIds}::text[])
    ON CONFLICT (layer_id, global_id) DO NOTHING
    RETURNING id, layer_id, global_id, assigned_at
  `
  return rows.map(rowToAssignment)
}

/**
 * Removes an assignment by its primary key UUID.
 * Returns true if deleted, false if not found.
 */
export async function removeAssignment(id: string): Promise<boolean> {
  const rows = await sql<{ id: string }>`
    DELETE FROM layer_assignments
    WHERE  id = ${id}
    RETURNING id
  `
  return rows.length > 0
}

/**
 * Removes all assignments of a specific IFC object from a layer.
 * Returns the number of rows deleted.
 */
export async function removeObjectFromLayer(
  layerId:  string,
  globalId: string
): Promise<number> {
  const rows = await sql<{ id: string }>`
    DELETE FROM layer_assignments
    WHERE  layer_id  = ${layerId}
    AND    global_id = ${globalId}
    RETURNING id
  `
  return rows.length
}

/**
 * Removes ALL assignments for a specific layer.
 * Called before deleting the layer itself (or use DB CASCADE).
 */
export async function removeAllAssignmentsForLayer(
  layerId: string
): Promise<number> {
  const rows = await sql<{ id: string }>`
    DELETE FROM layer_assignments
    WHERE  layer_id = ${layerId}
    RETURNING id
  `
  return rows.length
}

/**
 * Returns a map of globalId → layerIds[] for ALL assignments.
 * Efficient for seeding the viewer store's IFCObject.layerIds.
 */
export async function buildGlobalIdToLayerIdsMap(): Promise<Map<string, string[]>> {
  const rows = await sql<{ global_id: string; layer_id: string }>`
    SELECT global_id, layer_id
    FROM   layer_assignments
    ORDER  BY global_id
  `
  const map = new Map<string, string[]>()
  for (const row of rows) {
    const existing = map.get(row.global_id) ?? []
    existing.push(row.layer_id)
    map.set(row.global_id, existing)
  }
  return map
}