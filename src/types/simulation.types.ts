/**
 * Simulation domain types.
 *
 * The simulation engine computes the construction status
 * of every IFC object at a given point in time.
 *
 * React components must NEVER compute simulation state
 * directly — they read from the simulation store only.
 */

/** The three possible construction states for any IFC object */
export type SimulationStatus = 'future' | 'active' | 'completed'

/**
 * The computed state for a single IFC object at a
 * specific point in the simulation timeline.
 */
export interface SimulationFrame {
  globalId: string
  status: SimulationStatus
  /** Resolved hex color string for this status */
  color: string
}

/**
 * Canonical color map for simulation status values.
 * All color logic derives from this single source.
 * Never hardcode these hex values elsewhere.
 */
export const SIMULATION_COLORS: Record<SimulationStatus, string> = {
  future:    '#B0B0B0',
  active:    '#2F6BFF',
  completed: '#2ECC71',
}

/** Color used when an object is selected — overrides simulation color */
export const SELECTION_COLOR = '#FFD700'