import { useMemo } from 'react'
import { useActivityStore }  from '../store/activity.store'
import { useSelectionStore } from '../store/selection.store'
import { useSimulationStore } from '../store/simulation.store'
import { useActivities }     from '../hooks/useActivities'
import type { Activity }     from '../types'

// ── Constants ─────────────────────────────────────────────────────────────────

const LABEL_WIDTH = 160
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const STATUS_COLOR: Record<string, string> = {
  completed: '#2ECC71',
  active:    '#2F6BFF',
  future:    '#B0B0B0',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dateToPercent(dateStr: string, rangeStart: number, rangeEnd: number): number {
  const t    = new Date(dateStr).getTime()
  const span = rangeEnd - rangeStart
  if (span === 0) return 0
  return Math.max(0, Math.min(100, ((t - rangeStart) / span) * 100))
}

/**
 * Derives the project date range from the loaded activities.
 * Falls back to the current calendar year when no activities are loaded.
 */
function deriveProjectRange(activities: Activity[]): { start: number; end: number } {
  if (activities.length === 0) {
    const now   = new Date()
    const year  = now.getFullYear()
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

  // Add one-month padding on each side
  const padding = 30 * 24 * 60 * 60 * 1000
  return { start: min - padding, end: max + padding }
}

// ── GanttPanel ────────────────────────────────────────────────────────────────

export default function GanttPanel() {
  // Trigger fetch + sync to store (React Query deduplicates if already mounted)
  const { isLoading, isError } = useActivities()

  const activities         = useActivityStore(s => s.activities)
  const isLoaded           = useActivityStore(s => s.isLoaded)
  const selectedActivityId = useSelectionStore(s => s.selectedActivityId)
  const primaryGlobalId    = useSelectionStore(s => s.primaryGlobalId)
  const selectActivity     = useSelectionStore(s => s.selectActivity)
  const currentDate        = useSimulationStore(s => s.currentDate)
  const computeAllFrames   = useSimulationStore(s => s.computeAllFrames)

  // Derive date range from actual activities
  const { start: rangeStart, end: rangeEnd } = useMemo(
    () => deriveProjectRange(activities),
    [activities]
  )

  const nowPct = useMemo(
    () => dateToPercent(currentDate.toISOString(), rangeStart, rangeEnd),
    [currentDate, rangeStart, rangeEnd]
  )

  // Compute all simulation frames once per render
  const frames = useMemo(
    () => computeAllFrames(activities),
    [computeAllFrames, activities]
  )

  const handleActivityClick = (activity: Activity) => {
    selectActivity(activity.id, activity.linkedGlobalIds[0])
  }

  // ── Loading state ─────────────────────────────────────────
  if (isLoading && !isLoaded) {
    return (
      <div className="gantt-wrap gantt-wrap--state">
        <div className="gantt-state">
          <div className="gantt-state__spinner" />
          <span className="gantt-state__text">Loading activities…</span>
        </div>
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────
  if (isError) {
    return (
      <div className="gantt-wrap gantt-wrap--state">
        <div className="gantt-state gantt-state--error">
          ⚠️ Failed to load activities
        </div>
      </div>
    )
  }

  // ── Empty state ───────────────────────────────────────────
  if (isLoaded && activities.length === 0) {
    return (
      <div className="gantt-wrap gantt-wrap--state">
        <div className="gantt-empty">
          <div className="gantt-empty__icon">📅</div>
          <p className="gantt-empty__title">No Activities</p>
          <p className="gantt-empty__hint">
            Create activities in the <strong>Activities</strong> tab to see them here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="gantt-wrap">
      <div className="gantt-chart">

        {/* ── Month header ─────────────────────────────────── */}
        <div
          className="gantt-month-header"
          style={{ gridTemplateColumns: `${LABEL_WIDTH}px repeat(12, 1fr)` }}
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
            <div key={m} className="gantt-month-cell">{m}</div>
          ))}
        </div>

        {/* ── Activity rows ─────────────────────────────────── */}
        {activities.map((activity, idx) => {
          const startPct = dateToPercent(activity.startDate, rangeStart, rangeEnd)
          const endPct   = dateToPercent(activity.endDate,   rangeStart, rangeEnd)
          const widthPct = Math.max(0.5, endPct - startPct)

          // Status from the first linked object's simulation frame
          const firstFrame = activity.linkedGlobalIds[0]
            ? frames.get(activity.linkedGlobalIds[0])
            : undefined
          const status      = firstFrame?.status ?? 'future'
          const statusColor = STATUS_COLOR[status]

          const isSelected    = selectedActivityId === activity.id
          const isHighlighted = primaryGlobalId !== null &&
            activity.linkedGlobalIds.includes(primaryGlobalId)

          return (
            <div
              key={activity.id}
              className={[
                'gantt-row',
                isSelected                      ? 'selected'    : '',
                isHighlighted && !isSelected    ? 'highlighted' : '',
              ].join(' ').trim()}
              style={{ gridTemplateColumns: `${LABEL_WIDTH}px 1fr` }}
              onClick={() => handleActivityClick(activity)}
            >
              {/* Label column */}
              <div className="gantt-task-label">
                <div
                  className="gantt-status-dot"
                  style={{ background: statusColor }}
                />
                <span
                  className="gantt-task-name"
                  title={activity.name}
                >
                  {activity.name}
                </span>
              </div>

              {/* Bar column */}
              <div className="gantt-bar-cell" style={{ position: 'relative' }}>

                {/* "NOW" line — only on first row to avoid duplication */}
                {idx === 0 && nowPct >= 0 && nowPct <= 100 && (
                  <>
                    <div className="gantt-now-line"  style={{ left: `${nowPct}%` }} />
                    <div className="gantt-now-label" style={{ left: `${nowPct}%` }}>NOW</div>
                  </>
                )}

                {/* Activity bar */}
                <div
                  className="gantt-bar"
                  style={{
                    left:       `${startPct}%`,
                    width:      `${widthPct}%`,
                    background: activity.color,
                    opacity:    status === 'future' ? 0.45 : 1,
                    boxShadow:  isSelected
                      ? `0 0 0 2px #fff, 0 0 12px ${activity.color}`
                      : '0 2px 6px rgba(0,0,0,0.3)',
                  }}
                >
                  {widthPct > 8 && (
                    <span className="gantt-bar__label">
                      {activity.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}