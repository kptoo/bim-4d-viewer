import { sql }             from '../../database/client'
import type { LayerRow }   from '../../database/types'
import type {
  InformationLayer,
  CreateLayerPayload,
} from '../../types'

// ── Row → Domain mapper ──────────────────────────────────────────────────────

function rowToLayer(row: LayerRow): InformationLayer {
  return {
    id:          row.id,
    name:        row.name,
    category:    row.category,
    color:       row.color,
    description: row.description,
    createdAt:   row.created_at,
  }
}

// ── API methods ──────────────────────────────────────────────────────────────

/**
 * Fetches all information layers, newest first.
 */
export async function fetchLayers(): Promise<InformationLayer[]> {
  const rows = await sql<LayerRow>`
    SELECT id, name, category, color, description, created_at
    FROM   information_layers
    ORDER  BY created_at DESC
  `
  return rows.map(rowToLayer)
}

/**
 * Fetches a single layer by ID.
 * Returns null if not found.
 */
export async function fetchLayerById(id: string): Promise<InformationLayer | null> {
  const rows = await sql<LayerRow>`
    SELECT id, name, category, color, description, created_at
    FROM   information_layers
    WHERE  id = ${id}
    LIMIT  1
  `
  return rows.length > 0 ? rowToLayer(rows[0]) : null
}

/**
 * Creates a new information layer.
 * Returns the created layer with server-generated id and createdAt.
 */
export async function createLayer(
  payload: CreateLayerPayload
): Promise<InformationLayer> {
  const rows = await sql<LayerRow>`
    INSERT INTO information_layers (name, category, color, description)
    VALUES      (${payload.name}, ${payload.category}, ${payload.color}, ${payload.description ?? null})
    RETURNING   id, name, category, color, description, created_at
  `

  if (rows.length === 0) {
    throw new Error('[layers.api] INSERT returned no rows')
  }

  return rowToLayer(rows[0])
}

/**
 * Renames an existing layer.
 * Returns the updated layer, or null if not found.
 */
export async function renameLayer(
  id:      string,
  newName: string
): Promise<InformationLayer | null> {
  const rows = await sql<LayerRow>`
    UPDATE information_layers
    SET    name = ${newName}
    WHERE  id   = ${id}
    RETURNING id, name, category, color, description, created_at
  `
  return rows.length > 0 ? rowToLayer(rows[0]) : null
}

/**
 * Updates the color of a layer.
 * Returns the updated layer, or null if not found.
 */
export async function updateLayerColor(
  id:    string,
  color: string
): Promise<InformationLayer | null> {
  const rows = await sql<LayerRow>`
    UPDATE information_layers
    SET    color = ${color}
    WHERE  id    = ${id}
    RETURNING id, name, category, color, description, created_at
  `
  return rows.length > 0 ? rowToLayer(rows[0]) : null
}

/**
 * Deletes a layer and all its assignments (CASCADE).
 * Returns true if a row was deleted, false if not found.
 */
export async function deleteLayer(id: string): Promise<boolean> {
  const rows = await sql<{ id: string }>`
    DELETE FROM information_layers
    WHERE  id = ${id}
    RETURNING id
  `
  return rows.length > 0
}

/**
 * Returns the assignment count for each layer.
 * Useful for showing "3 elements" badges in the UI.
 */
export async function fetchLayerCounts(): Promise<Map<string, number>> {
  const rows = await sql<{ layer_id: string; count: string }>`
    SELECT   layer_id, COUNT(*) AS count
    FROM     layer_assignments
    GROUP BY layer_id
  `
  const map = new Map<string, number>()
  for (const row of rows) {
    map.set(row.layer_id, parseInt(row.count, 10))
  }
  return map
}