/**
 * layer.store.ts — Zustand store for information layers and assignments.
 *
 * Owns two related domain slices:
 * 1. **Layers** — the InformationLayer entities from the database.
 * 2. **Assignments** — the layer-to-GlobalId links (denormalised flat list).
 * 3. **Active filter IDs** — which layers are currently active as viewport filters.
 *
 * Update flow:
 *   DB fetch → useLayers() hook → setLayers() → layer.store.layers
 *   DB fetch → useAllAssignments() hook → setAssignments() → layer.store.assignments
 *
 * The assignments list is used by:
 * - `getLayersForObject(globalId)` — Inspector panel badge display.
 * - Filter logic (via FilterEngine, triggered from IFCViewer's useEffect).
 *
 * The actual layer filtering is NOT computed here. It is computed by FilterEngine
 * in IFCViewer after comparing `activeFilterIds` with `IFCObject.layerIds`.
 *
 * @module layer.store
 */

import { create } from 'zustand'
import type { InformationLayer, LayerAssignment } from '../types'

// ── State shape ───────────────────────────────────────────────────────────────

interface LayerState {
  /** All information layers from the database. */
  layers: InformationLayer[]

  /**
   * All layer-to-GlobalId assignments from the database.
   * Used by getLayersForObject() for O(n_assignments) lookups.
   */
  assignments: LayerAssignment[]

  /**
   * IDs of layers currently active as filters.
   * When non-empty, only IFC objects assigned to ALL active layers are shown.
   * Empty = no filter applied (all objects visible).
   */
  activeFilterIds: string[]

  // ── Actions ──────────────────────────────────────────────

  /**
   * Replaces the layers list with fresh data from the database.
   * Called by the useLayers() hook after a successful fetch.
   *
   * @param layers - Fresh layers array from the DB
   */
  setLayers: (layers: InformationLayer[]) => void

  /**
   * Replaces the assignments list with fresh data from the database.
   * Called by the useAllAssignments() hook after a successful fetch.
   *
   * @param assignments - Fresh assignments array from the DB
   */
  setAssignments: (assignments: LayerAssignment[]) => void

  /**
   * Atomically replaces both layers and assignments in a single render.
   * Avoids a flash where layers are set but assignments are still stale.
   * Called by React Query hooks after a successful combined fetch.
   *
   * @param layers      - Fresh layers array
   * @param assignments - Fresh assignments array
   */
  syncFromDB: (layers: InformationLayer[], assignments: LayerAssignment[]) => void

  /**
   * Toggles a layer's active filter state.
   * If the layer is already active, it is removed from the filter set.
   * If it is not active, it is added.
   *
   * @param layerId - Layer UUID to toggle
   */
  toggleFilter: (layerId: string) => void

  /**
   * Removes all active layer filters.
   * Called after deleting a layer (to clear any dangling filter reference)
   * or when the user explicitly clears all filters.
   */
  clearFilters: () => void

  /**
   * Returns a single layer by its UUID.
   * Returns undefined if not found.
   *
   * @param id - Layer UUID
   */
  getLayerById: (id: string) => InformationLayer | undefined

  /**
   * Returns all layers assigned to a specific IFC object.
   * Scans the assignments list — O(n_assignments).
   * Used by the Inspector panel to show layer badges.
   *
   * @param globalId - IFC object GlobalId
   */
  getLayersForObject: (globalId: string) => InformationLayer[]
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useLayerStore = create<LayerState>((set, get) => ({
  layers:          [],
  assignments:     [],
  activeFilterIds: [],

  setLayers:      (layers)      => set({ layers }),
  setAssignments: (assignments) => set({ assignments }),

  syncFromDB: (layers, assignments) => set({ layers, assignments }),

  toggleFilter: (layerId) => {
    set(state => {
      const active = state.activeFilterIds
      const next   = active.includes(layerId)
        ? active.filter(id => id !== layerId)
        : [...active, layerId]
      return { activeFilterIds: next }
    })
  },

  clearFilters: () => set({ activeFilterIds: [] }),

  getLayerById: (id) =>
    get().layers.find(l => l.id === id),

  getLayersForObject: (globalId) => {
    const layerIds = get().assignments
      .filter(a => a.globalId === globalId)
      .map(a => a.layerId)
    return get().layers.filter(l => layerIds.includes(l.id))
  },
}))