/**
 * useActivityTimeline — Activity-scoped 4D timeline controller.
 *
 * This is the single point that bridges the Selection Store and the
 * Simulation Store for per-activity timeline scoping.
 *
 * Responsibility:
 * - Watch `selectedActivityId` from the selection store.
 * - When an activity is selected:
 *     1. Look up its startDate and endDate from the activity store.
 *     2. Call `setProjectDates(start, end)` to narrow the active timeline
 *        window to exactly those dates.
 *     3. Call `resetPlayback()` to stop any running playback and return
 *        the slider to the start of the activity's window. This prevents
 *        the slider from being stuck at a position that is outside the
 *        new narrowed range.
 * - When selection is cleared (selectedActivityId === null):
 *     Restore the full project range from `fullProjectStart` /
 *     `fullProjectEnd` so the slider spans the complete construction
 *     schedule again.
 *
 * Architecture principles:
 * - Zero UI rendering — this is a side-effect hook only.
 * - Zero business logic — it reads dates from the activity and passes them
 *   straight to the simulation store. SimulationEngine does the rest.
 * - No duplication — it reuses `setProjectDates` and `resetPlayback` which
 *   already exist in the simulation store.
 * - Single mount point — called once from `TimelineSlider` (which is always
 *   mounted inside GanttDock). Calling it from multiple components would
 *   cause duplicate effects but React's effect deduplication prevents
 *   double-firing when the same deps don't change.
 *
 * Future-proofing:
 * - To add "play entire project" mode: pass fullProjectStart / fullProjectEnd
 *   to setProjectDates — exactly what the null-selection branch already does.
 * - To add "play sequence of selected activities": compute min(startDates) and
 *   max(endDates) across the selected set and call setProjectDates once.
 * - Neither extension requires changes to this hook's interface.
 *
 * @module useActivityTimeline
 */

import { useEffect }          from 'react'
import { useSelectionStore }  from '../store/selection.store'
import { useActivityStore }   from '../store/activity.store'
import { useSimulationStore } from '../store/simulation.store'

export function useActivityTimeline(): void {
  // ── Store reads ───────────────────────────────────────────────────────────

  const selectedActivityId  = useSelectionStore(s => s.selectedActivityId)
  const getActivityById     = useActivityStore(s => s.getActivityById)

  const setProjectDates     = useSimulationStore(s => s.setProjectDates)
  const resetPlayback       = useSimulationStore(s => s.resetPlayback)
  const fullProjectStart    = useSimulationStore(s => s.fullProjectStart)
  const fullProjectEnd      = useSimulationStore(s => s.fullProjectEnd)

  // ── Effect: sync timeline window to selected activity ─────────────────────

  useEffect(() => {
    if (selectedActivityId === null) {
      // ── No activity selected → restore full project range ────────────────
      //
      // We call setProjectDates (not resetPlayback) here so the slider
      // position (progress) is preserved — the user can deselect an activity
      // and the playhead stays where it was, now interpreted against the full
      // project range. Only the window changes, not the progress value.
      setProjectDates(fullProjectStart, fullProjectEnd)
      return
    }

    // ── Activity selected → narrow window to its exact date range ───────────

    const activity = getActivityById(selectedActivityId)

    if (!activity) {
      // Activity ID in selection store but not found in activity store
      // (can happen transiently during optimistic deletes). Restore full range.
      console.warn(
        '[useActivityTimeline] selectedActivityId not found in activity store:',
        selectedActivityId
      )
      setProjectDates(fullProjectStart, fullProjectEnd)
      return
    }

    const start = new Date(activity.startDate)
    const end   = new Date(activity.endDate)

    // Guard against invalid date strings in the DB
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      console.warn(
        '[useActivityTimeline] Activity has invalid dates — falling back to full range.',
        { id: activity.id, startDate: activity.startDate, endDate: activity.endDate }
      )
      setProjectDates(fullProjectStart, fullProjectEnd)
      return
    }

    // Guard against activities where end < start (data entry error)
    if (end.getTime() <= start.getTime()) {
      console.warn(
        '[useActivityTimeline] Activity endDate is not after startDate — skipping window update.',
        { id: activity.id, startDate: activity.startDate, endDate: activity.endDate }
      )
      return
    }

    console.log(
      '[useActivityTimeline] Scoping timeline to activity:',
      activity.name,
      '|', activity.startDate, '→', activity.endDate
    )

    // 1. Stop any running playback and reset the slider to 0 within the new window
    resetPlayback()

    // 2. Narrow the active window to the selected activity's exact date range
    //    This must come AFTER resetPlayback() so resetPlayback's
    //    progressToDate(0, projectStart, projectEnd) uses the OLD range
    //    (not the new one), correctly returning to the old start.
    //    Then setProjectDates immediately updates the window. The slider
    //    is already at 0 so progressToDate(0, start, end) = start.
    setProjectDates(start, end)

  }, [
    selectedActivityId,
    getActivityById,
    setProjectDates,
    resetPlayback,
    fullProjectStart,
    fullProjectEnd,
  ])
}