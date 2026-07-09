import { useState, useCallback } from 'react'
import { useSelectionStore }      from '../../store/selection.store'
import { useViewerStore }         from '../../store/viewer.store'
import { useLayerStore }          from '../../store/layer.store'
import {
  useAssignmentsByGlobalId,
  useAssignLayer,
  useRemoveObjectFromLayer,
}                                 from '../../hooks/useAssignments'
import {
  useCreateLayer,
}                                 from '../../hooks/useLayers'
import { LAYER_CATEGORY_META }    from '../../types'
import type { LayerCategory }     from '../../types'

const PALETTE = [
  '#3498DB', '#2ECC71', '#E74C3C', '#F39C12', '#9B59B6',
  '#1ABC9C', '#E67E22', '#E91E63', '#00BCD4', '#8BC34A',
]
function randomColor() { return PALETTE[Math.floor(Math.random() * PALETTE.length)] }

// ── Quick create row ──────────────────────────────────────────────────────────

interface QuickCreateProps {
  onCreatedAndAssigned: (layerId: string) => void
  isAssigning: boolean
}

function QuickCreateRow({ onCreatedAndAssigned, isAssigning }: QuickCreateProps) {
  const [expanded, setExpanded] = useState(false)
  const [name,     setName]     = useState('')
  const [category, setCategory] = useState<LayerCategory>('zones')
  const [color,    setColor]    = useState(randomColor)

  const createMutation = useCreateLayer()

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      const newLayer = await createMutation.mutateAsync({
        payload: { name: trimmed, category, color, description: null },
      })
      setName('')
      setColor(randomColor())
      setExpanded(false)
      onCreatedAndAssigned(newLayer.id)
    } catch {
      // mutation error shown via createMutation.isError below
    }
  }

  if (!expanded) {
    return (
      <button
        className="zone-assign__create-toggle"
        onClick={() => setExpanded(true)}
      >
        ＋ Create new zone
      </button>
    )
  }

  return (
    <div className="zone-assign__create-form">
      <input
        className="zone-assign__create-input"
        type="text"
        placeholder="Zone name…"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter')  handleCreate()
          if (e.key === 'Escape') setExpanded(false)
        }}
        autoFocus
        maxLength={80}
      />
      <input
        type="color"
        className="zone-assign__create-color"
        value={color}
        onChange={e => setColor(e.target.value)}
        title="Zone color"
      />
      <select
        className="zone-assign__create-cat"
        value={category}
        onChange={e => setCategory(e.target.value as LayerCategory)}
      >
        {LAYER_CATEGORY_META.map(m => (
          <option key={m.value} value={m.value}>{m.icon} {m.label}</option>
        ))}
      </select>
      <div className="zone-assign__create-actions">
        <button
          className="zone-assign__create-btn"
          onClick={handleCreate}
          disabled={createMutation.isPending || isAssigning || !name.trim()}
        >
          {createMutation.isPending ? '…' : 'Create & Assign'}
        </button>
        <button
          className="zone-assign__cancel-btn"
          onClick={() => setExpanded(false)}
        >
          Cancel
        </button>
      </div>
      {createMutation.isError && (
        <div className="zone-assign__error">
          {(createMutation.error as Error).message}
        </div>
      )}
    </div>
  )
}

// ── ZoneAssignWidget ──────────────────────────────────────────────────────────

interface ZoneAssignWidgetProps {
  isOpen:  boolean
  onClose: () => void
}

