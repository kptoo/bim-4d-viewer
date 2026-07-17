/**
 * GanttPanel — Custom SVG/HTML Gantt chart for the 4D BIM schedule.
 *
 * Responsibilities:
 * - Renders a horizontal bar chart of all activities.
 * - Shows the current simulation date as a "NOW" marker.
 * - Colours bars by simulation status (future / active / completed).
 * - Supports bidirectional selection:
 *     • Clicking a bar selects the activity (and its linked IFC objects).
 *     • Selecting an IFC object in the viewer highlights its activities.
 * - Handles loading, empty, and error states.
 *
 * Performance notes:
 * - `deriveProjectRange` and `computeAllFrames` are wrapped in `useMemo`
 *   to avoid recomputation on unrelated renders.
 * - The component calls `useActivities()` which React Query deduplicates —
 *   calling it here AND in ActivityPanel results in a single network request.
 *
 * @module GanttPanel
 */

import { useMemo, useCallback, memo } from 'react'
import { useActivityStore }           from '../store/activity.store'
import { useSelectionStore }          from '../store/selection.store'
import { useSimulationStore }         from '../store/simulation.store'
import { useActivities }              from '../hooks/useActivities'
import { LoadingSpinner }             from './ui/LoadingSpinner'
import { EmptyState }                 from './ui/EmptyState'
import { ErrorMessage }               from './ui/ErrorMessage'
import type { Activity }              from '../types'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Width reserved for the task label column in pixels */
const LABEL_WIDTH = 160

/** Abbreviated month names for the calendar header */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

