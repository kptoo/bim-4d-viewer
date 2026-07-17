/**
 * simulation.store.ts — Zustand store for the 4D timeline simulation.
 *
 * Owns the construction timeline state and delegates computation to
 * `SimulationEngine`. Components must never call SimulationEngine directly.
 *
 * State machine:
 * - `isSimulationActive = false` — IFC original materials are shown.
 *   The timeline slider is visible but colour overrides are not applied.
 * - `isSimulationActive = true`  — Simulation colours (future / active /
 *   completed) are applied to IFC objects based on their linked activities.
 *
 * Simulation activation:
 * - Starting playback (`setPlaying(true)`) implicitly activates simulation.
 * - The user can also manually activate it without starting playback.
 * - `deactivateSimulation()` restores original IFC materials and stops playback.
 *
 * Auto-play:
 * - `tick()` is called on each animation frame when `isPlaying = true`.
 * - It increments `progress` by 1 point per tick (100 ticks = full timeline).
 * - At 100%, playback stops automatically.
 *
 * @module simulation.store
 */

import { create } from 'zustand'
import { SimulationEngine } from '../core/simulation/SimulationEngine'
import { progressToDate }   from '../utils/date.utils'
import type { SimulationStatus, SimulationFrame, Activity } from '../types'

// ── Project timeline constants ─────────────────────────────────────────────────

/**
 * Default project start date.
 * In production, this should be derived from the earliest activity start date.
 * Phase 5 note: Override this via setProjectDates() when activities are loaded.
 */
const PROJECT_START = new Date('2026-01-01')

/**
 * Default project end date.
 * In production, this should be derived from the latest activity end date.
 */
const PROJECT_END   = new Date('2026-12-31')

// ── State shape ───────────────────────────────────────────────────────────────

interface SimulationState {
  /**
   * The current simulation date, derived from the progress value.
   * This is the date at which simulation status is evaluated.
   */
  currentDate: Date

  /**
   * Slider value in the range [0, 100].
   * 0 = project start, 100 = project end.
   */
  progress: number

  /**
   * Whether the auto-play animation is running.
   * Controlled by setPlaying(). Updated automatically by tick().
   */
  isPlaying: boolean

  /**
   * Master gate for the simulation colour overlay.
   *
   * TRUE  — Simulation status colours (future/active/completed) are applied
   *          to IFC objects in the 3D viewer.
   * FALSE — IFC original materials are displayed; no colour overrides applied.
   *
   * `isPlaying` only controls auto-advance of the timeline slider.
   * `isSimulationActive` controls whether colours are applied to the model.
   */
  isSimulationActive: boolean

  /** Project start date — used for progress ↔ date conversion. */
  projectStart: Date

  /** Project end date — used for progress ↔ date conversion. */
  projectEnd: Date

  // ── Actions ──────────────────────────────────────────────

  /**
   * Sets the timeline slider value and updates `currentDate`.
   * Clamps the value to [0, 100].
   *
   * @param value - Progress value in [0, 100]
   */
  setProgress: (value: number) => void

  /**
   * Starts or stops auto-play of the timeline.
   * Starting playback implicitly activates the simulation colour overlay.
   *
   * @param playing - true to start, false to stop
   */
  setPlaying: (playing: boolean) => void

  /**
   * Activates the simulation colour overlay without starting playback.
   * Call this when the user manually enables the simulation view.
   */
  activateSimulation: () => void

  /**
   * Deactivates the simulation colour overlay and stops playback.
   * Call this when the user disables simulation view.
   * IFC original materials are restored by IFCViewer's simulation useEffect.
   */
  deactivateSimulation: () => void

  /**
   * Advances the timeline by one step.
   * Called by the TimelineSlider's animation loop when `isPlaying` is true.
   * Stops automatically when progress reaches 100.
   */
  tick: () => void

  /**
   * Computes the simulation status for a single IFC object at `currentDate`.
   * Delegates to SimulationEngine.computeObjectStatus().
   *
   * @param globalId   - IFC object GlobalId
   * @param activities - All loaded activities
   * @returns SimulationStatus — 'future' if no matching activity
   */
  getObjectStatus:  (globalId: string, activities: Activity[]) => SimulationStatus

  /**
   * Computes simulation frames for all IFC objects linked to activities,
   * at the current simulation date.
   * Delegates to SimulationEngine.computeFrames().
   *
   * @param activities - All loaded activities
   * @returns Map<globalId, SimulationFrame>
   */
  computeAllFrames: (activities: Activity[]) => Map<string, SimulationFrame>
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useSimulationStore = create<SimulationState>((set, get) => ({
  currentDate:         progressToDate(35, PROJECT_START, PROJECT_END),
  progress:            35,
  isPlaying:           false,
  isSimulationActive:  false,
  projectStart:        PROJECT_START,
  projectEnd:          PROJECT_END,

  setProgress: (value) => {
    const clamped = Math.max(0, Math.min(100, value))
    set({
      progress:    clamped,
      currentDate: progressToDate(clamped, PROJECT_START, PROJECT_END),
    })
  },

  setPlaying: (playing) => {
    if (playing) {
      // Starting playback implicitly activates simulation colours
      set({ isPlaying: true, isSimulationActive: true })
    } else {
      set({ isPlaying: false })
    }
  },

  activateSimulation: () => set({ isSimulationActive: true }),

  deactivateSimulation: () => set({ isSimulationActive: false, isPlaying: false }),

  tick: () => {
    const { progress, setProgress, setPlaying } = get()
    const next = progress + 1
    if (next >= 100) {
      setProgress(100)
      setPlaying(false)
    } else {
      setProgress(next)
    }
  },

  getObjectStatus: (globalId, activities) =>
    SimulationEngine.computeObjectStatus(globalId, get().currentDate, activities),

  computeAllFrames: (activities) =>
    SimulationEngine.computeFrames(get().currentDate, activities),
}))