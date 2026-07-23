/**
 * ExistingZonesPanel.tsx — Zone list with filter, isolate, rename, and delete actions.
 *
 * Phase 6 Zone UX fixes:
 *
 * 1. **Clear Filters buttons now also call `isolateObjects([])`.**
 *    Previously, clicking "Clear Filters" in the panel header or the
 *    `ezp-filter-bar` footer only called `clearFilters()`. This cleared the
 *    filter chips but left the 3D viewport in its filtered (partially hidden)
 *    state, because `isolateObjects([])` was never called. The user saw the
 *    UI reset but the model stayed partially hidden — confusing.
 *
 * 2. **`handleIsolate` now also calls `toggleFilter(zoneId)` when isolating.**
 *    When a user clicks "Isolate" on a zone, the model hides everything except
 *    that zone's objects. Previously this was done entirely via `isolateObjects`
 *    without touching `activeFilterIds`. So the ZoneFilterBar (which shows
 *    active filters as chips) remained empty — giving no indication that a zone
 *    was controlling visibility. Now `toggleFilter` is also called, which:
 *    - Makes the ZoneFilterBar appear with the zone chip (visual feedback).
 *    - Means clicking the chip's ✕ or "Clear all" correctly exits isolation too.
 *    - Keeps filter state and visibility state in sync.
 *
 * 3. **`Esc` hints** added to the "Clear Filters" button matching the
 *    object-selection UX convention, so users discover the keyboard shortcut.
 *
 * @module ExistingZonesPanel
 */

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

  /**
   * Isolate a zone: show only its objects in the 3D viewport AND activate
   * the zone as a filter chip so the ZoneFilterBar appears and the user can
   * see what is active and clear it from there.
   *
   * Phase 6 fix: previously only `isolateObjects` was called here, leaving
   * `activeFilterIds` empty. Now `toggleFilter` is also called so that:
   * - The ZoneFilterBar becomes visible (provides visual feedback).
   * - Clicking the ZoneFilterBar's "Clear all" or the zone chip's ✕ exits
   *   isolation — because both now call `clearFilters` + `isolateObjects([])`.
   * - The panel header's "Clear Filters" button also appears and works.
   *
   * If the zone is already in `activeFilterIds` (was filtered before isolate),
   * we don't toggle it twice — the guard prevents the chip from disappearing.
   */
  const handleIsolate = useCallback((zoneId: string) => {
    if (!isolateObjects) return

    // Isolate in the 3D viewport
    const globalIds = assignments
      .filter(a => a.layerId === zoneId)
      .map(a => a.globalId)
    isolateObjects(globalIds)

    // Also activate the filter chip if not already active, so the
    // ZoneFilterBar appears and the user can clear it from there
    if (!activeFilterIds.includes(zoneId)) {
      toggleFilter(zoneId)
    }
  }, [isolateObjects, assignments, activeFilterIds, toggleFilter])

  const handleRename = useCallback((id: string, newName: string) => {
    renameMutation.mutate({ id, newName })
  }, [renameMutation])

  const handleDelete = useCallback((id: string) => {
    deleteMutation.mutate(id)
    if (selectedZoneId === id) setSelectedZoneId(null)
  }, [deleteMutation, selectedZoneId])

  /**
   * Full reset: clear the filter store AND restore 3D visibility.
   *
   * Phase 6 fix: previously this only called `clearFilters()` without
   * `isolateObjects([])`. Objects hidden by "Isolate" stayed hidden even
   * after the filter chips disappeared. Now both are always called together.
   */
  const handleClearAll = useCallback(() => {
    clearFilters()
    isolateObjects?.([])
  }, [clearFilters, isolateObjects])

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
              onClick={handleClearAll}
              title="Clear all zone filters and restore full model visibility (Escape)"
            >
              Clear Filters ({activeFilterIds.length})
            </button>
          )}
        </div>
      </div>

      {/* ── Contextual hint ──────────────────────────────────── */}
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
          <button
            className="ezp-filter-bar__clear"
            onClick={handleClearAll}
            title="Clear all zone filters and restore full model (Escape)"
          >
            Clear
          </button>
          <kbd style={{
            background:    'rgba(255,255,255,0.07)',
            border:        '1px solid rgba(255,255,255,0.15)',
            borderRadius:  3,
            fontSize:      9,
            marginLeft:    4,
            padding:       '1px 4px',
            color:         'var(--text-secondary)',
            fontFamily:    'ui-monospace, monospace',
          }}>Esc</kbd>
        </div>
      )}

    </div>
  )
}