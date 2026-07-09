import { useSelectionStore } from '../../store/selection.store'
import { useViewerStore }    from '../../store/viewer.store'
import { useLayerStore }     from '../../store/layer.store'
import {
  useAssignmentsByGlobalId,
  useAssignLayer,
  useRemoveObjectFromLayer,
}                            from '../../hooks/useAssignments'

export default function LayerAssignmentPanel() {
  const primaryGlobalId     = useSelectionStore(s => s.primaryGlobalId)
  const selectedGlobalIds   = useSelectionStore(s => s.selectedGlobalIds)
  const getObjectByGlobalId = useViewerStore(s => s.getObjectByGlobalId)
  const layers              = useLayerStore(s => s.layers)

  const assignMutation = useAssignLayer()
  const removeMutation = useRemoveObjectFromLayer()

  const {
    data:      assignments = [],
    isLoading: loadingAssignments,
  } = useAssignmentsByGlobalId(primaryGlobalId ?? '')

  // ── No selection ──────────────────────────────────────────

  if (!primaryGlobalId) {
    return (
      <div className="assign-panel">
        <div className="assign-panel__scroll">
          <div className="assign-empty">
            Select elements in the 3D viewer<br />to assign information layers.
          </div>
        </div>
      </div>
    )
  }

  const primaryObject    = getObjectByGlobalId(primaryGlobalId)
  const selectionCount   = selectedGlobalIds.size
  const assignedLayerIds = new Set(assignments.map(a => a.layerId))

  // ── Handlers ──────────────────────────────────────────────

  const handleAssign = (layerId: string) => {
    const globalIds = Array.from(selectedGlobalIds)
    assignMutation.mutate({ layerId, globalIds })
  }

  const handleRemove = (layerId: string) => {
    removeMutation.mutate({ layerId, globalId: primaryGlobalId })
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="assign-panel">

      {/* ── STICKY: selected element identity ────────────────
          flex-shrink:0 keeps it visible regardless of how many
          layers are in the scroll zone below.                  */}
      <div className="assign-panel__header">
        <div className="assign-panel__primary">
          <span className="assign-panel__name" title={primaryGlobalId}>
            {primaryObject?.name ?? primaryGlobalId}
          </span>
          <span className="assign-panel__type">
            {primaryObject?.type ?? 'IFC Object'}
          </span>
        </div>
        {selectionCount > 1 && (
          <div className="assign-panel__multi">
            +{selectionCount - 1} more selected
            <span className="assign-panel__multi-hint">
              (assignments apply to all)
            </span>
          </div>
        )}
      </div>

      {/* ── SCROLL ZONE ──────────────────────────────────────
          All list content here. flex:1 + overflow-y:auto
          means it takes remaining height and scrolls when the
          layer list is longer than the available space.        */}
      <div className="assign-panel__scroll">

        {/* Loading */}
        {loadingAssignments && (
          <div className="assign-loading">
            <div className="upload-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            <span>Loading assignments…</span>
          </div>
        )}

        {/* Layer rows */}
        {!loadingAssignments && (
          <div className="assign-layer-list">
            {layers.length === 0 ? (
              <div className="assign-empty">
                No layers available.<br />Create layers in the section above first.
              </div>
            ) : (
              layers.map(layer => {
                const isAssigned = assignedLayerIds.has(layer.id)

                return (
                  <div
                    key={layer.id}
                    className={`assign-layer-row${isAssigned ? ' assign-layer-row--assigned' : ''}`}
                  >
                    <span
                      className="assign-layer-swatch"
                      style={{ background: layer.color }}
                    />
                    <span className="assign-layer-name">{layer.name}</span>

                    {isAssigned ? (
                      <button
                        className="assign-btn assign-btn--remove"
                        onClick={() => handleRemove(layer.id)}
                        disabled={removeMutation.isPending}
                        title="Remove from layer"
                      >
                        ✕ Remove
                      </button>
                    ) : (
                      <button
                        className="assign-btn assign-btn--add"
                        onClick={() => handleAssign(layer.id)}
                        disabled={assignMutation.isPending}
                        title={
                          selectionCount > 1
                            ? `Assign ${selectionCount} selected objects to this layer`
                            : 'Assign to this layer'
                        }
                      >
                        + Assign
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* Mutation errors — in scroll zone so they don't push sticky content */}
        {assignMutation.isError && (
          <div className="assign-error">
            Assign failed: {(assignMutation.error as Error).message}
          </div>
        )}
        {removeMutation.isError && (
          <div className="assign-error">
            Remove failed: {(removeMutation.error as Error).message}
          </div>
        )}

      </div>
      {/* ── end SCROLL ZONE ─────────────────────────────────── */}

    </div>
  )
}