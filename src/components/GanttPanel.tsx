import { useMemo } from 'react'
import { useActivityStore } from '../store/activity.store'
import { useSelectionStore } from '../store/selection.store'
import { useSimulationStore } from '../store/simulation.store'
import type { Activity } from '../types'

const PROJECT_START = new Date('2024-01-01').getTime()
const PROJECT_END   = new Date('2024-12-31').getTime()
const LABEL_WIDTH   = 160

function dateToPercent(dateStr: string): number {
  const t = new Date(dateStr).getTime()
  return ((t - PROJECT_START) / (PROJECT_END - PROJECT_START)) * 100
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const STATUS_COLOR = { completed: '#2ECC71', active: '#2F6BFF', future: '#B0B0B0' }

export default function GanttPanel() {
  const activities       = useActivityStore(s => s.activities)
  const selectedActivityId = useSelectionStore(s => s.selectedActivityId)
  const primaryGlobalId  = useSelectionStore(s => s.primaryGlobalId)
  const selectActivity   = useSelectionStore(s => s.selectActivity)
  const currentDate      = useSimulationStore(s => s.currentDate)
  const computeAllFrames = useSimulationStore(s => s.computeAllFrames)

  const nowPct = useMemo(() =>
    ((currentDate.getTime() - PROJECT_START) / (PROJECT_END - PROJECT_START)) * 100,
  [currentDate])

  // Compute all frames once per render
  const frames = computeAllFrames(activities)

  const handleActivityClick = (activity: Activity) => {
    selectActivity(activity.id, activity.linkedGlobalIds[0])
  }

  return (
    <div className="gantt-wrap">
      <div className="gantt-chart">

        {/* Month header */}
        <div
          className="gantt-month-header"
          style={{ gridTemplateColumns: `${LABEL_WIDTH}px repeat(12, 1fr)` }}
        >
          <div style={{
            borderRight: '1px solid var(--border-color)',
            padding: '6px 10px',
            fontSize: 10,
            color: 'var(--text-secondary)',
            fontWeight: 700,
          }}>
            TASK
          </div>
          {MONTHS.map(m => (
            <div key={m} className="gantt-month-cell">{m}</div>
          ))}
        </div>

        {/* Activity rows */}
        {activities.map(activity => {
          const startPct   = dateToPercent(activity.startDate)
          const endPct     = dateToPercent(activity.endDate)
          const widthPct   = endPct - startPct

          // Derive status from the pre-computed frame of the first linked object
          const firstFrame  = activity.linkedGlobalIds[0]
            ? frames.get(activity.linkedGlobalIds[0])
            : undefined
          const status       = firstFrame?.status ?? 'future'
          const statusColor  = STATUS_COLOR[status]

          const isSelected    = selectedActivityId === activity.id
          const isHighlighted = primaryGlobalId !== null &&
            activity.linkedGlobalIds.includes(primaryGlobalId)

          return (
            <div
              key={activity.id}
              className={[
                'gantt-row',
                isSelected    ? 'selected'    : '',
                isHighlighted && !isSelected ? 'highlighted' : '',
              ].join(' ').trim()}
              style={{ gridTemplateColumns: `${LABEL_WIDTH}px 1fr` }}
              onClick={() => handleActivityClick(activity)}
            >
              {/* Label */}
              <div className="gantt-task-label">
                <div className="gantt-status-dot" style={{ background: statusColor }} />
                <span className="gantt-task-name">{activity.name}</span>
              </div>

              {/* Bar area */}
              <div className="gantt-bar-cell" style={{ position: 'relative' }}>
                {/* Now line — only on first row to avoid duplication */}
                {activity === activities[0] && nowPct >= 0 && nowPct <= 100 && (
                  <>
                    <div className="gantt-now-line" style={{ left: `${nowPct}%` }} />
                    <div className="gantt-now-label" style={{ left: `${nowPct}%` }}>NOW</div>
                  </>
                )}

                {/* Activity bar */}
                <div
                  className="gantt-bar"
                  style={{
                    left:      `${startPct}%`,
                    width:     `${widthPct}%`,
                    background: activity.color,
                    opacity:    status === 'future' ? 0.45 : 1,
                    boxShadow:  isSelected
                      ? `0 0 0 2px #fff, 0 0 12px ${activity.color}`
                      : '0 2px 6px rgba(0,0,0,0.3)',
                  }}
                >
                  {widthPct > 8 && activity.name}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}