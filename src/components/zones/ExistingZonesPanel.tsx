import { useState, useCallback, useRef } from 'react'
import { useLayerStore }                  from '../../store/layer.store'
import { useViewerStore }                 from '../../store/viewer.store'
import {
  useLayers,
  useLayerCounts,
  useRenameLayer,
  useDeleteLayer,
}                                         from '../../hooks/useLayers'
import { LAYER_CATEGORY_META }            from '../../types'
import type { InformationLayer }          from '../../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function categoryMeta(category: string) {
  return (
    LAYER_CATEGORY_META.find(m => m.value === category) ??
    { value: category, label: category, icon: '🏷️' }
  )
}

// ── ZoneDetailPanel ───────────────────────────────────────────────────────────
//
// Shown when the user clicks a zone row.
// Provides: filter, isolate, rename, delete.
// No assignment controls here — those live in IFCInspector.

interface ZoneDetailPanelProps {
  zone:           InformationLayer
  count:          number
  isFiltered:     boolean
  onClose:        () => void
  onToggleFilter: (id: string) => void
  onIsolate:      (id: string) => void
  onDelete:       (id: string) => void
  onRename:       (id: string, name: string) => void
}

function ZoneDetailPanel({
  zone, count, isFiltered,
  onClose, onToggleFilter, onIsolate, onDelete, onRename,
}: ZoneDetailPanelProps) {
  const [editing,  setEditing]  = useState(false)
  const [editName, setEditName] = useState(zone.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const meta = categoryMeta(zone.category)

  const startEdit  = () => {
    setEditName(zone.name)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }
  const commitEdit = () => {
    const t = editName.trim()
    if (t && t !== zone.name) onRename(zone.id, t)
    setEditing(false)
  }
  const cancelEdit = () => { setEditName(zone.name); setEditing(false) }

  return (
    <div className="ezp-detail">

      {/* ── Detail header ──────────────────────────────────── */}
      <div className="ezp-detail__header">
        <div className="ezp-detail__swatch" style={{ background: zone.color }} />
        <div className="ezp-detail__title-col">
          {editing ? (
            <input
              ref={inputRef}
              className="ezp-detail__rename-input"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => {
                if (e.key === 'Enter')  commitEdit()
                if (e.key === 'Escape') cancelEdit()
              }}
            />
          ) : (
            <span className="ezp-detail__name">{zone.name}</span>
          )}
          <span className="ezp-detail__meta">
            {meta.icon} {meta.label} · {count} object{count !== 1 ? 's' : ''}
          </span>
        </div>
        <button className="ezp-detail__close" onClick={onClose} title="Close detail">✕</button>
      </div>

      {/* ── Actions ────────────────────────────────────────── */}
      <div className="ezp-detail__actions">
        <button
          className={`ezp-detail__action-btn${isFiltered ? ' ezp-detail__action-btn--active' : ''}`}
          onClick={() => onToggleFilter(zone.id)}
          title={isFiltered ? 'Remove zone filter' : 'Filter model by this zone'}
        >
          <span className="ezp-detail__action-icon">{isFiltered ? '✓' : '🔍'}</span>
          {isFiltered ? 'Filtered' : 'Filter'}
        </button>

        <button
          className="ezp-detail__action-btn"
          onClick={() => onIsolate(zone.id)}
          title="Show only elements in this zone"
        >
          <span className="ezp-detail__action-icon">◎</span>
          Isolate
        </button>

        <button
          className="ezp-detail__action-btn"
          onClick={startEdit}
          title="Rename this zone"
        >
          <span className="ezp-detail__action-icon">✎</span>
          Rename
        </button>

        <button
          className="ezp-detail__action-btn ezp-detail__action-btn--danger"
          onClick={() => onDelete(zone.id)}
          title="Delete this zone"
        >
          <span className="ezp-detail__action-icon">✕</span>
          Delete
        </button>
      </div>

    </div>
  )
}

// ── ZoneRow ───────────────────────────────────────────────────────────────────

interface ZoneRowProps {
  zone:       InformationLayer
  count:      number
  isFiltered: boolean
  isSelected: boolean
  onClick:    (id: string) => void
}

function ZoneRow({ zone, count, isFiltered, isSelected, onClick }: ZoneRowProps) {
  const meta = categoryMeta(zone.category)
  return (
    <button
      className={[
        'ezp-zone-row',
        isSelected ? 'ezp-zone-row--selected' : '',
        isFiltered ? 'ezp-zone-row--filtered' : '',
      ].filter(Boolean).join(' ')}
      onClick={() => onClick(zone.id)}
      title={`${zone.name} · ${count} objects`}
    >
      <span className="ezp-zone-row__swatch" style={{ background: zone.color }} />
      <span className="ezp-zone-row__body">
        <span className="ezp-zone-row__name">{zone.name}</span>
        <span className="ezp-zone-row__sub">{meta.icon} {meta.label}</span>
      </span>
      <span className="ezp-zone-row__count">{count}</span>
      {isSelected && <span className="ezp-zone-row__chevron">▾</span>}
    </button>
  )
}

