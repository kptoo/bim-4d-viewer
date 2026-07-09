import {
  useState, useCallback, useMemo, memo,
} from 'react'
import type { ReactNode } from 'react'
import { useSelectionStore }  from '../store/selection.store'
import { useViewerStore }     from '../store/viewer.store'
import { useActivityStore }   from '../store/activity.store'
import { useLayerStore }      from '../store/layer.store'
import { useSimulationStore } from '../store/simulation.store'
import { ifcTypeIcon }        from '../utils/ifc.utils'
import type { IFCObject, IFCProperty, Activity, SimulationStatus } from '../types'

// ─── Status labels ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<SimulationStatus, string> = {
  future:    'Upcoming',
  active:    'Active',
  completed: 'Completed',
}

// ─── Section ──────────────────────────────────────────────────────────────────

interface SectionProps {
  title:        string
  defaultOpen?: boolean
  badge?:       number
  accentColor?: string
  children:     ReactNode
}

const Section = memo(function Section({
  title, defaultOpen = true, badge, accentColor, children,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="insp-section">
      <button
        className="insp-section-header"
        style={accentColor ? { borderLeftColor: accentColor } : undefined}
        onClick={() => setOpen(o => !o)}
      >
        <span className={`insp-chevron${open ? ' insp-chevron--open' : ''}`}>▶</span>
        <span className="insp-section-title">{title}</span>
        {badge !== undefined && (
          <span className="insp-section-badge">{badge}</span>
        )}
      </button>

      {open && (
        <div className="insp-section-body">
          {children}
        </div>
      )}
    </div>
  )
})

// ─── Property row ─────────────────────────────────────────────────────────────

interface PropRowProps {
  label:     string
  value:     ReactNode
  copyText?: string
  mono?:     boolean
}

function PropRow({ label, value, copyText, mono }: PropRowProps) {
  const handleCopy = useCallback(() => {
    if (copyText) navigator.clipboard.writeText(copyText)
  }, [copyText])

  return (
    <div className="insp-prop-row">
      <span className="insp-prop-key">{label}</span>
      <span className={`insp-prop-val${mono ? ' insp-prop-val--mono' : ''}`}>
        {value}
        {copyText && (
          <button
            className="insp-copy-btn"
            onClick={handleCopy}
            title={`Copy ${label}`}
          >📋</button>
        )}
      </span>
    </div>
  )
}

// ─── Property value renderer ──────────────────────────────────────────────────

function PropertyValue({ prop }: { prop: IFCProperty }) {
  const { value, unit } = prop

  if (value === null || value === undefined) {
    return <em className="insp-val-null">—</em>
  }

  if (typeof value === 'boolean') {
    return (
      <span className={`insp-bool-chip${value ? ' insp-bool-chip--yes' : ' insp-bool-chip--no'}`}>
        {value ? 'Yes' : 'No'}
      </span>
    )
  }

  if (typeof value === 'number') {
    return (
      <span className="insp-val-number">
        {value}
        {unit && <span className="insp-val-unit"> {unit}</span>}
      </span>
    )
  }

  const str = String(value)
  if (str === 'true')  return <span className="insp-bool-chip insp-bool-chip--yes">Yes</span>
  if (str === 'false') return <span className="insp-bool-chip insp-bool-chip--no">No</span>

  return <span className="insp-val-string">{str}{unit && <span className="insp-val-unit"> {unit}</span>}</span>
}

// ─── Pset section ────────────────────────────────────────────────────────────

interface PsetSectionProps {
  psetName:   string
  properties: IFCProperty[]
  isQto:      boolean
}

