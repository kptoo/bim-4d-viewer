import { useState, useCallback, useRef } from 'react'
import { useLayerStore }                  from '../../store/layer.store'
import { useViewerStore }                 from '../../store/viewer.store'
import { useSelectionStore }              from '../../store/selection.store'
import {
  useLayers,
  useLayerCounts,
  useCreateLayer,
  useRenameLayer,
  useDeleteLayer,
}                                         from '../../hooks/useLayers'
import { useAssignLayer }                 from '../../hooks/useAssignments'
import { LAYER_CATEGORY_META }            from '../../types'
import type { LayerCategory, InformationLayer } from '../../types'

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

// ── Category-contextual placeholder text ──────────────────────────────────────

const CATEGORY_PLACEHOLDER: Record<string, string> = {
  'building-elements': 'Building element name…',
  'zones':             'Zone name (e.g. Floor 1, Apartment A101)…',
  'costs':             'Cost zone name…',
  'resources':         'Resource group name…',
  'quality':           'Quality zone name…',
  'waste':             'Waste zone name…',
  'safety':            'Safety zone name…',
  'coclass':           'CoClass zone name…',
  'ai-generated':      'AI-generated zone name…',
  'custom':            'Custom zone name…',
}

function categoryPlaceholder(category: string): string {
  return CATEGORY_PLACEHOLDER[category] ?? 'Zone name…'
}

// ── QuickAssignSection ────────────────────────────────────────────────────────
//
// Inline assignment UI embedded directly in ZonePanel.
//
// Reads the current selection from useSelectionStore (globally accessible —
// no prop drilling required). Receives zones and counts from ZonePanel so no
// duplicate React Query subscriptions are created.
//
// Uses the existing useAssignLayer() mutation — the same hook used by the
// Inspector's ZoneAssignWidget — so assignment logic is never duplicated.

interface QuickAssignSectionProps {
  zones:  InformationLayer[]
  counts: Map<string, number>
}

