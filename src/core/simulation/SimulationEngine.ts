/**
 * SimulationEngine — Pure business logic for 4D construction simulation.
 *
 * Design principles:
 * - ZERO React dependencies.
 * - ZERO Three.js dependencies.
 * - No side effects — all methods are pure static functions.
 * - Fully unit-testable (see SimulationEngine.test.ts).
 * - Framework-agnostic — can be used in Node.js tests or any future runtime.
 *
 * Architecture:
 * - Components NEVER call SimulationEngine directly.
 * - `useSimulationStore.computeAllFrames()` delegates to this engine.
 * - `IFCViewer`'s simulation `useEffect` calls `computeAllFrames()` and
 *   passes the result to `ViewerEngine.applyColorOverrides()`.
 * - This ensures simulation logic stays pure, testable, and decoupled from React.
 *
 * Status model:
 * - Each IFC object linked to an activity is in one of three states at any
 *   point in the simulation timeline:
 *     • `future`    — construction hasn't started yet
 *     • `active`    — currently under construction
 *     • `completed` — construction is done
 * - Objects NOT linked to any activity have no frame (status = 'future' default).
 *
 * Priority rule:
 * - When an object is linked to overlapping activities, `active` takes
 *   priority over `completed`, which takes priority over `future`.
 *   This ensures the most meaningful status is always shown.
 *
 * Performance:
 * - `computeFrames()` runs in O(activities × linkedGlobalIds) time.
 * - Called once per render when `isSimulationActive` is true.
 * - `useMemo` in GanttPanel and `useEffect` in IFCViewer prevent unnecessary calls.
 *
 * @module SimulationEngine
 */

import type { Activity, SimulationFrame, SimulationStatus } from '../../types'
import { SIMULATION_COLORS } from '../../types'

// ── SimulationEngine ──────────────────────────────────────────────────────────

export class SimulationEngine {
  /**
   * Computes a simulation frame for every IFC object linked to the provided
   * activities, at the given simulation date.
   *
   * Objects not linked to any activity will not appear in the returned Map.
   * Consumers should default to 'future' status for unmapped objects.
   *
   * Priority: when an object belongs to overlapping activities, the status
   * with the highest priority wins (active > completed > future).
   *
   * @param currentDate - The simulation's current point in time
   * @param activities  - All activities in the construction schedule
   * @returns Map of GlobalId → SimulationFrame for all linked objects
   */
  static computeFrames(
    currentDate: Date,
    activities:  Activity[]
  ): Map<string, SimulationFrame> {
    const frames = new Map<string, SimulationFrame>()
    const now    = currentDate.getTime()

    for (const activity of activities) {
      const start  = new Date(activity.startDate).getTime()
      const end    = new Date(activity.endDate).getTime()
      const status = SimulationEngine.resolveStatus(now, start, end)

      for (const globalId of activity.linkedGlobalIds) {
        const existing = frames.get(globalId)

        // Apply the higher-priority status if this object already has a frame
        if (
          !existing ||
          SimulationEngine.statusPriority(status) >
          SimulationEngine.statusPriority(existing.status)
        ) {
          frames.set(globalId, {
            globalId,
            status,
            color: SIMULATION_COLORS[status],
          })
        }
      }
    }

    return frames
  }

  /**
   * Computes the simulation status for a single IFC object.
   *
   * This is a convenience wrapper around `computeFrames()`.
   * For batch computation (all objects), prefer `computeFrames()` directly
   * as it avoids iterating activities multiple times.
   *
   * @param globalId    - IFC GlobalId of the object to evaluate
   * @param currentDate - The simulation's current point in time
   * @param activities  - All activities in the construction schedule
   * @returns SimulationStatus — defaults to 'future' when no activity is linked
   */
  static computeObjectStatus(
    globalId:    string,
    currentDate: Date,
    activities:  Activity[]
  ): SimulationStatus {
    const frames = SimulationEngine.computeFrames(currentDate, activities)
    return frames.get(globalId)?.status ?? 'future'
  }

  /**
   * Resolves the simulation status from raw millisecond timestamps.
   *
   * Boundary conditions:
   * - `nowMs === startMs` → 'active' (construction begins today)
   * - `nowMs === endMs`   → 'active' (construction ends today, still in progress)
   * - `nowMs > endMs`     → 'completed'
   *
   * @param nowMs   - Current simulation time in milliseconds
   * @param startMs - Activity start time in milliseconds
   * @param endMs   - Activity end time in milliseconds
   * @returns The resolved SimulationStatus
   */
  static resolveStatus(
    nowMs:   number,
    startMs: number,
    endMs:   number
  ): SimulationStatus {
    if (nowMs > endMs)    return 'completed'
    if (nowMs >= startMs) return 'active'
    return 'future'
  }

  /**
   * Returns a numeric priority for a simulation status.
   * Higher number = higher priority when resolving overlapping activities.
   *
   * Priority order: active (2) > completed (1) > future (0)
   *
   * @param status - The SimulationStatus to evaluate
   * @returns Priority number in [0, 2]
   */
  private static statusPriority(status: SimulationStatus): number {
    const priorities: Record<SimulationStatus, number> = {
      future:    0,
      completed: 1,
      active:    2,
    }
    return priorities[status]
  }
}