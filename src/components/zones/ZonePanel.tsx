import { useState, useCallback, useRef } from 'react'
import { useLayerStore }                  from '../../store/layer.store'
import { useViewerStore }                 from '../../store/viewer.store'
import {
  useLayers,
  useLayerCounts,
  useCreateLayer,
  useRenameLayer,
  useDeleteLayer,
}                                         from '../../hooks/useLayers'
import { LAYER_CATEGORY_META }            from '../../types'
import type { LayerCategory }             from '../../types'

// ── Colour palette for quick picks ───────────────────────────────────────────

const PALETTE = [
  '#3498DB', '#2ECC71', '#E74C3C', '#F39C12', '#9B59B6',
  '#1ABC9C', '#E67E22', '#E91E63', '#00BCD4', '#8BC34A',
  '#FF5722', '#607D8B', '#795548', '#9E9E9E', '#CDDC39',
]

function randomColor(): string {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)]
}

// ── Zone category display ─────────────────────────────────────────────────────

function categoryMeta(category: string) {
  return (
    LAYER_CATEGORY_META.find(m => m.value === category) ??
    { value: category, label: category, icon: '🏷️' }
  )
}

// ── ZoneCard ──────────────────────────────────────────────────────────────────

interface ZoneCardProps {
  id:          string
  name:        string
  color:       string
  category:    string
  count:       number
  isFiltered:  boolean
  onToggleFilter:   (id: string) => void
  onShowOnly:       (id: string) => void
  onDelete:         (id: string) => void
  onRename:         (id: string, name: string) => void
}

function ZoneCard({
  id, name, color, category, count, isFiltered,
  onToggleFilter, onShowOnly, onDelete, onRename,
}: ZoneCardProps) {
  const [editing,  setEditing]  = useState(false)
  const [editName, setEditName] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)

  const meta = categoryMeta(category)

  const startEdit = () => {
    setEditName(name)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commitEdit = () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== name) onRename(id, trimmed)
    setEditing(false)
  }

  const cancelEdit = () => { setEditName(name); setEditing(false) }

  return (
    <div className={`zone-card${isFiltered ? ' zone-card--filtered' : ''}`}>

      {/* Color swatch — click to toggle filter */}
      <button
        className="zone-card__swatch"
        style={{ background: color }}
        title={isFiltered ? 'Remove from filter' : 'Filter by this zone'}
        onClick={() => onToggleFilter(id)}
        aria-pressed={isFiltered}
      />

      {/* Main body */}
      <div className="zone-card__body" onDoubleClick={startEdit}>
        {editing ? (
          <input
            ref={inputRef}
            className="zone-card__name-input"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => {
              if (e.key === 'Enter')  commitEdit()
              if (e.key === 'Escape') cancelEdit()
            }}
          />
        ) : (
          <span className="zone-card__name" title="Double-click to rename">{name}</span>
        )}
        <span className="zone-card__category">
          {meta.icon} {meta.label}
        </span>
      </div>

      {/* Element count */}
      <span
        className="zone-card__count"
        title={`${count} assigned element${count !== 1 ? 's' : ''}`}
      >
        {count}
      </span>

      {/* Action strip — shown on hover */}
      <div className="zone-card__actions">
        <button
          className={`zone-card__action-btn${isFiltered ? ' zone-card__action-btn--active' : ''}`}
          title={isFiltered ? 'Clear filter' : 'Filter by this zone'}
          onClick={() => onToggleFilter(id)}
        >
          {isFiltered ? '✓ Filtered' : 'Filter'}
        </button>
        <button
          className="zone-card__action-btn zone-card__action-btn--isolate"
          title="Show only elements in this zone"
          onClick={() => onShowOnly(id)}
        >
          Isolate
        </button>
        <button
          className="zone-card__action-btn zone-card__action-btn--delete"
          title="Delete zone"
          onClick={() => onDelete(id)}
          aria-label={`Delete zone ${name}`}
        >
          ✕
        </button>
      </div>

    </div>
  )
}

// ── CreateZoneForm ─────────────────────────────────────────────────────────────

interface CreateZoneFormProps {
  onSubmit:  (name: string, category: LayerCategory, color: string) => void
  isLoading: boolean
}

function CreateZoneForm({ onSubmit, isLoading }: CreateZoneFormProps) {
  const [name,     setName]     = useState('')
  const [category, setCategory] = useState<LayerCategory>('zones')
  const [color,    setColor]    = useState(randomColor)

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit(trimmed, category, color)
    setName('')
    setColor(randomColor())
  }

  return (
    <div className="zone-create-form">
      <div className="zone-create-form__title">New Zone</div>

      <div className="zone-create-form__row">
        <input
          className="zone-create-form__name"
          type="text"
          placeholder="Zone name (e.g. Floor 1, Apartment A101…)"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          maxLength={80}
        />
        <input
          type="color"
          className="zone-create-form__color"
          value={color}
          onChange={e => setColor(e.target.value)}
          title="Choose zone color"
        />
      </div>

      <div className="zone-create-form__row">
        <select
          className="zone-create-form__category"
          value={category}
          onChange={e => setCategory(e.target.value as LayerCategory)}
        >
          {LAYER_CATEGORY_META.map(m => (
            <option key={m.value} value={m.value}>
              {m.icon} {m.label}
            </option>
          ))}
        </select>
        <button
          className="zone-create-form__btn"
          onClick={handleSubmit}
          disabled={isLoading || !name.trim()}
        >
          {isLoading ? '…' : '＋ Create Zone'}
        </button>
      </div>
    </div>
  )
}

