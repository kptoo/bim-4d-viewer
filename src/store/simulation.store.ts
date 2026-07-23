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
 * Phase 6 / 4D playback changes (previous iteration):
 * - Added `setProjectDates(start, end)` — called by `useActivities` once
 *   activity data loads so the slider range matches real construction dates.
 * - Fixed `setProgress()` and `tick()` to read `projectStart` / `projectEnd`
 *   from store state instead of hardcoded module-level constants.
 * - Added `resetPlayback()` — Stop action: deactivates simulation + resets to 0.
 *
 * Activity-scoped timeline changes (this iteration):
 * - Added `fullProjectStart` / `fullProjectEnd` — the project-wide date range
 *   (derived from all activities). These are never overwritten by per-activity
 *   selection; they are the "home" range that the controller returns to when
 *   the user deselects an activity.
 * - Added `setFullProjectDates(start, end)` — called by `useActivities` to
 *   record the full range. It also calls `setProjectDates` so the active
 *   range and the full range start out in sync.
 * - `setProjectDates(start, end)` is now the "active window" setter. It is
 *   called by `useActivityTimeline` when an activity is selected, narrowing
 *   the slider to that activity's exact Start Date → End Date.
 *
 * Future-proofing:
 * - To implement "play entire project" later, call:
 *     setProjectDates(fullProjectStart, fullProjectEnd)
 *   No architectural change required.
 * - To implement multi-activity sequential playback, the caller simply passes
 *   the earliest start and latest end of the desired subset.
 *
 * Auto-play:
 * - `tick()` is called every 100 ms when `isPlaying = true`.
 * - Each tick advances `progress` by 0.5 units → 200 ticks for full cycle.
 * - Stops automatically at 100 (= projectEnd of the current window).
 *
 * @module simulation.store
 */

import { create } from 'zustand'
import { SimulationEngine } from '../core/simulation/SimulationEngine'
import { progressToDate }   from '../utils/date.utils'
import type { SimulationStatus, SimulationFrame, Activity } from '../types'

// ── Fallback dates ────────────────────────────────────────────────────────────
//
// Used ONLY before the first `setFullProjectDates()` call.
// In practice, `useActivities` overwrites these as soon as the first
// activity data arrives from the DB.

const FALLBACK_START = new Date('2026-01-01')
const FALLBACK_END   = new Date('2026-12-31')

// ── State shape ───────────────────────────────────────────────────────────────

interface SimulationState {
  /**
   * The current simulation date, derived from the progress value
   * within the active window (projectStart → projectEnd).
   */
  currentDate: Date

  /**
   * Slider value in the range [0, 100].
   * 0 = projectStart (active window start), 100 = projectEnd (active window end).
   */
  progress: number

  /** Whether the auto-play animation is running. */
  isPlaying: boolean

  /**
   * Master gate for the simulation colour overlay.
   * TRUE  — status colours applied to IFC objects.
   * FALSE — original IFC materials shown.
   */
  isSimulationActive: boolean

  /**
   * The active timeline window start.
   *
   * In "all activities" mode: equals fullProjectStart.
   * In "single activity" mode: equals that activity's startDate.
   *
   * Set by setProjectDates(). Drives progress ↔ date math.
   */
  projectStart: Date

  /**
   * The active timeline window end.
   *
   * In "all activities" mode: equals fullProjectEnd.
   * In "single activity" mode: equals that activity's endDate.
   *
   * Set by setProjectDates(). Drives progress ↔ date math.
   */
  projectEnd: Date

  /**
   * The project-wide start date — the earliest start date across all activities
   * (with optional padding). This is the "home" range start.
   *
   * Set once by setFullProjectDates() when activities load.
   * Never overwritten by per-activity selection.
   * Used to restore the full range when selection is cleared.
   */
  fullProjectStart: Date

  /**
   * The project-wide end date — the latest end date across all activities
   * (with optional padding). This is the "home" range end.
   *
   * Set once by setFullProjectDates() when activities load.
   * Never overwritten by per-activity selection.
   */
  fullProjectEnd: Date

  // ── Actions ──────────────────────────────────────────────

  /**
   * Records the project-wide date range derived from all activities.
   * Called by `useActivities` after each successful fetch.
   *
   * Also calls `setProjectDates(start, end)` so the active window
   * starts in sync with the full range.
   *
   * @param start - Earliest activity startDate (with optional padding)
   * @param end   - Latest activity endDate (with optional padding)
   */
  setFullProjectDates: (start: Date, end: Date) => void

  /**
   * Sets the active timeline window that the slider maps across.
   *
   * Called by:
   * - `setFullProjectDates` (on initial load / activity data change)
   * - `useActivityTimeline` hook (when an activity is selected → narrows window)
   * - `useActivityTimeline` hook (when selection clears → restores full range)
   *
   * Recalculates `currentDate` for the current `progress` position in the
   * new window, so the viewer updates immediately after the range changes.
   *
   * @param start - Window start date
   * @param end   - Window end date
   */
  setProjectDates: (start: Date, end: Date) => void

