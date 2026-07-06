import { useSelectionStore } from '../store/selection.store'
import { useViewerStore } from '../store/viewer.store'
import { useActivityStore } from '../store/activity.store'
import { useSimulationStore } from '../store/simulation.store'
import { useLayerStore } from '../store/layer.store'
import { ifcTypeIcon } from '../utils/ifc.utils'
import type { Activity, SimulationStatus } from '../types'

const STATUS_LABEL: Record<SimulationStatus, string> = {
  completed: 'Completed',
  active:    'In Progress',
  future:    'Upcoming',
}

export default function IFCInspector() {
  const primaryGlobalId       = useSelectionStore(s => s.primaryGlobalId)
  const selectedActivityId    = useSelectionStore(s => s.selectedActivityId)
  const getObjectByGlobalId   = useViewerStore(s => s.getObjectByGlobalId)
  const getActivitiesForObject = useActivityStore(s => s.getActivitiesForObject)
  const getActivityById       = useActivityStore(s => s.getActivityById)
  const getLayersForObject    = useLayerStore(s => s.getLayersForObject)
  const computeAllFrames      = useSimulationStore(s => s.computeAllFrames)
  const activities            = useActivityStore(s => s.activities)

  const ifcObject    = primaryGlobalId ? getObjectByGlobalId(primaryGlobalId) : null
  const linkedActivity: Activity | undefined = selectedActivityId
    ? getActivityById(selectedActivityId)
    : ifcObject
      ? getActivitiesForObject(ifcObject.globalId)[0]
      : undefined

  const assignedLayers = ifcObject
    ? getLayersForObject(ifcObject.globalId)
    : []

  const frames = computeAllFrames(activities)
  const status = ifcObject
    ? (frames.get(ifcObject.globalId)?.status ?? 'future')
    : 'future'

  if (!ifcObject) {
    return (
      <div className="inspector-body">
        <div className="inspector-empty">
          <div className="inspector-empty-icon">🏗</div>
          <p>Select an element in the 3D viewer or click a task in the Gantt chart</p>
        </div>
      </div>
    )
  }

  const typeIcon = ifcTypeIcon(ifcObject.type)
  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text)

  return (
    <div className="inspector-body">
      <div className="inspector-card">

        {/* Type header */}
        <div className="inspector-type-header">
          <div className="inspector-type-icon">{typeIcon}</div>
          <div className="inspector-type-info">
            <div className="inspector-element-name">{ifcObject.name}</div>
            <div className="inspector-type-badge">{ifcObject.type}</div>
          </div>
          <span className={`status-badge ${status}`}>{STATUS_LABEL[status]}</span>
        </div>

        {/* Properties */}
        <div className="inspector-props">
          <div className="prop-row">
            <span className="prop-key">Global ID</span>
            <span className="prop-val">
              {ifcObject.globalId}
              <button
                className="copy-btn"
                onClick={() => copyToClipboard(ifcObject.globalId)}
                title="Copy GlobalId"
              >
                📋
              </button>
            </span>
          </div>
          <div className="prop-row">
            <span className="prop-key">Name</span>
            <span className="prop-val">{ifcObject.name}</span>
          </div>
          <div className="prop-row">
            <span className="prop-key">IFC Type</span>
            <span className="prop-val">
              <span className="inspector-type-badge">{ifcObject.type}</span>
            </span>
          </div>
          <div className="prop-row">
            <span className="prop-key">Status</span>
            <span className="prop-val">
              <span className={`status-badge ${status}`}>{STATUS_LABEL[status]}</span>
            </span>
          </div>

          {/* Information layers */}
          {assignedLayers.length > 0 && (
            <div className="prop-row">
              <span className="prop-key">Layers</span>
              <span className="prop-val" style={{ flexWrap: 'wrap', gap: 4 }}>
                {assignedLayers.map(layer => (
                  <span
                    key={layer.id}
                    className="inspector-type-badge"
                    style={{ background: `${layer.color}22`, borderColor: layer.color, color: layer.color }}
                  >
                    {layer.name}
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>

        {/* Linked activity */}
        {linkedActivity && (
          <div className="inspector-task-card">
            <div className="inspector-task-title">Linked Construction Activity</div>
            <div className="inspector-task-name" style={{ color: linkedActivity.color }}>
              {linkedActivity.name}
            </div>
            <div className="inspector-task-dates">
              📅 {linkedActivity.startDate} → {linkedActivity.endDate}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              {linkedActivity.linkedGlobalIds.length} element
              {linkedActivity.linkedGlobalIds.length !== 1 ? 's' : ''} in this activity
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="inspector-actions">
          <button className="action-btn" onClick={() => console.log('Zoom to', ifcObject.globalId)}>
            🔍 Zoom To
          </button>
          <button className="action-btn" onClick={() => console.log('Isolate', ifcObject.globalId)}>
            💡 Isolate
          </button>
          <button className="action-btn" onClick={() => console.log('Show activity', linkedActivity?.id)}>
            📋 Activity
          </button>
        </div>
      </div>
    </div>
  )
}