// ── ZonePanel ──────────────────────────────────────────────────────────────────

export default function ZonePanel() {
  const { data: zones, isLoading, isError, error } = useLayers()
  const { data: counts = new Map<string, number>() }  = useLayerCounts()

  const createMutation = useCreateLayer()
  const renameMutation = useRenameLayer()
  const deleteMutation = useDeleteLayer()

  const activeFilterIds = useLayerStore(s => s.activeFilterIds)
  const toggleFilter    = useLayerStore(s => s.toggleFilter)
  const clearFilters    = useLayerStore(s => s.clearFilters)

  // For "Show Only" / "Isolate" we reach into viewer store
  const isolateObjects  = useViewerStore(s => s.isolateObjects)
  const ifcObjects      = useViewerStore(s => s.ifcObjects)
  const assignments     = useLayerStore(s => s.assignments)

  const handleCreate = useCallback((
    name: string, category: LayerCategory, color: string,
  ) => {
    createMutation.mutate({ payload: { name, category, color, description: null } })
  }, [createMutation])

  const handleRename = useCallback((id: string, newName: string) => {
    renameMutation.mutate({ id, newName })
  }, [renameMutation])

  const handleDelete = useCallback((id: string) => {
    deleteMutation.mutate(id)
  }, [deleteMutation])

  /**
   * "Show Only" — isolate the zone's elements in the 3D viewport.
   * Resolves the zone's globalIds from assignments, then calls isolateObjects().
   */
  const handleShowOnly = useCallback((zoneId: string) => {
    if (!isolateObjects) return
    // Collect GlobalIds assigned to this zone
    const globalIds = assignments
      .filter(a => a.layerId === zoneId)
      .map(a => a.globalId)
    isolateObjects(globalIds)
  }, [isolateObjects, assignments])

  const zoneList = zones ?? []

  return (
    <div className="zone-panel">

      {/* ── STICKY: header + create form ─────────────────────── */}
      <div className="zone-panel__sticky">

        <div className="zone-panel__header">
          <span className="zone-panel__title">Zones</span>
          {activeFilterIds.length > 0 && (
            <button
              className="zone-panel__clear-btn"
              onClick={clearFilters}
              title="Clear all zone filters"
            >
              Clear Filters ({activeFilterIds.length})
            </button>
          )}
        </div>

        <CreateZoneForm
          onSubmit={handleCreate}
          isLoading={createMutation.isPending}
        />

        {createMutation.isError && (
          <div className="zone-error">
            Failed to create zone: {(createMutation.error as Error).message}
          </div>
        )}
      </div>

      {/* ── SCROLL: zone cards ────────────────────────────────── */}
      <div className="zone-panel__scroll">

        {isLoading && (
          <div className="zone-loading">
            <div className="upload-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
            <span>Loading zones…</span>
          </div>
        )}

        {isError && (
          <div className="zone-error">
            {(error as Error).message}
          </div>
        )}

        {!isLoading && !isError && (
          <div className="zone-list">
            {zoneList.length === 0 ? (
              <div className="zone-empty">
                <div className="zone-empty__icon">📐</div>
                <p className="zone-empty__title">No zones yet</p>
                <p className="zone-empty__hint">
                  Create a zone above, then select elements in the 3D viewer
                  and assign them using the Inspector panel.
                </p>
              </div>
            ) : (
              zoneList.map(zone => (
                <ZoneCard
                  key={zone.id}
                  id={zone.id}
                  name={zone.name}
                  color={zone.color}
                  category={zone.category}
                  count={counts.get(zone.id) ?? 0}
                  isFiltered={activeFilterIds.includes(zone.id)}
                  onToggleFilter={toggleFilter}
                  onShowOnly={handleShowOnly}
                  onDelete={handleDelete}
                  onRename={handleRename}
                />
              ))
            )}
          </div>
        )}

        {activeFilterIds.length > 0 && (
          <div className="zone-filter-indicator">
            🔍 Filtering by {activeFilterIds.length} zone{activeFilterIds.length !== 1 ? 's' : ''}
            {' '}·{' '}
            {ifcObjects.filter(o =>
              activeFilterIds.every(id => o.layerIds.includes(id))
            ).length} elements visible
          </div>
        )}

      </div>

    </div>
  )
}