import { useMemo, useRef } from 'react'
import { useBIMStore } from '../state/bimStore'

const PROJECT_START = new Date('2024-01-01').getTime()
const PROJECT_END   = new Date('2024-12-31').getTime()
const LABEL_WIDTH   = 160   // px

function dateToPercent(dateStr: string): number {
  const t = new Date(dateStr).getTime()
  return ((t - PROJECT_START) / (PROJECT_END - PROJECT_START)) * 100
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function GanttPanel() {
  const tasks          = useBIMStore(s => s.tasks)
  const selectedTaskId = useBIMStore(s => s.selectedTaskId)
  const selectedIFCId  = useBIMStore(s => s.selectedIFCId)
  const currentDate    = useBIMStore(s => s.currentDate)
  const setSelectedTaskId = useBIMStore(s => s.setSelectedTaskId)
  const getTaskStatus  = useBIMStore(s => s.getTaskStatus)

  const nowPct = useMemo(() =>
    ((currentDate.getTime() - PROJECT_START) / (PROJECT_END - PROJECT_START)) * 100,
  [currentDate])

  const containerRef = useRef<HTMLDivElement>(null)

  const statusColor = (status: string) => {
    if (status === 'completed') return '#2ECC71'
    if (status === 'active')    return '#2F6BFF'
    return '#B0B0B0'
  }

  return (
    <div className="gantt-wrap" ref={containerRef}>
      <div className="gantt-chart">

        {/* Month header */}
        <div
          className="gantt-month-header"
          style={{
            gridTemplateColumns: `${LABEL_WIDTH}px repeat(12, 1fr)`,
          }}
        >
          <div style={{ borderRight: '1px solid var(--border-color)', padding: '6px 10px', fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700 }}>
            TASK
          </div>
          {MONTHS.map(m => (
            <div key={m} className="gantt-month-cell">{m}</div>
          ))}
        </div>

        {/* Task rows */}
        {tasks.map(task => {
          const status        = getTaskStatus(task.id)
          const startPct      = dateToPercent(task.start)
          const endPct        = dateToPercent(task.end)
          const widthPct      = endPct - startPct
          const isSelected    = selectedTaskId === task.id
          const isHighlighted = selectedIFCId != null && task.ifcIds.includes(selectedIFCId)

          return (
            <div
              key={task.id}
              className={`gantt-row${isSelected ? ' selected' : ''}${isHighlighted && !isSelected ? ' highlighted' : ''}`}
              style={{ gridTemplateColumns: `${LABEL_WIDTH}px 1fr` }}
              onClick={() => setSelectedTaskId(task.id)}
            >
              {/* Label */}
              <div className="gantt-task-label">
                <div
                  className="gantt-status-dot"
                  style={{ background: statusColor(status) }}
                />
                <span className="gantt-task-name">{task.name}</span>
              </div>

              {/* Bar area */}
              <div className="gantt-bar-cell" style={{ position: 'relative' }}>
                {/* Now line */}
                {nowPct >= 0 && nowPct <= 100 && (
                  <>
                    <div
                      className="gantt-now-line"
                      style={{ left: `${nowPct}%` }}
                    />
                    {task === tasks[0] && (
                      <div
                        className="gantt-now-label"
                        style={{ left: `${nowPct}%` }}
                      >
                        NOW
                      </div>
                    )}
                  </>
                )}

                {/* Task bar */}
                <div
                  className="gantt-bar"
                  style={{
                    left: `${startPct}%`,
                    width: `${widthPct}%`,
                    background: task.color,
                    opacity: status === 'future' ? 0.45 : 1,
                    boxShadow: isSelected
                      ? `0 0 0 2px #fff, 0 0 12px ${task.color}`
                      : `0 2px 6px rgba(0,0,0,0.3)`,
                  }}
                >
                  {widthPct > 8 && task.name}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
