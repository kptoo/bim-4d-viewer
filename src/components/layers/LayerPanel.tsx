/**
 * LayerPanel — Information Layers management panel.
 *
 * Responsibilities:
 * - Displays all information layers from the database.
 * - Allows creating, renaming, color-editing, and deleting layers.
 * - Allows toggling layer filters (shows only assigned objects in the viewer).
 * - Shows assignment counts per layer.
 * - Handles loading, empty, and error states.
 *
 * Layout:
 * - A sticky header area contains the title, optional clear-filter button,
 *   and the create-layer form.
 * - A scrollable area below contains the list of existing layers.
 *
 * Performance:
 * - LayerRow is memoised to prevent full-list re-renders on single-layer edits.
 * - useCallback stabilises all handler references passed to child components.
 *
 * @module LayerPanel
 */

import { useState, useCallback, useRef, memo } from 'react'
import { useLayerStore }                        from '../../store/layer.store'
import {
  useLayers,
  useLayerCounts,
  useCreateLayer,
  useRenameLayer,
  useUpdateLayerColor,
  useDeleteLayer,
}                                               from '../../hooks/useLayers'
import { LAYER_CATEGORY_META }                  from '../../types'
import { LoadingSpinner }                        from '../ui/LoadingSpinner'
import { EmptyState }                            from '../ui/EmptyState'
import { ErrorMessage }                          from '../ui/ErrorMessage'
import type { LayerCategory }                   from '../../types'

// ── Color palette ─────────────────────────────────────────────────────────────

const PALETTE = [
  '#3498DB', '#2ECC71', '#E74C3C', '#F39C12', '#9B59B6',
  '#1ABC9C', '#E67E22', '#E91E63', '#00BCD4', '#8BC34A',
]

function randomColor(): string {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)]
}

// ── LayerRow ──────────────────────────────────────────────────────────────────

interface LayerRowProps {
  id:       string
  name:     string
  color:    string
  category: string
  count:    number
  isActive: boolean
  onToggle:      (id: string) => void
  onDelete:      (id: string) => void
  onRename:      (id: string, name: string) => void
  onColorChange: (id: string, color: string) => void
}

/**
 * A single layer row with inline rename, color picker, filter toggle, and delete.
 * Memoised to avoid re-rendering the entire list when other layers change.
 */
const LayerRow = memo(function LayerRow({
  id, name, color, category, count, isActive,
  onToggle, onDelete, onRename, onColorChange,
}: LayerRowProps) {
  const [editing,  setEditing]  = useState(false)
  const [editName, setEditName] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)

  const meta = LAYER_CATEGORY_META.find(m => m.value === category)

  const startEdit = useCallback(() => {
    setEditName(name)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }, [name])

  const commitEdit = useCallback(() => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== name) onRename(id, trimmed)
    setEditing(false)
  }, [editName, id, name, onRename])

  const cancelEdit = useCallback(() => {
    setEditName(name)
    setEditing(false)
  }, [name])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter')  commitEdit()
    if (e.key === 'Escape') cancelEdit()
  }, [commitEdit, cancelEdit])

  const handleToggle = useCallback(() => onToggle(id),  [id, onToggle])
  const handleDelete = useCallback(() => onDelete(id),  [id, onDelete])
  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onColorChange(id, e.target.value),
    [id, onColorChange]
  )

  return (
    <div
      className={`layer-row${isActive ? ' layer-row--active' : ''}`}
      role="row"
      aria-label={`Layer: ${name}`}
    >
      {/* Color swatch / filter toggle */}
      <button
        className="layer-swatch"
        style={{ background: color }}
        title={isActive ? 'Remove from filter' : 'Filter by this layer'}
        onClick={handleToggle}
        aria-pressed={isActive}
        aria-label={`${isActive ? 'Deactivate' : 'Activate'} filter for ${name}`}
      />

      {/* Name + category */}
      <div className="layer-row__body" onDoubleClick={startEdit} title="Double-click to rename">
        {editing ? (
          <input
            ref={inputRef}
            className="layer-row__input"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            maxLength={80}
            aria-label="Rename layer"
          />
        ) : (
          <span className="layer-row__name">{name}</span>
        )}
        <span className="layer-row__meta">
          {meta?.icon ?? '🏷️'} {meta?.label ?? category}
        </span>
      </div>

      {/* Assignment count badge */}
      <span
        className="layer-count-badge"
        title={`${count} assigned element${count !== 1 ? 's' : ''}`}
        aria-label={`${count} elements`}
      >
        {count}
      </span>

      {/* Color picker (compact) */}
      <input
        type="color"
        className="layer-color-picker"
        value={color}
        onChange={handleColorChange}
        title="Change layer color"
        aria-label={`Change color for ${name}`}
      />

      {/* Delete button */}
      <button
        className="layer-delete-btn"
        title="Delete layer"
        onClick={handleDelete}
        aria-label={`Delete layer ${name}`}
      >
        ✕
      </button>
    </div>
  )
})

// ── CreateForm ────────────────────────────────────────────────────────────────

interface CreateFormProps {
  onSubmit:  (name: string, category: LayerCategory, color: string) => void
  isLoading: boolean
}

/**
 * Inline form for creating a new information layer.
 * Resets after successful submission so it's ready for the next layer.
 */