function QuickAssignSection({ zones, counts }: QuickAssignSectionProps) {
  // ── Selection state ────────────────────────────────────
  const primaryGlobalId     = useSelectionStore(s => s.primaryGlobalId)
  const selectedGlobalIds   = useSelectionStore(s => s.selectedGlobalIds)
  const getObjectByGlobalId = useViewerStore(s => s.getObjectByGlobalId)

  // ── Local UI state ────────────────────────────────────
  const [selectedZoneId, setSelectedZoneId] = useState<string>('')

  // ── Assignment mutation ───────────────────────────────
  const assignMutation = useAssignLayer()

  // ── Derived values ────────────────────────────────────
  const selectionCount = selectedGlobalIds.size
  const hasSelection   = selectionCount > 0
  const primaryObject  = primaryGlobalId ? getObjectByGlobalId(primaryGlobalId) : null
  const hasZones       = zones.length > 0

  // Keep selectedZoneId valid if the zone list changes underneath us
  const validZoneId = zones.find(z => z.id === selectedZoneId)
    ? selectedZoneId
    : (zones[0]?.id ?? '')

  const canAssign = hasSelection && validZoneId.length > 0

  const handleAssign = useCallback(() => {
    if (!canAssign) return
    const globalIds = Array.from(selectedGlobalIds)
    assignMutation.mutate(
      { layerId: validZoneId, globalIds },
      {
        onSuccess: () => {
          // Reset status after a short delay so the success message is visible
          setTimeout(() => assignMutation.reset(), 2000)
        },
      }
    )
  }, [canAssign, selectedGlobalIds, validZoneId, assignMutation])

  // ── Render ────────────────────────────────────────────

  return (
    <div className="zone-quick-assign">

      {/* Section header */}
      <div className="zone-quick-assign__title">
        ASSIGN TO ZONE
      </div>

      {/* Selection feedback */}
      <div className="zone-quick-assign__selection">
        {!hasSelection ? (
          <p className="zone-quick-assign__no-selection">
            No IFC object selected.{' '}
            <span className="zone-quick-assign__no-selection-hint">
              Select one or more objects in the viewer or tree.
            </span>
          </p>
        ) : selectionCount === 1 && primaryObject ? (
          <div className="zone-quick-assign__selected-info">
            <span className="zone-quick-assign__selected-label">Selected object</span>
            <span className="zone-quick-assign__selected-name" title={primaryObject.globalId}>
              {primaryObject.name?.trim() || primaryObject.type}
            </span>
            <span className="zone-quick-assign__selected-type">{primaryObject.type}</span>
          </div>
        ) : (
          <div className="zone-quick-assign__selected-info">
            <span className="zone-quick-assign__selected-label">Selected objects</span>
            <span className="zone-quick-assign__selected-name">
              {selectionCount} objects selected
            </span>
          </div>
        )}
      </div>

      {/* Zone picker + Assign button */}
      {hasZones ? (
        <div className="zone-quick-assign__controls">
          <select
            className="zone-quick-assign__select"
            value={validZoneId}
            onChange={e => {
              setSelectedZoneId(e.target.value)
              assignMutation.reset()
            }}
            disabled={!hasSelection || assignMutation.isPending}
            title="Choose a zone"
          >
            {zones.map(zone => {
              const count = counts.get(zone.id) ?? 0
              return (
                <option key={zone.id} value={zone.id}>
                  {zone.name}{count > 0 ? ` (${count})` : ''}
                </option>
              )
            })}
          </select>

          <button
            className="zone-quick-assign__btn"
            onClick={handleAssign}
            disabled={!canAssign || assignMutation.isPending}
            title={
              !hasSelection
                ? 'Select objects in the viewer first'
                : !validZoneId
                ? 'Choose a zone'
                : `Assign ${selectionCount} object${selectionCount !== 1 ? 's' : ''} to this zone`
            }
          >
            {assignMutation.isPending ? (
              <>
                <span className="zone-quick-assign__spinner" />
                Assigning…
              </>
            ) : (
              'Assign'
            )}
          </button>
        </div>
      ) : (
        <p className="zone-quick-assign__no-zones">
          Create a zone above to start assigning objects.
        </p>
      )}

      {/* Success / error feedback */}
      {assignMutation.isSuccess && (
        <div className="zone-quick-assign__success">
          ✓ {Array.from(selectedGlobalIds).length} object
          {Array.from(selectedGlobalIds).length !== 1 ? 's' : ''} assigned successfully
        </div>
      )}

      {assignMutation.isError && (
        <div className="zone-quick-assign__error">
          {(assignMutation.error as Error).message}
        </div>
      )}

    </div>
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

      <button
        className="zone-card__swatch"
        style={{ background: color }}
        title={isFiltered ? 'Remove from filter' : 'Filter by this zone'}
        onClick={() => onToggleFilter(id)}
        aria-pressed={isFiltered}
      />

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

      <span
        className="zone-card__count"
        title={`${count} assigned element${count !== 1 ? 's' : ''}`}
      >
        {count}
      </span>

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
  category:         LayerCategory
  onCategoryChange: (category: LayerCategory) => void
  onSubmit:         (name: string, category: LayerCategory, color: string) => void
  isLoading:        boolean
}

function CreateZoneForm({
  category,
  onCategoryChange,
  onSubmit,
  isLoading,
}: CreateZoneFormProps) {
  const [name,  setName]  = useState('')
  const [color, setColor] = useState(randomColor)

  const meta        = categoryMeta(category)
  const heading     = meta.label.toUpperCase()
  const placeholder = categoryPlaceholder(category)

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit(trimmed, category, color)
    setName('')
    setColor(randomColor())
  }

  return (
    <div className="zone-create-form">
      <div className="zone-create-form__title">{heading}</div>

      <div className="zone-create-form__row">
        <input
          className="zone-create-form__name"
          type="text"
          placeholder={placeholder}
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
          onChange={e => onCategoryChange(e.target.value as LayerCategory)}
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

  const isolateObjects  = useViewerStore(s => s.isolateObjects)
  const ifcObjects      = useViewerStore(s => s.ifcObjects)
  const assignments     = useLayerStore(s => s.assignments)

  const [selectedCategory, setSelectedCategory] = useState<LayerCategory>('zones')

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

  const handleShowOnly = useCallback((zoneId: string) => {
    if (!isolateObjects) return
    const globalIds = assignments
      .filter(a => a.layerId === zoneId)
      .map(a => a.globalId)
    isolateObjects(globalIds)
  }, [isolateObjects, assignments])

  const selectedMeta = categoryMeta(selectedCategory)
  const emptyTitle   = `No ${selectedMeta.label} zones yet`
  const emptyHint    = `Create your first ${selectedMeta.label} zone above, then select elements in the 3D viewer and assign them using the section below.`

  const zoneList = zones ?? []

  return (
    <div className="zone-panel">

      {/* ── STICKY: header + create form + assign section ──── */}
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

        {/* Zone creation */}
        <CreateZoneForm
          category={selectedCategory}
          onCategoryChange={setSelectedCategory}
          onSubmit={handleCreate}
          isLoading={createMutation.isPending}
        />

        {createMutation.isError && (
          <div className="zone-error">
            Failed to create zone: {(createMutation.error as Error).message}
          </div>
        )}

        {/*
          Assign Selected to Zone.
          Passes zones + counts already fetched above — no extra queries.
          Selection is read from the global selection store inside QuickAssignSection.
        */}
        <QuickAssignSection zones={zoneList} counts={counts} />

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
                <div className="zone-empty__icon">{selectedMeta.icon}</div>
                <p className="zone-empty__title">{emptyTitle}</p>
                <p className="zone-empty__hint">{emptyHint}</p>
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