export default function ZoneAssignWidget({ isOpen, onClose }: ZoneAssignWidgetProps) {
  const primaryGlobalId   = useSelectionStore(s => s.primaryGlobalId)
  const selectedGlobalIds = useSelectionStore(s => s.selectedGlobalIds)
  const getObjectByGlobalId = useViewerStore(s => s.getObjectByGlobalId)
  const zones             = useLayerStore(s => s.layers)

  const assignMutation = useAssignLayer()
  const removeMutation = useRemoveObjectFromLayer()

  const {
    data:      assignments = [],
    isLoading: loadingAssignments,
  } = useAssignmentsByGlobalId(primaryGlobalId ?? '')

  const assignedZoneIds = new Set(assignments.map(a => a.layerId))
  const selectionCount  = selectedGlobalIds.size

  const handleAssign = useCallback((zoneId: string) => {
    const globalIds = Array.from(selectedGlobalIds)
    assignMutation.mutate({ layerId: zoneId, globalIds })
  }, [selectedGlobalIds, assignMutation])

  const handleRemove = useCallback((zoneId: string) => {
    if (!primaryGlobalId) return
    removeMutation.mutate({ layerId: zoneId, globalId: primaryGlobalId })
  }, [primaryGlobalId, removeMutation])

  // Called when quick-create succeeds — immediately assign the new zone
  const handleCreatedAndAssigned = useCallback((zoneId: string) => {
    const globalIds = Array.from(selectedGlobalIds)
    assignMutation.mutate({ layerId: zoneId, globalIds })
  }, [selectedGlobalIds, assignMutation])

  if (!isOpen) return null

  const primaryObject = primaryGlobalId ? getObjectByGlobalId(primaryGlobalId) : null

  return (
    <div className="zone-assign">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="zone-assign__header">
        <div className="zone-assign__header-info">
          <span className="zone-assign__header-title">Assign to Zone</span>
          {primaryGlobalId && (
            <span className="zone-assign__header-sub">
              {primaryObject?.name ?? primaryGlobalId}
              {selectionCount > 1 && (
                <span className="zone-assign__multi"> +{selectionCount - 1} more</span>
              )}
            </span>
          )}
        </div>
        <button
          className="zone-assign__close"
          onClick={onClose}
          aria-label="Close zone assignment"
        >
          ✕
        </button>
      </div>

      {/* ── Quick create ────────────────────────────────────────── */}
      <div className="zone-assign__create-wrap">
        <QuickCreateRow
          onCreatedAndAssigned={handleCreatedAndAssigned}
          isAssigning={assignMutation.isPending}
        />
      </div>

      {/* ── Zone list ───────────────────────────────────────────── */}
      <div className="zone-assign__list">

        {loadingAssignments && (
          <div className="zone-assign__loading">
            <div className="upload-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            <span>Loading…</span>
          </div>
        )}

        {!loadingAssignments && zones.length === 0 && (
          <div className="zone-assign__empty">
            No zones yet. Create one above.
          </div>
        )}

        {!loadingAssignments && zones.map(zone => {
          const isAssigned = assignedZoneIds.has(zone.id)
          return (
            <div
              key={zone.id}
              className={`zone-assign__row${isAssigned ? ' zone-assign__row--assigned' : ''}`}
            >
              <span className="zone-assign__dot" style={{ background: zone.color }} />
              <span className="zone-assign__zone-name">{zone.name}</span>

              {isAssigned ? (
                <button
                  className="zone-assign__btn zone-assign__btn--remove"
                  onClick={() => handleRemove(zone.id)}
                  disabled={removeMutation.isPending}
                  title="Remove from this zone"
                >
                  ✓ Assigned · Remove
                </button>
              ) : (
                <button
                  className="zone-assign__btn zone-assign__btn--add"
                  onClick={() => handleAssign(zone.id)}
                  disabled={assignMutation.isPending}
                  title={
                    selectionCount > 1
                      ? `Assign ${selectionCount} selected elements`
                      : 'Assign to this zone'
                  }
                >
                  + Assign
                </button>
              )}
            </div>
          )
        })}

        {(assignMutation.isError || removeMutation.isError) && (
          <div className="zone-assign__error">
            {(assignMutation.error ?? removeMutation.error as Error)?.message}
          </div>
        )}

      </div>

    </div>
  )
}