/**
 * Selection store — owns all selection state.
 *
 * Supports multi-select (Set of GlobalIds) with a single
 * "primary" selection for the Inspector panel.
 * Single source of truth for viewer ↔ gantt synchronization.
 */

import { create } from 'zustand'

interface SelectionState {
  /** All currently selected GlobalIds (multi-select) */
  selectedGlobalIds:  Set<string>
  /** The primary selected object shown in the Inspector */
  primaryGlobalId:    string | null
  /** The currently selected activity ID */
  selectedActivityId: string | null

  // ── Actions ──────────────────────────────────────────────

  /**
   * Select an IFC object.
   * @param globalId - GlobalId to select
   * @param multi    - If true, adds to existing selection; otherwise replaces it
   */
  selectObject: (globalId: string, multi?: boolean) => void

  /**
   * Select a construction activity.
   * Also sets primaryGlobalId to the first linked object.
   */
  selectActivity: (activityId: string, firstLinkedGlobalId?: string) => void

  /** Clear all selection state */
  clearSelection: () => void

  /** Returns true if the given GlobalId is selected */
  isSelected: (globalId: string) => boolean
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedGlobalIds:  new Set(),
  primaryGlobalId:    null,
  selectedActivityId: null,

  selectObject: (globalId, multi = false) => {
    if (multi) {
      set(state => {
        const next = new Set(state.selectedGlobalIds)
        if (next.has(globalId)) next.delete(globalId)
        else                     next.add(globalId)
        return {
          selectedGlobalIds: next,
          primaryGlobalId:   globalId,
        }
      })
    } else {
      set({
        selectedGlobalIds:  new Set([globalId]),
        primaryGlobalId:    globalId,
        selectedActivityId: null,
      })
    }
  },

  selectActivity: (activityId, firstLinkedGlobalId) => {
    set({
      selectedActivityId: activityId,
      primaryGlobalId:    firstLinkedGlobalId ?? null,
      selectedGlobalIds:  firstLinkedGlobalId
        ? new Set([firstLinkedGlobalId])
        : new Set(),
    })
  },

  clearSelection: () => set({
    selectedGlobalIds:  new Set(),
    primaryGlobalId:    null,
    selectedActivityId: null,
  }),

  isSelected: (globalId) => get().selectedGlobalIds.has(globalId),
}))