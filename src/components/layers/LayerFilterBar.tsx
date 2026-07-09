import { useLayerStore } from '../../store/layer.store'

export default function LayerFilterBar() {
  const activeFilterIds = useLayerStore(s => s.activeFilterIds)
  const layers          = useLayerStore(s => s.layers)
  const toggleFilter    = useLayerStore(s => s.toggleFilter)
  const clearFilters    = useLayerStore(s => s.clearFilters)

  if (activeFilterIds.length === 0) return null

  const activeLayerObjs = activeFilterIds
    .map(id => layers.find(l => l.id === id))
    .filter(Boolean) as { id: string; name: string; color: string }[]

  return (
    <div className="layer-filter-bar">
      <span className="layer-filter-bar__label">Filtered by:</span>

      {activeLayerObjs.map(layer => (
        <span key={layer.id} className="layer-chip">
          <span className="layer-chip__dot" style={{ background: layer.color }} />
          <span className="layer-chip__name">{layer.name}</span>
          <button
            className="layer-chip__remove"
            onClick={() => toggleFilter(layer.id)}
            aria-label={`Remove ${layer.name} filter`}
          >
            ✕
          </button>
        </span>
      ))}

      <button
        className="layer-filter-bar__clear"
        onClick={clearFilters}
      >
        Clear all
      </button>
    </div>
  )
}