/** Simulation status → display colour mapping */
const STATUS_COLOR: Record<string, string> = {
  completed: '#2ECC71',
  active:    '#2F6BFF',
  future:    '#B0B0B0',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Converts an ISO date string to a percentage position within a time range.
 * Clamps the result to [0, 100].
 *
 * @param dateStr    - ISO date string (e.g. "2026-03-15")
 * @param rangeStart - Range start time in milliseconds (Date.getTime())
 * @param rangeEnd   - Range end time in milliseconds
 * @returns Position as a percentage in [0, 100]
 */
function dateToPercent(dateStr: string, rangeStart: number, rangeEnd: number): number {
  const t    = new Date(dateStr).getTime()
  const span = rangeEnd - rangeStart
  if (span === 0) return 0
  return Math.max(0, Math.min(100, ((t - rangeStart) / span) * 100))
}

/**
 * Derives the project date range from the loaded activities.
 * Adds one-month padding on each side for visual breathing room.
 * Falls back to the current calendar year when no activities are loaded.
 *
 * @param activities - Array of all loaded activities
 * @returns { start, end } timestamps in milliseconds
 */
function deriveProjectRange(activities: Activity[]): { start: number; end: number } {
  if (activities.length === 0) {
    const year = new Date().getFullYear()
    return {
      start: new Date(`${year}-01-01`).getTime(),
      end:   new Date(`${year}-12-31`).getTime(),
    }
  }

  let min = Infinity
  let max = -Infinity

  for (const a of activities) {
    const s = new Date(a.startDate).getTime()
    const e = new Date(a.endDate).getTime()
    if (s < min) min = s
    if (e > max) max = e
  }

  // One-month padding on each side
  const padding = 30 * 24 * 60 * 60 * 1000
  return { start: min - padding, end: max + padding }
}

// ── GanttRow ──────────────────────────────────────────────────────────────────

interface GanttRowProps {
  activity:    Activity
  rangeStart:  number
  rangeEnd:    number
  nowPct:      number
  isFirst:     boolean
  isSelected:  boolean
  isHighlighted: boolean
  statusColor: string
  onClick:     (activity: Activity) => void
}

/**
 * A single row in the Gantt chart.
 * Memoised to avoid re-rendering all rows when only the selection changes.
 */
const GanttRow = memo(function GanttRow({
  activity,
  rangeStart,
  rangeEnd,
  nowPct,
  isFirst,
  isSelected,
  isHighlighted,
  statusColor,
  onClick,
}: GanttRowProps) {
  const startPct = dateToPercent(activity.startDate, rangeStart, rangeEnd)
  const endPct   = dateToPercent(activity.endDate,   rangeStart, rangeEnd)
  const widthPct = Math.max(0.5, endPct - startPct)

  // Determine if the bar is in a "future" low-opacity state
  const isFuture = statusColor === STATUS_COLOR.future

  const handleClick = useCallback(() => {
    onClick(activity)
  }, [activity, onClick])

  return (
    <div
      className={[
        'gantt-row',
        isSelected                      ? 'selected'    : '',
        isHighlighted && !isSelected    ? 'highlighted' : '',
      ].join(' ').trim()}
      style={{ gridTemplateColumns: `${LABEL_WIDTH}px 1fr` }}
      onClick={handleClick}
      role="row"
      aria-selected={isSelected}
    >
      {/* Label column */}
      <div className="gantt-task-label">
        <div
          className="gantt-status-dot"
          style={{ background: statusColor }}
          aria-hidden="true"
        />
        <span className="gantt-task-name" title={activity.name}>
          {activity.name}
        </span>
      </div>

      {/* Bar column */}
      <div className="gantt-bar-cell" style={{ position: 'relative' }}>

        {/* "NOW" marker — rendered only on the first row to avoid duplication */}
        {isFirst && nowPct >= 0 && nowPct <= 100 && (
          <>
            <div className="gantt-now-line"  style={{ left: `${nowPct}%` }} aria-hidden="true" />
            <div className="gantt-now-label" style={{ left: `${nowPct}%` }} aria-hidden="true">NOW</div>
          </>
        )}

        {/* Activity bar */}
        <div
          className="gantt-bar"
          role="cell"
          aria-label={`${activity.name}: ${activity.startDate} to ${activity.endDate}`}
          style={{
            left:       `${startPct}%`,
            width:      `${widthPct}%`,
            background: activity.color,
            opacity:    isFuture ? 0.45 : 1,
            boxShadow:  isSelected
              ? `0 0 0 2px #fff, 0 0 12px ${activity.color}`
              : '0 2px 6px rgba(0,0,0,0.3)',
          }}
        >
          {widthPct > 8 && (
            <span className="gantt-bar__label">{activity.name}</span>
          )}
        </div>
      </div>
    </div>
  )
})

// ── GanttPanel ────────────────────────────────────────────────────────────────

/**
 * Main Gantt panel component.
 *
 * State machine:
 *   loading  → LoadingSpinner
 *   error    → ErrorMessage with retry
 *   empty    → EmptyState with guidance
 *   populated → GanttRow list
 */
export default function GanttPanel() {
  // ── Data fetching ────────────────────────────────────────
  // React Query deduplicates this call if ActivityPanel already fetched it.
  const { isLoading, isError, error, refetch } = useActivities()

  // ── Store reads ──────────────────────────────────────────
  const activities         = useActivityStore(s => s.activities)
  const isLoaded           = useActivityStore(s => s.isLoaded)
  const selectedActivityId = useSelectionStore(s => s.selectedActivityId)
  const primaryGlobalId    = useSelectionStore(s => s.primaryGlobalId)
  const selectActivity     = useSelectionStore(s => s.selectActivity)
  const currentDate        = useSimulationStore(s => s.currentDate)
  const computeAllFrames   = useSimulationStore(s => s.computeAllFrames)

  // ── Derived values ───────────────────────────────────────

  const { start: rangeStart, end: rangeEnd } = useMemo(
    () => deriveProjectRange(activities),
    [activities]
  )

  const nowPct = useMemo(
    () => dateToPercent(currentDate.toISOString(), rangeStart, rangeEnd),
    [currentDate, rangeStart, rangeEnd]
  )

  /**
   * Compute all simulation frames at the current date.
   * Memoised on activities + currentDate to avoid per-render recomputation.
   */
  const frames = useMemo(
    () => computeAllFrames(activities),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activities, currentDate]
  )

  const handleActivityClick = useCallback((activity: Activity) => {
    selectActivity(activity.id, activity.linkedGlobalIds[0])
  }, [selectActivity])

  const handleRetry = useCallback(() => {
    void refetch()
  }, [refetch])

  // ── State renders ────────────────────────────────────────

  if (isLoading && !isLoaded) {
    return (
      <div className="gantt-wrap gantt-wrap--state">
        <LoadingSpinner message="Loading schedule…" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="gantt-wrap gantt-wrap--state">
        <ErrorMessage
          message={(error as Error)?.message ?? 'Failed to load activities'}
          context="GanttPanel"
          onRetry={handleRetry}
        />
      </div>
    )
  }

  if (isLoaded && activities.length === 0) {
    return (
      <div className="gantt-wrap gantt-wrap--state">
        <EmptyState
          icon="📅"
          title="No Scheduled Activities"
          hint={
            <>
              Create activities in the <strong>Activities</strong> tab.<br />
              They will appear here once saved.
            </>
          }
        />
      </div>
    )
  }

  // ── Main chart ───────────────────────────────────────────

  return (
    <div className="gantt-wrap" role="table" aria-label="Construction schedule Gantt chart">
      <div className="gantt-chart">

        {/* Month header */}
        <div
          className="gantt-month-header"
          style={{ gridTemplateColumns: `${LABEL_WIDTH}px repeat(12, 1fr)` }}
          role="row"
        >
          <div style={{
            borderRight: '1px solid var(--border-color)',
            padding:     '6px 10px',
            fontSize:    10,
            color:       'var(--text-secondary)',
            fontWeight:  700,
          }}>
            TASK
          </div>
          {MONTHS.map(m => (
            <div key={m} className="gantt-month-cell" role="columnheader">{m}</div>
          ))}
        </div>

        {/* Activity rows */}
        {activities.map((activity, idx) => {
          const firstFrame   = activity.linkedGlobalIds[0]
            ? frames.get(activity.linkedGlobalIds[0])
            : undefined
          const status       = firstFrame?.status ?? 'future'
          const statusColor  = STATUS_COLOR[status] ?? STATUS_COLOR.future
          const isSelected   = selectedActivityId === activity.id
          const isHighlighted =
            primaryGlobalId !== null &&
            activity.linkedGlobalIds.includes(primaryGlobalId)

          return (
            <GanttRow
              key={activity.id}
              activity={activity}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              nowPct={nowPct}
              isFirst={idx === 0}
              isSelected={isSelected}
              isHighlighted={isHighlighted}
              statusColor={statusColor}
              onClick={handleActivityClick}
            />
          )
        })}
      </div>
    </div>
  )
}