/**
 * SimulationEngine — Pure business logic for 4D simulation.
 *
 * This class has ZERO React dependencies and ZERO Three.js dependencies.
 * It is a pure computation layer — given data, return results.
 * This makes it fully unit-testable and framework-agnostic.
 *
 * React components must never compute simulation state directly.
 * They must read from the simulation store, which delegates to this engine.
 */

import type { Activity, SimulationFrame, SimulationStatus } from '../../types'
import { SIMULATION_COLORS } from '../../types'

export class SimulationEngine {
  /**
   * Computes the simulation frame for every IFC object linked
   * to the provided activities, at the given current date.
   *
   * Priority rule: when an object appears in overlapping activities,
   * "active" takes priority over "completed" and "future".
   *
   * @param currentDate - The simulation's current date
   * @param activities  - All activities in the project
   * @returns Map of GlobalId → SimulationFrame
   */
  static computeFrames(
    currentDate: Date,
    activities: Activity[]
  ): Map<string, SimulationFrame> {
    const frames = new Map<string, SimulationFrame>()
    const now    = currentDate.getTime()

    for (const activity of activities) {
      const start  = new Date(activity.startDate).getTime()
      const end    = new Date(activity.endDate).getTime()
      const status = SimulationEngine.resolveStatus(now, start, end)

      for (const globalId of activity.linkedGlobalIds) {
        const existing = frames.get(globalId)

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
   * Computes the status of a single IFC object at the current date.
   * Use computeFrames() for batch computation — it is more efficient.
   *
   * @param globalId    - IFC GlobalId of the object
   * @param currentDate - The simulation's current date
   * @param activities  - All activities in the project
   * @returns SimulationStatus — 'future' if no matching activity found
   */
  static computeObjectStatus(
    globalId: string,
    currentDate: Date,
    activities: Activity[]
  ): SimulationStatus {
    const frames = SimulationEngine.computeFrames(currentDate, activities)
    return frames.get(globalId)?.status ?? 'future'
  }

  /**
   * Resolves the simulation status from raw timestamps.
   * Extracted as a named method to make unit testing precise.
   */
  static resolveStatus(
    nowMs:   number,
    startMs: number,
    endMs:   number
  ): SimulationStatus {
    if (nowMs > endMs)        return 'completed'
    if (nowMs >= startMs)     return 'active'
    return 'future'
  }

  /**
   * Defines priority when an object belongs to overlapping activities.
   * Active wins over completed wins over future.
   *
   * Higher number = higher priority.
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