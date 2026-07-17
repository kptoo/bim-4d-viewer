/**
 * selection.store.ts — Zustand store for bidirectional selection state.
 *
 * This is the single source of truth for selection synchronisation between:
 *   - The 3D viewer (click on mesh → selectedGlobalIds)
 *   - The Gantt chart (click on bar → selectedActivityId)
 *   - The IFC Inspector (shows properties for primaryGlobalId)
 *   - The Object Tree (highlights selected node)
 *   - The Activities panel (highlights selected activity card)
 *
 * Selection model:
 * - `selectedGlobalIds`  — Set of all selected IFC object GlobalIds (multi-select).
 * - `primaryGlobalId`    — The "focus" object shown in the Inspector. When
 *                          multiple objects are selected, this is the last one
 *                          clicked (or the first linked object of the selected activity).
 * - `selectedActivityId` — UUID of the selected Gantt task. Cleared when the
 *                          user selects an object directly in the viewer.
 *
 * Synchronisation flows:
 *   Viewer click     → selectObject()   → all panels react
 *   Gantt click      → selectActivity() → viewer highlights linked objects
 *   Activity card    → selectActivity() → viewer highlights linked objects
 *   Empty space click → clearSelection() → all panels deselect
 *
 * @module selection.store
 */

import { create } from 'zustand'

// ── State shape ───────────────────────────────────────────────────────────────

interface SelectionState {
  /**
   * All currently selected IFC object GlobalIds.
   * A Set is used for O(1) membership checks (isSelected).
   */
  selectedGlobalIds: Set<string>

  /**
   * The primary selected object shown in the IFC Inspector.
   * When multiple objects are selected, this is the most recently clicked one.
   * null when nothing is selected.
   */
  primaryGlobalId: string | null

  /**
   * The UUID of the currently selected activity in the Gantt/Activities panel.
   * null when the selection was made directly in the 3D viewer.
   */
  selectedActivityId: string | null

  // ── Actions ──────────────────────────────────────────────

  /**
   * Selects an IFC object in the 3D viewer.
   * Clears the activity selection when multi = false (single select).
   *
   * @param globalId - IFC GlobalId of the picked object
   * @param multi    - When true, toggles the object in the multi-selection set.
   *                   When false (default), replaces the current selection.
   */
  selectObject: (globalId: string, multi?: boolean) => void

  /**
   * Selects a construction activity from the Gantt or Activities panel.
   * Optionally focuses the first linked IFC object (for the Inspector and viewer).
   *
   * @param activityId           - UUID of the selected activity
   * @param firstLinkedGlobalId  - Optional first linked IFC object GlobalId.
   *                               When provided, it becomes the primaryGlobalId.
   */
  selectActivity: (activityId: string, firstLinkedGlobalId?: string) => void

  /**
   * Clears all selection state.
   * Called when the user clicks on empty space in the 3D viewer.
   */
  clearSelection: () => void

  /**
   * Returns true if the given GlobalId is currently selected.
   * O(1) because selectedGlobalIds is a Set.
   *
   * @param globalId - IFC GlobalId to check
   */
  isSelected: (globalId: string) => boolean
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedGlobalIds:  new Set(),
  primaryGlobalId:    null,
  selectedActivityId: null,

  selectObject: (globalId, multi = false) => {
    if (multi) {
      // Toggle the object in the multi-selection set
      set(state => {
        const next = new Set(state.selectedGlobalIds)
        if (next.has(globalId)) next.delete(globalId)
        else                     next.add(globalId)
        return {
          selectedGlobalIds: next,
          primaryGlobalId:   globalId,
          // Multi-select from the viewer does NOT clear the activity selection
          // so Gantt highlighting is preserved when adding to a selection.
        }
      })
    } else {
      // Replace current selection with the single clicked object
      set({
        selectedGlobalIds:  new Set([globalId]),
        primaryGlobalId:    globalId,
        // Clear activity selection — user is now focusing on a viewer object
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