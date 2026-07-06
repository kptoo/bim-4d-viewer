/**
 * Layer store — owns information layer state and filter state.
 *
 * Phase 1: empty layers (no mock data needed — layers come from DB).
 * Phase 3: will be populated via React Query + Neon API.
 */

import { create } from 'zustand'
import type { InformationLayer, LayerAssignment } from '../types'

interface LayerState {
  layers:          InformationLayer[]
  assignments:     LayerAssignment[]
  /** IDs of layers currently active as filters */
  activeFilterIds: string[]

  // ── Actions ──────────────────────────────────────────────
  setLayers:          (layers: InformationLayer[]) => void
  setAssignments:     (assignments: LayerAssignment[]) => void
  toggleFilter:       (layerId: string) => void
  clearFilters:       () => void
  getLayerById:       (id: string) => InformationLayer | undefined
  /** Returns all layers assigned to a given IFC object */
  getLayersForObject: (globalId: string) => InformationLayer[]
}

export const useLayerStore = create<LayerState>((set, get) => ({
  layers:          [],
  assignments:     [],
  activeFilterIds: [],

  setLayers:      (layers)      => set({ layers }),
  setAssignments: (assignments) => set({ assignments }),

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