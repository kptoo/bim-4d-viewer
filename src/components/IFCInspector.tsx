import { useState } from 'react'
import { useSelectionStore } from '../store/selection.store'
import { useViewerStore } from '../store/viewer.store'
import { useActivityStore } from '../store/activity.store'
import { useSimulationStore } from '../store/simulation.store'
import { useLayerStore } from '../store/layer.store'
import { ifcTypeIcon } from '../utils/ifc.utils'
import type { Activity, IFCProperty, SimulationStatus } from '../types'

const STATUS_LABEL: Record<SimulationStatus, string> = {
  completed: 'Completed',
  active:    'In Progress',
  future:    'Upcoming',
}

// ─── Property set group (collapsible) ────────────────────────────────────────

interface PsetGroupProps {
  psetName:   string
  properties: IFCProperty[]
}

function PsetGroup({ psetName, properties }: PsetGroupProps) {
  const [open, setOpen] = useState(true)

  return (
    <div className="inspector-pset">
      <button
        className="inspector-pset-header"
        onClick={() => setOpen(o => !o)}
        title={open ? 'Collapse' : 'Expand'}
      >
        <span className="inspector-pset-chevron">{open ? '▾' : '▸'}</span>
        <span className="inspector-pset-name">{psetName}</span>
        <span className="inspector-pset-count">({properties.length})</span>
      </button>

      {open && (
        <div className="inspector-pset-body">
          {properties.map((p, i) => (
            <div className="prop-row prop-row--pset" key={`${p.name}-${i}`}>
              <span className="prop-key prop-key--pset">{p.name}</span>
              <span className="prop-val prop-val--pset">
                {p.value === null || p.value === undefined
                  ? <em style={{ opacity: 0.4 }}>—</em>
                  : String(p.value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Inspector ───────────────────────────────────────────────────────────

export default function IFCInspector() {
  const primaryGlobalId        = useSelectionStore(s => s.primaryGlobalId)
  const selectedActivityId     = useSelectionStore(s => s.selectedActivityId)
  const getObjectByGlobalId    = useViewerStore(s => s.getObjectByGlobalId)
  const getActivitiesForObject = useActivityStore(s => s.getActivitiesForObject)
  const getActivityById        = useActivityStore(s => s.getActivityById)
  const getLayersForObject     = useLayerStore(s => s.getLayersForObject)
  const computeAllFrames       = useSimulationStore(s => s.computeAllFrames)
  const activities             = useActivityStore(s => s.activities)

  const ifcObject     = primaryGlobalId ? getObjectByGlobalId(primaryGlobalId) : null
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

  // ── Empty state ───────────────────────────────────────────
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

  // ── Group properties by Pset name ────────────────────────
  const psetMap = new Map<string, IFCProperty[]>()
  for (const prop of ifcObject.properties) {
    const group = psetMap.get(prop.set) ?? []
    group.push(prop)
    psetMap.set(prop.set, group)
  }
  const psetNames = Array.from(psetMap.keys()).sort()

  return (
    <div className="inspector-body">
      <div className="inspector-card">

        {/* ── Type header ─────────────────────────────────── */}
        <div className="inspector-type-header">
          <div className="inspector-type-icon">{typeIcon}</div>
          <div className="inspector-type-info">
            <div className="inspector-element-name">{ifcObject.name}</div>
            <div className="inspector-type-badge">{ifcObject.type}</div>
          </div>
          <span className={`status-badge ${status}`}>{STATUS_LABEL[status]}</span>
        </div>

        {/* ── Core IFC attributes ──────────────────────────── */}
        <div className="inspector-section-title">IFC Attributes</div>
        <div className="inspector-props">

          <div className="prop-row">
            <span className="prop-key">Global ID</span>
            <span className="prop-val">
              <span className="prop-val-text" title={ifcObject.globalId}>
                {ifcObject.globalId}
              </span>
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

          {ifcObject.expressId !== undefined && (
            <div className="prop-row">
              <span className="prop-key">Express ID</span>
              <span className="prop-val">{ifcObject.expressId}</span>
            </div>
          )}

          {ifcObject.tag && (
            <div className="prop-row">
              <span className="prop-key">Tag</span>
              <span className="prop-val">{ifcObject.tag}</span>
            </div>
          )}

          {ifcObject.description && (
            <div className="prop-row">
              <span className="prop-key">Description</span>
              <span className="prop-val">{ifcObject.description}</span>
            </div>
          )}

          {ifcObject.objectType && (
            <div className="prop-row">
              <span className="prop-key">Object Type</span>
              <span className="prop-val">{ifcObject.objectType}</span>
            </div>
          )}

          {ifcObject.predefinedType && (
            <div className="prop-row">
              <span className="prop-key">Predefined Type</span>
              <span className="prop-val">{ifcObject.predefinedType}</span>
            </div>
          )}

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

        {/* ── Property Sets ────────────────────────────────── */}
        {psetNames.length > 0 && (
          <>
            <div className="inspector-section-title">Property Sets</div>
            <div className="inspector-psets">
              {psetNames.map(name => (
                <PsetGroup
                  key={name}
                  psetName={name}
                  properties={psetMap.get(name)!}
                />
              ))}
            </div>
          </>
        )}

        {/* ── Linked activity ──────────────────────────────── */}
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

        {/* ── Quick actions ────────────────────────────────── */}
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