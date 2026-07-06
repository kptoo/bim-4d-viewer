/**
 * Viewer engine domain types.
 *
 * The viewer engine communicates with the rest of the
 * application exclusively through these typed events
 * and data structures. It has no direct React dependencies.
 */

/**
 * Result of a pick/click operation in the 3D viewer.
 * Null when clicking empty space (deselect).
 */
export interface PickResult {
  globalId: string
  expressId?: number
  point: { x: number; y: number; z: number }
}

/**
 * A color override instruction for the viewer engine.
 * Used by the simulation and filter systems.
 */
export interface ColorOverride {
  globalId: string
  /** Hex color string */
  color: string
  /** Opacity 0–1 */
  opacity?: number
}

/**
 * Viewer visibility instruction.
 */
export interface VisibilityOverride {
  globalId: string
  visible: boolean
}

/**
 * Typed events emitted by the viewer engine.
 * Consumed by the selection store only.
 */
export type ViewerEventType =
  | 'object:picked'
  | 'object:hovered'
  | 'scene:ready'
  | 'model:loaded'
  | 'model:error'

export interface ViewerEvent<T = unknown> {
  type: ViewerEventType
  payload: T
}