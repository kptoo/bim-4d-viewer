import { useLayerStore }  from '../../store/layer.store'
import { useViewerStore } from '../../store/viewer.store'

export default function ZoneFilterBar() {
  const activeFilterIds = useLayerStore(s => s.activeFilterIds)
  const layers          = useLayerStore(s => s.layers)
  const toggleFilter    = useLayerStore(s => s.toggleFilter)
  const clearFilters    = useLayerStore(s => s.clearFilters)

  // Restore full visibility in the 3D viewport when clearing zone filters
  const isolateObjects  = useViewerStore(s => s.isolateObjects)

  if (activeFilterIds.length === 0) return null

  const activeZones = activeFilterIds
    .map(id => layers.find(l => l.id === id))
    .filter(Boolean) as { id: string; name: string; color: string }[]

  const handleClearAll = () => {
    clearFilters()
    // If objects were isolated by "Show Only", restore full visibility
    isolateObjects?.([])
  }

  return (
    <div className="zone-filter-bar">
      <span className="zone-filter-bar__label">Zone filter:</span>

      {activeZones.map(zone => (
        <span key={zone.id} className="zone-chip">
          <span className="zone-chip__dot"  style={{ background: zone.color }} />
          <span className="zone-chip__name">{zone.name}</span>
          <button
            className="zone-chip__remove"
            onClick={() => toggleFilter(zone.id)}
            aria-label={`Remove ${zone.name} filter`}
          >
            ✕
          </button>
        </span>
      ))}

      <button
        className="zone-filter-bar__show-all"
        onClick={() => isolateObjects?.([])}
        title="Restore full model visibility"
      >
        Show All
      </button>

      <button
        className="zone-filter-bar__clear"
        onClick={handleClearAll}
      >
        Clear filters
      </button>
    </div>
  )
}