  /**
   * Sets the timeline slider value and updates `currentDate`.
   * Clamps the value to [0, 100].
   *
   * @param value - Progress value in [0, 100]
   */
  setProgress: (value: number) => void

  /**
   * Starts or stops auto-play.
   * Starting playback implicitly activates simulation colours.
   * If already at 100%, restarts from 0.
   *
   * @param playing - true to start, false to pause
   */
  setPlaying: (playing: boolean) => void

  /** Activates simulation colour overlay without starting playback. */
  activateSimulation: () => void

  /**
   * Deactivates simulation colour overlay and stops playback.
   * Does NOT reset progress (slider position is preserved).
   */
  deactivateSimulation: () => void

  /**
   * Stop action: deactivates simulation AND resets progress to 0.
   * Returns the slider to the start of the active window.
   */
  resetPlayback: () => void

  /**
   * Advances the timeline by one step.
   * Called by the TimelineSlider's setInterval loop when `isPlaying` is true.
   * Stops automatically when progress reaches 100.
   */
  tick: () => void

  /**
   * Computes the simulation status for a single IFC object at `currentDate`.
   *
   * @param globalId   - IFC object GlobalId
   * @param activities - All loaded activities
   */
  getObjectStatus: (globalId: string, activities: Activity[]) => SimulationStatus

  /**
   * Computes simulation frames for all linked IFC objects at `currentDate`.
   *
   * @param activities - All loaded activities
   */
  computeAllFrames: (activities: Activity[]) => Map<string, SimulationFrame>
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useSimulationStore = create<SimulationState>((set, get) => ({
  currentDate:        new Date(FALLBACK_START),
  progress:           0,
  isPlaying:          false,
  isSimulationActive: false,
  projectStart:       FALLBACK_START,
  projectEnd:         FALLBACK_END,
  fullProjectStart:   FALLBACK_START,
  fullProjectEnd:     FALLBACK_END,

  // ── setFullProjectDates ───────────────────────────────────────────────────
  //
  // Records the project-wide range and syncs the active window to it.
  // Called by useActivities whenever the activity list changes.

  setFullProjectDates: (start, end) => {
    set({ fullProjectStart: start, fullProjectEnd: end })
    // Sync active window to the full range immediately
    get().setProjectDates(start, end)
  },

  // ── setProjectDates ───────────────────────────────────────────────────────
  //
  // Updates the active window. currentDate is recalculated so the viewer
  // immediately reflects the new position within the new range.

  setProjectDates: (start, end) => {
    const { progress } = get()
    const currentDate  = progressToDate(progress, start, end)
    set({ projectStart: start, projectEnd: end, currentDate })
  },

  // ── setProgress ───────────────────────────────────────────────────────────

  setProgress: (value) => {
    const { projectStart, projectEnd } = get()
    const clamped = Math.max(0, Math.min(100, value))
    set({
      progress:    clamped,
      currentDate: progressToDate(clamped, projectStart, projectEnd),
    })
  },

  // ── setPlaying ────────────────────────────────────────────────────────────

  setPlaying: (playing) => {
    if (playing) {
      const { progress, projectStart, projectEnd } = get()
      if (progress >= 100) {
        // Already at end — restart from the beginning of the active window
        set({
          isPlaying:          true,
          isSimulationActive: true,
          progress:           0,
          currentDate:        progressToDate(0, projectStart, projectEnd),
        })
      } else {
        set({ isPlaying: true, isSimulationActive: true })
      }
    } else {
      set({ isPlaying: false })
    }
  },

  // ── activateSimulation ────────────────────────────────────────────────────

  activateSimulation: () => set({ isSimulationActive: true }),

  // ── deactivateSimulation ──────────────────────────────────────────────────

  deactivateSimulation: () => set({ isSimulationActive: false, isPlaying: false }),

  // ── resetPlayback ─────────────────────────────────────────────────────────

  resetPlayback: () => {
    const { projectStart, projectEnd } = get()
    set({
      isSimulationActive: false,
      isPlaying:          false,
      progress:           0,
      currentDate:        progressToDate(0, projectStart, projectEnd),
    })
  },

  // ── tick ──────────────────────────────────────────────────────────────────
  //
  // 0.5 progress units per 100ms tick → 20 seconds for full playback.
  // Short activity windows (e.g. 10 days) will appear to "fly by" at the
  // same speed in terms of progress%, which is correct — the user can
  // scrub slowly if they need finer control.

  tick: () => {
    const { progress, projectStart, projectEnd, setPlaying } = get()
    const next = progress + 0.5
    if (next >= 100) {
      set({
        progress:    100,
        currentDate: progressToDate(100, projectStart, projectEnd),
      })
      setPlaying(false)
    } else {
      set({
        progress:    next,
        currentDate: progressToDate(next, projectStart, projectEnd),
      })
    }
  },

  // ── getObjectStatus ───────────────────────────────────────────────────────

  getObjectStatus: (globalId, activities) =>
    SimulationEngine.computeObjectStatus(globalId, get().currentDate, activities),

  // ── computeAllFrames ──────────────────────────────────────────────────────

  computeAllFrames: (activities) =>
    SimulationEngine.computeFrames(get().currentDate, activities),
}))