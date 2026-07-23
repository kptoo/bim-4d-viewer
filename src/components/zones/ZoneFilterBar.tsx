/**
 * ZoneFilterBar.tsx — Floating zone filter status bar shown below the 3D viewer.
 *
 * Rendered inside `viewer-canvas-host` in Layout.tsx, overlaid at the bottom
 * of the canvas. Visible only when `activeFilterIds.length > 0`.
 *
 * Phase 6 Zone UX fix:
 * The previous implementation had a split-brain problem:
 * - "Show All" called only `isolateObjects([])` — it restored 3D visibility
 *   but left `activeFilterIds` non-empty, so the filter chips stayed visible.
 * - "Clear filters" called `clearFilters()` + `isolateObjects([])` correctly,
 *   but it wasn't obvious which button was the right one to press.
 *
 * Fix: both "Show All" and "Clear filters" now call BOTH `clearFilters()` AND
 * `isolateObjects([])`. They are functionally equivalent — the button labels
 * are the only difference. "Show All" is a viewer-centric label; "Clear
 * filters" is a data-centric label. Either should fully reset the zone state.
 *
 * An "Esc" keyboard hint is added next to the "Clear all" button, matching
 * the convention established by the object selection workflow, so users
 * discover that Escape also works from here.
 *
 * @module ZoneFilterBar
 */

import { useLayerStore }  from '../../store/layer.store'
import { useViewerStore } from '../../store/viewer.store'

export default function ZoneFilterBar() {
  const activeFilterIds = useLayerStore(s => s.activeFilterIds)
  const layers          = useLayerStore(s => s.layers)
  const toggleFilter    = useLayerStore(s => s.toggleFilter)
  const clearFilters    = useLayerStore(s => s.clearFilters)
  const isolateObjects  = useViewerStore(s => s.isolateObjects)

  if (activeFilterIds.length === 0) return null

  const activeZones = activeFilterIds
    .map(id => layers.find(l => l.id === id))
    .filter(Boolean) as { id: string; name: string; color: string }[]

  /**
   * Full reset: clear the filter store AND restore 3D visibility.
   * Effect 3 in IFCViewer also fires when activeFilterIds → [] and calls
   * engine.restoreVisibility(), but calling isolateObjects([]) here provides
   * immediate synchronous feedback while the reactive path catches up.
   */
  const handleClearAll = () => {
    clearFilters()
    isolateObjects?.([])
  }

  /**
   * Remove a single zone chip. Does NOT call isolateObjects because the
   * remaining active filters still govern visibility — Effect 3 will
   * recompute and update the viewport immediately.
   */
  const handleRemoveOne = (zoneId: string) => {
    toggleFilter(zoneId)
    // If this was the last chip, isolateObjects([]) is not needed here —
    // clearFilters() / toggleFilter() sets activeFilterIds to [] and
    // Effect 3 calls engine.restoreVisibility() reactively.
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
            onClick={() => handleRemoveOne(zone.id)}
            aria-label={`Remove ${zone.name} filter`}
          >
            ✕
          </button>
        </span>
      ))}

      {/* "Clear all" — full reset: store + viewport */}
      <button
        className="zone-filter-bar__clear"
        onClick={handleClearAll}
        title="Clear all zone filters and restore full model visibility (Escape)"
      >
        Clear all
        <kbd style={{
          background:    'rgba(255,255,255,0.07)',
          border:        '1px solid rgba(255,255,255,0.15)',
          borderRadius:  3,
          fontSize:      9,
          marginLeft:    5,
          padding:       '1px 4px',
          color:         'var(--text-secondary)',
          fontFamily:    'ui-monospace, monospace',
          verticalAlign: 'middle',
        }}>Esc</kbd>
      </button>
    </div>
  )
}