function CreateForm({ onSubmit, isLoading }: CreateFormProps) {
  const [name,     setName]     = useState('')
  const [category, setCategory] = useState<LayerCategory>('custom')
  const [color,    setColor]    = useState(randomColor)

  const handleSubmit = useCallback(() => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit(trimmed, category, color)
    setName('')
    setColor(randomColor())
  }, [name, category, color, onSubmit])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
  }, [handleSubmit])

  return (
    <div className="layer-create-form">
      <div className="layer-create-form__row">
        <input
          className="layer-create-form__name"
          type="text"
          placeholder="Layer name…"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={80}
          disabled={isLoading}
          aria-label="New layer name"
        />
        <input
          type="color"
          className="layer-create-form__color"
          value={color}
          onChange={e => setColor(e.target.value)}
          title="Choose layer color"
          disabled={isLoading}
          aria-label="Choose layer color"
        />
      </div>
      <div className="layer-create-form__row">
        <select
          className="layer-create-form__category"
          value={category}
          onChange={e => setCategory(e.target.value as LayerCategory)}
          disabled={isLoading}
          aria-label="Layer category"
        >
          {LAYER_CATEGORY_META.map(m => (
            <option key={m.value} value={m.value}>
              {m.icon} {m.label}
            </option>
          ))}
        </select>
        <button
          className="layer-create-form__btn"
          onClick={handleSubmit}
          disabled={isLoading || !name.trim()}
          aria-label="Create layer"
        >
          {isLoading ? '…' : '+ Add Layer'}
        </button>
      </div>
    </div>
  )
}

// ── LayerPanel ─────────────────────────────────────────────────────────────────

/**
 * Main information layers panel component.
 *
 * State machine:
 *   loading  → LoadingSpinner in scroll area
 *   error    → ErrorMessage in scroll area
 *   empty    → EmptyState with hint
 *   populated → Scrollable list of LayerRow components
 *
 * The create form and filter controls always remain visible in the sticky
 * header zone, regardless of list state.
 */
export default function LayerPanel() {
  const { data: layers, isLoading, isError, error, refetch } = useLayers()
  const { data: counts = new Map<string, number>() }          = useLayerCounts()

  const createMutation      = useCreateLayer()
  const renameMutation      = useRenameLayer()
  const updateColorMutation = useUpdateLayerColor()
  const deleteMutation      = useDeleteLayer()

  const activeFilterIds = useLayerStore(s => s.activeFilterIds)
  const toggleFilter    = useLayerStore(s => s.toggleFilter)
  const clearFilters    = useLayerStore(s => s.clearFilters)

  const handleCreate = useCallback((
    name: string, category: LayerCategory, color: string,
  ) => {
    createMutation.mutate({ payload: { name, category, color, description: null } })
  }, [createMutation])

  const handleRename = useCallback((id: string, newName: string) => {
    renameMutation.mutate({ id, newName })
  }, [renameMutation])

  const handleColorChange = useCallback((id: string, color: string) => {
    updateColorMutation.mutate({ id, color })
  }, [updateColorMutation])

  const handleDelete = useCallback((id: string) => {
    deleteMutation.mutate(id)
  }, [deleteMutation])

  const handleRetry = useCallback(() => {
    void refetch()
  }, [refetch])

  // Show rename/delete mutation errors inline at the top of the list
  const mutationError =
    (renameMutation.isError    ? renameMutation.error    : null) ??
    (deleteMutation.isError    ? deleteMutation.error    : null) ??
    (updateColorMutation.isError ? updateColorMutation.error : null)

  return (
    <div className="layer-panel">

      {/* ── STICKY ZONE ──────────────────────────────────────────
          Always visible — title, filter count, create form.     */}
      <div className="layer-panel__sticky">

        <div className="layer-panel__header">
          <span className="layer-panel__title">Information Layers</span>
          {activeFilterIds.length > 0 && (
            <button
              className="layer-panel__clear-btn"
              onClick={clearFilters}
              title="Clear all layer filters"
            >
              Clear Filters ({activeFilterIds.length})
            </button>
          )}
        </div>

        <CreateForm
          onSubmit={handleCreate}
          isLoading={createMutation.isPending}
        />

        {/* Create mutation error */}
        {createMutation.isError && (
          <ErrorMessage
            compact
            message={`Failed to create layer: ${(createMutation.error as Error).message}`}
            context="LayerPanel.create"
          />
        )}

        {/* Rename / delete / color mutation errors */}
        {mutationError && (
          <ErrorMessage
            compact
            message={(mutationError as Error).message}
            context="LayerPanel.mutation"
          />
        )}

      </div>

      {/* ── SCROLL ZONE ──────────────────────────────────────────
          Independently scrollable list of existing layers.      */}
      <div className="layer-panel__scroll">

        {isLoading && (
          <LoadingSpinner message="Loading layers…" />
        )}

        {isError && !isLoading && (
          <ErrorMessage
            message={(error as Error)?.message ?? 'Failed to load layers'}
            context="LayerPanel"
            onRetry={handleRetry}
          />
        )}

        {!isLoading && !isError && (
          <div className="layer-list">
            {(layers ?? []).length === 0 ? (
              <EmptyState
                icon="🏷️"
                title="No Layers Yet"
                hint="Create your first information layer using the form above."
                compact
              />
            ) : (
              (layers ?? []).map(layer => (
                <LayerRow
                  key={layer.id}
                  id={layer.id}
                  name={layer.name}
                  color={layer.color}
                  category={layer.category}
                  count={counts.get(layer.id) ?? 0}
                  isActive={activeFilterIds.includes(layer.id)}
                  onToggle={toggleFilter}
                  onDelete={handleDelete}
                  onRename={handleRename}
                  onColorChange={handleColorChange}
                />
              ))
            )}
          </div>
        )}

        {activeFilterIds.length > 0 && !isLoading && !isError && (
          <div className="layer-filter-indicator">
            🔍 Filtering by {activeFilterIds.length} layer{activeFilterIds.length !== 1 ? 's' : ''}
          </div>
        )}

      </div>
    </div>
  )
}