// ── ExistingZonesPanel ────────────────────────────────────────────────────────

export default function ExistingZonesPanel() {
  const { data: zones, isLoading, isError, error } = useLayers()
  const { data: counts = new Map<string, number>() } = useLayerCounts()

  const renameMutation = useRenameLayer()
  const deleteMutation = useDeleteLayer()

  const activeFilterIds = useLayerStore(s => s.activeFilterIds)
  const toggleFilter    = useLayerStore(s => s.toggleFilter)
  const clearFilters    = useLayerStore(s => s.clearFilters)
  const isolateObjects  = useViewerStore(s => s.isolateObjects)
  const assignments     = useLayerStore(s => s.assignments)

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)

  const zoneList     = zones ?? []
  const selectedZone = selectedZoneId ? zoneList.find(z => z.id === selectedZoneId) ?? null : null

  const handleRowClick = useCallback((id: string) => {
    setSelectedZoneId(prev => prev === id ? null : id)
  }, [])

  const handleIsolate = useCallback((zoneId: string) => {
    if (!isolateObjects) return
    isolateObjects(assignments.filter(a => a.layerId === zoneId).map(a => a.globalId))
  }, [isolateObjects, assignments])

  const handleRename = useCallback((id: string, newName: string) => {
    renameMutation.mutate({ id, newName })
  }, [renameMutation])

  const handleDelete = useCallback((id: string) => {
    deleteMutation.mutate(id)
    if (selectedZoneId === id) setSelectedZoneId(null)
  }, [deleteMutation, selectedZoneId])

  return (
    <div className="ezp-panel">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="ezp-panel__header">
        <span className="ezp-panel__title">Existing Zones</span>
        <div className="ezp-panel__header-right">
          {zoneList.length > 0 && (
            <span className="ezp-panel__total">{zoneList.length}</span>
          )}
          {activeFilterIds.length > 0 && (
            <button
              className="ezp-panel__clear-btn"
              onClick={clearFilters}
              title="Clear all filters"
            >
              Clear Filters ({activeFilterIds.length})
            </button>
          )}
        </div>
      </div>

      {/*
        ── Contextual hint ────────────────────────────────────────────────────
        Replaces the old SelectionSummary + assignment controls.
        Directs users to Inspector for assignment — one clear sentence is
        enough; the Inspector tab is always visible in the panel header.
      */}
      <div className="ezp-panel__hint">
        <span className="ezp-panel__hint-icon">💡</span>
        <span>
          To assign elements to a zone, select them in the viewer and use the
          <strong> Inspector → Zone Assignment</strong> section.
        </span>
      </div>

      {/* ── Zone list ──────────────────────────────────────── */}
      <div className="ezp-panel__scroll">

        {isLoading && (
          <div className="ezp-state">
            <div className="upload-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            <span>Loading zones…</span>
          </div>
        )}

        {isError && (
          <div className="ezp-error">{(error as Error).message}</div>
        )}

        {!isLoading && !isError && zoneList.length === 0 && (
          <div className="ezp-empty">
            <div className="ezp-empty__icon">📋</div>
            <p className="ezp-empty__title">No zones created yet</p>
            <p className="ezp-empty__hint">
              Switch to the <strong>Zones</strong> tab to create your first zone.
            </p>
          </div>
        )}

        {!isLoading && !isError && zoneList.map(zone => (
          <div key={zone.id}>
            <ZoneRow
              zone={zone}
              count={counts.get(zone.id) ?? 0}
              isFiltered={activeFilterIds.includes(zone.id)}
              isSelected={selectedZoneId === zone.id}
              onClick={handleRowClick}
            />
            {selectedZoneId === zone.id && selectedZone && (
              <ZoneDetailPanel
                zone={selectedZone}
                count={counts.get(selectedZone.id) ?? 0}
                isFiltered={activeFilterIds.includes(selectedZone.id)}
                onClose={() => setSelectedZoneId(null)}
                onToggleFilter={toggleFilter}
                onIsolate={handleIsolate}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            )}
          </div>
        ))}

      </div>

      {/* ── Active filter footer ─────────────────────────────── */}
      {activeFilterIds.length > 0 && (
        <div className="ezp-filter-bar">
          🔍 {activeFilterIds.length} zone filter{activeFilterIds.length !== 1 ? 's' : ''} active
          <button className="ezp-filter-bar__clear" onClick={clearFilters}>Clear</button>
        </div>
      )}

    </div>
  )
}