import { useBIMStore } from '../state/bimStore'

const TYPE_ICONS: Record<string, string> = {
  IfcWall:        '🧱',
  IfcSlab:        '⬛',
  IfcColumn:      '🏛',
  IfcBeam:        '➖',
  IfcStair:       '🪜',
  IfcFlowSegment: '🔩',
  IfcCurtainWall: '🪟',
  IfcCovering:    '🟫',
}

export default function IFCInspector() {
  const selectedIFCId    = useBIMStore(s => s.selectedIFCId)
  const selectedTaskId   = useBIMStore(s => s.selectedTaskId)
  const elements         = useBIMStore(s => s.ifcElements)
  const tasks            = useBIMStore(s => s.tasks)
  const getElementStatus = useBIMStore(s => s.getElementStatus)

  const element = elements.find(e => e.globalId === selectedIFCId) ?? null
  const task    = tasks.find(t => t.id === selectedTaskId) ?? null

  if (!element) {
    return (
      <div className="inspector-body">
        <div className="inspector-empty">
          <div className="inspector-empty-icon">🏗</div>
          <p>Select an element in the 3D viewer or click a task in the Gantt chart</p>
        </div>
      </div>
    )
  }

  const status    = getElementStatus(element.globalId)
  const typeIcon  = TYPE_ICONS[element.type] ?? '📦'

  const statusLabel = status === 'completed' ? 'Completed'
                    : status === 'active'    ? 'In Progress'
                    : 'Upcoming'

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text)

  return (
    <div className="inspector-body">
      <div className="inspector-card">

        {/* Type header */}
        <div className="inspector-type-header">
          <div className="inspector-type-icon">{typeIcon}</div>
          <div className="inspector-type-info">
            <div className="inspector-element-name">{element.name}</div>
            <div className="inspector-type-badge">{element.type}</div>
          </div>
          <span className={`status-badge ${status}`}>{statusLabel}</span>
        </div>

        {/* Properties */}
        <div className="inspector-props">
          <div className="prop-row">
            <span className="prop-key">Global ID</span>
            <span className="prop-val">
              {element.globalId}
              <button
                className="copy-btn"
                onClick={() => copyToClipboard(element.globalId)}
                title="Copy GlobalId"
              >
                📋
              </button>
            </span>
          </div>
          <div className="prop-row">
            <span className="prop-key">Name</span>
            <span className="prop-val">{element.name}</span>
          </div>
          <div className="prop-row">
            <span className="prop-key">IFC Type</span>
            <span className="prop-val">
              <span className="inspector-type-badge">{element.type}</span>
            </span>
          </div>
          <div className="prop-row">
            <span className="prop-key">Status</span>
            <span className="prop-val">
              <span className={`status-badge ${status}`}>{statusLabel}</span>
            </span>
          </div>
          {task && (
            <div className="prop-row">
              <span className="prop-key">Task ID</span>
              <span className="prop-val">{task.id}</span>
            </div>
          )}
        </div>

        {/* Linked task */}
        {task && (
          <div className="inspector-task-card">
            <div className="inspector-task-title">Linked Construction Task</div>
            <div className="inspector-task-name" style={{ color: task.color }}>
              {task.name}
            </div>
            <div className="inspector-task-dates">
              📅 {task.start} → {task.end}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              {task.ifcIds.length} element{task.ifcIds.length !== 1 ? 's' : ''} in this task
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="inspector-actions">
          <button className="action-btn" onClick={() => console.log('Zoom to', element.globalId)}>
            🔍 Zoom To
          </button>
          <button className="action-btn" onClick={() => console.log('Isolate', element.globalId)}>
            💡 Isolate
          </button>
          <button className="action-btn" onClick={() => console.log('Show task', task?.id)}>
            📋 Task
          </button>
        </div>
      </div>
    </div>
  )
}
