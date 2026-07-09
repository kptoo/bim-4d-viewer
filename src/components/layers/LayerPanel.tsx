import { useState, useCallback, useRef } from 'react'
import { useLayerStore }                 from '../../store/layer.store'
import {
  useLayers,
  useLayerCounts,
  useCreateLayer,
  useRenameLayer,
  useDeleteLayer,
}                                        from '../../hooks/useLayers'
import { LAYER_CATEGORY_META }           from '../../types'
import type { LayerCategory }            from '../../types'

// ── Default color palette ──────────────────────────────────────────────────────

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
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
}

function LayerRow({
  id, name, color, category, count, isActive,
  onToggle, onDelete, onRename,
}: LayerRowProps) {
  const [editing,  setEditing]  = useState(false)
  const [editName, setEditName] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)

  const meta = LAYER_CATEGORY_META.find(m => m.value === category)

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

  const cancelEdit = () => {
    setEditName(name)
    setEditing(false)
  }

  return (
    <div className={`layer-row${isActive ? ' layer-row--active' : ''}`}>
      <button
        className="layer-swatch"
        style={{ background: color }}
        title={isActive ? 'Remove from filter' : 'Filter by this layer'}
        onClick={() => onToggle(id)}
        aria-pressed={isActive}
      />

      <div className="layer-row__body" onDoubleClick={startEdit}>
        {editing ? (
          <input
            ref={inputRef}
            className="layer-row__input"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => {
              if (e.key === 'Enter')  commitEdit()
              if (e.key === 'Escape') cancelEdit()
            }}
          />
        ) : (
          <span className="layer-row__name" title="Double-click to rename">{name}</span>
        )}
        <span className="layer-row__meta">
          {meta?.icon ?? '🏷️'} {meta?.label ?? category}
        </span>
      </div>

      <span
        className="layer-count-badge"
        title={`${count} assigned element${count !== 1 ? 's' : ''}`}
      >
        {count}
      </span>

      <button
        className="layer-delete-btn"
        title="Delete layer"
        onClick={() => onDelete(id)}
        aria-label={`Delete layer ${name}`}
      >
        ✕
      </button>
    </div>
  )
}

// ── CreateForm ────────────────────────────────────────────────────────────────

interface CreateFormProps {
  onSubmit:  (name: string, category: LayerCategory, color: string) => void
  isLoading: boolean
}

function CreateForm({ onSubmit, isLoading }: CreateFormProps) {
  const [name,     setName]     = useState('')
  const [category, setCategory] = useState<LayerCategory>('custom')
  const [color,    setColor]    = useState(randomColor)

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit(trimmed, category, color)
    setName('')
    setColor(randomColor())
  }

  return (
    <div className="layer-create-form">
      <div className="layer-create-form__row">
        <input
          className="layer-create-form__name"
          type="text"
          placeholder="Layer name…"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          maxLength={80}
        />
        <input
          type="color"
          className="layer-create-form__color"
          value={color}
          onChange={e => setColor(e.target.value)}
          title="Choose color"
        />
      </div>
      <div className="layer-create-form__row">
        <select
          className="layer-create-form__category"
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
          className="layer-create-form__btn"
          onClick={handleSubmit}
          disabled={isLoading || !name.trim()}
        >
          {isLoading ? '…' : '+ Add Layer'}
        </button>
      </div>
    </div>
  )
}

// ── LayerPanel ─────────────────────────────────────────────────────────────────

export default function LayerPanel() {
  const { data: layers, isLoading, isError, error } = useLayers()
  const { data: counts = new Map<string, number>() }  = useLayerCounts()
  const createMutation = useCreateLayer()
  const renameMutation = useRenameLayer()
  const deleteMutation = useDeleteLayer()

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

  const handleDelete = useCallback((id: string) => {
    deleteMutation.mutate(id)
  }, [deleteMutation])

  return (
    <div className="layer-panel">

      {/* ── STICKY ZONE — always visible ────────────────────────
          Title bar + create form live here.
          .layer-panel__sticky has flex-shrink:0 so it never
          collapses or gets pushed off-screen.                  */}
      <div className="layer-panel__sticky">

        {/* Title + optional filter-clear button */}
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

        {/* Create form */}
        <CreateForm
          onSubmit={handleCreate}
          isLoading={createMutation.isPending}
        />

        {/* Create-mutation error (shown in sticky zone so it's always visible) */}
        {createMutation.isError && (
          <div className="layer-error">
            Failed to create layer: {(createMutation.error as Error).message}
          </div>
        )}

      </div>
      {/* ── end STICKY ZONE ─────────────────────────────────── */}

      {/* ── SCROLL ZONE — independently scrollable ──────────────
          Everything below the sticky header lives here.
          .layer-panel__scroll has flex:1, min-height:0,
          overflow-y:auto so it takes all remaining height and
          scrolls without affecting anything outside.           */}
      <div className="layer-panel__scroll">

        {/* Loading state */}
        {isLoading && (
          <div className="layer-loading">
            <div className="upload-spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
            <span>Loading layers…</span>
          </div>
        )}

        {/* Fetch error */}
        {isError && (
          <div className="layer-error">
            {(error as Error).message}
          </div>
        )}

        {/* Layer list */}
        {!isLoading && !isError && (
          <div className="layer-list">
            {(layers ?? []).length === 0 ? (
              <div className="layer-empty">
                No layers yet.<br />Create one using the form above.
              </div>
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
                />
              ))
            )}
          </div>
        )}

        {/* Active-filter indicator — shown at bottom of scroll area */}
        {activeFilterIds.length > 0 && (
          <div className="layer-filter-indicator">
            🔍 Filtering by {activeFilterIds.length} layer{activeFilterIds.length !== 1 ? 's' : ''}
          </div>
        )}

      </div>
      {/* ── end SCROLL ZONE ─────────────────────────────────── */}

    </div>
  )
}