const PsetSection = memo(function PsetSection({ psetName, properties, isQto }: PsetSectionProps) {
  const [open, setOpen] = useState(true)

  return (
    <div className="insp-pset">
      <button
        className={`insp-pset-header${isQto ? ' insp-pset-header--qto' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className={`insp-chevron${open ? ' insp-chevron--open' : ''}`}>▶</span>
        <span className="insp-pset-name">{psetName}</span>
        <span className="insp-pset-count">({properties.length})</span>
      </button>

      {open && (
        <div className="insp-pset-body">
          {properties.map((p, i) => (
            <div className="insp-prop-row insp-prop-row--pset" key={`${p.name}-${i}`}>
              <span className="insp-prop-key insp-prop-key--pset">{p.name}</span>
              <span className="insp-prop-val insp-prop-val--pset">
                <PropertyValue prop={p} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

// ─── Activity card ────────────────────────────────────────────────────────────

function ActivityCard({ activity, status }: { activity: Activity; status: SimulationStatus }) {
  return (
    <div className="insp-activity-card">
      <div className="insp-activity-color" style={{ background: activity.color }} />
      <div className="insp-activity-info">
        <div className="insp-activity-name" style={{ color: activity.color }}>
          {activity.name}
        </div>
        <div className="insp-activity-dates">
          {activity.startDate} → {activity.endDate}
        </div>
        <div className="insp-activity-meta">
          {activity.linkedGlobalIds.length} element
          {activity.linkedGlobalIds.length !== 1 ? 's' : ''} ·{' '}
          <span className={`status-badge ${status}`}>{STATUS_LABEL[status]}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Main inspector ───────────────────────────────────────────────────────────

export default function IFCInspector() {
  // ── Selection state ────────────────────────────────────────
  const primaryGlobalId        = useSelectionStore(s => s.primaryGlobalId)
  const selectedGlobalIds      = useSelectionStore(s => s.selectedGlobalIds)
  const selectedActivityId     = useSelectionStore(s => s.selectedActivityId)

  // ── Domain data ───────────────────────────────────────────
  const getObjectByGlobalId    = useViewerStore(s => s.getObjectByGlobalId)
  const zoomToObject           = useViewerStore(s => s.zoomToObject)
  const isolateObjects         = useViewerStore(s => s.isolateObjects)
  const getActivitiesForObject = useActivityStore(s => s.getActivitiesForObject)
  const getActivityById        = useActivityStore(s => s.getActivityById)
  const getLayersForObject     = useLayerStore(s => s.getLayersForObject)
  const computeAllFrames       = useSimulationStore(s => s.computeAllFrames)
  const activities             = useActivityStore(s => s.activities)

  // ── Isolation toggle state ─────────────────────────────────
  // Tracks whether the current view is in isolation mode.
  const [isIsolated, setIsIsolated] = useState(false)

  const ifcObject: IFCObject | undefined | null = primaryGlobalId
    ? getObjectByGlobalId(primaryGlobalId)
    : null

  const linkedActivity: Activity | undefined = selectedActivityId
    ? getActivityById(selectedActivityId)
    : ifcObject
      ? getActivitiesForObject(ifcObject.globalId)[0]
      : undefined

  const assignedLayers = ifcObject ? getLayersForObject(ifcObject.globalId) : []

  const frames = computeAllFrames(activities)
  const status: SimulationStatus = ifcObject
    ? (frames.get(ifcObject.globalId)?.status ?? 'future')
    : 'future'

  // ── Group and sort property sets ──────────────────────────
  const { psetNames, psetMap } = useMemo(() => {
    if (!ifcObject) return { psetNames: [], psetMap: new Map<string, IFCProperty[]>() }

    const map = new Map<string, IFCProperty[]>()
    for (const prop of ifcObject.properties) {
      const arr = map.get(prop.set) ?? []
      arr.push(prop)
      map.set(prop.set, arr)
    }

    const names = Array.from(map.keys()).sort((a, b) => {
      const rank = (n: string) =>
        n === 'BaseQuantities'  ? 0 :
        n.startsWith('Qto_')   ? 1 :
        n.startsWith('Pset_')  ? 2 : 3
      return rank(a) - rank(b) || a.localeCompare(b)
    })

    return { psetNames: names, psetMap: map }
  }, [ifcObject])

  // ── Action handlers ───────────────────────────────────────

  const handleZoom = useCallback(() => {
    if (!ifcObject || !zoomToObject) return
    console.log('[IFCInspector] Zoom to', ifcObject.globalId)
    zoomToObject(ifcObject.globalId)
  }, [ifcObject, zoomToObject])

  const handleIsolate = useCallback(() => {
    if (!ifcObject || !isolateObjects) return

    if (isIsolated) {
      // Second press — restore full visibility
      console.log('[IFCInspector] Restore visibility (end isolation)')
      isolateObjects([])
      setIsIsolated(false)
    } else {
      // First press — isolate the selected objects
      // If multiple objects are selected, isolate all of them
      const targets = selectedGlobalIds.size > 1
        ? Array.from(selectedGlobalIds)
        : [ifcObject.globalId]
      console.log('[IFCInspector] Isolate', targets)
      isolateObjects(targets)
      setIsIsolated(true)
    }
  }, [ifcObject, isolateObjects, isIsolated, selectedGlobalIds])

  // Reset isolation state when selection changes
  // so the button label stays consistent
  const prevGlobalId = primaryGlobalId
  if (isIsolated && prevGlobalId !== primaryGlobalId) {
    setIsIsolated(false)
  }

  // ── Empty state ───────────────────────────────────────────
  if (!ifcObject) {
    return (
      <div className="insp-empty">
        <div className="insp-empty-icon">🏗</div>
        <p className="insp-empty-text">
          Select an element in the 3D viewer<br />
          or click a task in the Gantt chart
        </p>
      </div>
    )
  }

  const typeIcon = ifcTypeIcon(ifcObject.type)

  return (
    <div className="insp-body">

      {/* ── Element Header ───────────────────────────────────── */}
      <div className="insp-header-card">
        <div className="insp-header-icon">{typeIcon}</div>
        <div className="insp-header-info">
          <div className="insp-header-name">{ifcObject.name}</div>
          <div className="insp-header-type">
            <span className="insp-type-chip">{ifcObject.type}</span>
            <span className={`status-badge ${status}`}>{STATUS_LABEL[status]}</span>
          </div>
        </div>
      </div>

      {/* ── Identity Data ─────────────────────────────────────── */}
      <Section title="Identity Data" defaultOpen={true}>
        <PropRow
          label="Global ID"
          value={
            <span className="insp-val-guid" title={ifcObject.globalId}>
              {ifcObject.globalId}
            </span>
          }
          copyText={ifcObject.globalId}
          mono
        />
        <PropRow label="Name"     value={ifcObject.name || <em className="insp-val-null">—</em>} />
        <PropRow label="IFC Type" value={<span className="insp-type-chip">{ifcObject.type}</span>} />
        {ifcObject.expressId !== undefined && (
          <PropRow label="Express ID" value={ifcObject.expressId} mono />
        )}
        {ifcObject.objectType && (
          <PropRow label="Object Type" value={ifcObject.objectType} />
        )}
        {ifcObject.predefinedType && (
          <PropRow label="Predefined Type" value={ifcObject.predefinedType} />
        )}
        {ifcObject.tag && (
          <PropRow label="Tag" value={ifcObject.tag} mono />
        )}
        {ifcObject.description && (
          <PropRow label="Description" value={ifcObject.description} />
        )}
      </Section>

      {/* ── Property Sets ─────────────────────────────────────── */}
      {psetNames.length > 0 && (
        <Section
          title="Property Sets"
          defaultOpen={true}
          badge={psetNames.length}
        >
          <div className="insp-psets">
            {psetNames.map(name => (
              <PsetSection
                key={name}
                psetName={name}
                properties={psetMap.get(name)!}
                isQto={name === 'BaseQuantities' || name.startsWith('Qto_')}
              />
            ))}
          </div>
        </Section>
      )}

      {/* ── Construction Activity ─────────────────────────────── */}
      {linkedActivity && (
        <Section title="Construction Activity" defaultOpen={true} accentColor="#E67E22">
          <ActivityCard activity={linkedActivity} status={status} />
        </Section>
      )}

      {/* ── Information Layers ────────────────────────────────── */}
      {assignedLayers.length > 0 && (
        <Section
          title="Information Layers"
          defaultOpen={true}
          badge={assignedLayers.length}
        >
          <div className="insp-layers">
            {assignedLayers.map(layer => (
              <div key={layer.id} className="insp-layer-row">
                <span className="insp-layer-dot" style={{ background: layer.color }} />
                <span className="insp-layer-name">{layer.name}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Quick Actions ─────────────────────────────────────── */}
      <div className="insp-actions">
        <button
          className="action-btn"
          onClick={handleZoom}
          disabled={!zoomToObject}
          title={zoomToObject ? 'Zoom camera to this element' : 'Viewer not ready'}
        >
          🔍 Zoom To
        </button>
        <button
          className={`action-btn${isIsolated ? ' action-btn--active' : ''}`}
          onClick={handleIsolate}
          disabled={!isolateObjects}
          title={
            !isolateObjects
              ? 'Viewer not ready'
              : isIsolated
                ? 'Restore full model visibility'
                : selectedGlobalIds.size > 1
                  ? `Isolate ${selectedGlobalIds.size} selected elements`
                  : 'Hide all other elements'
          }
        >
          {isIsolated ? '👁 Show All' : '💡 Isolate'}
        </button>
        <button
          className="action-btn"
          disabled={!linkedActivity}
          onClick={() => console.log('Show activity', linkedActivity?.id)}
        >
          📋 Activity
        </button>
      </div>

    </div>
  )
}