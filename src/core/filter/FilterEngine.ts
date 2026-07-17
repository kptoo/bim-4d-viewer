/**
 * FilterEngine — Pure business logic for IFC object visibility filtering.
 *
 * Design principles:
 * - ZERO React dependencies.
 * - ZERO Three.js dependencies.
 * - No side effects — all methods are pure static functions.
 * - Fully unit-testable (see FilterEngine.test.ts).
 * - Framework-agnostic — can be used in Node.js tests or any future runtime.
 *
 * Architecture:
 * - Components NEVER call FilterEngine directly.
 * - IFCViewer's filter `useEffect` calls FilterEngine, then passes the result
 *   to ViewerEngine.setObjectVisibility() to update the 3D scene.
 * - This ensures filtering logic stays pure and testable.
 *
 * Filter semantics:
 * - No active filters → ALL objects visible.
 * - One active layer → objects must belong to that layer.
 * - Multiple active layers → AND logic (objects must belong to ALL layers).
 * - Type filter → objects must match one of the specified IFC types.
 * - Combined → object must pass BOTH layer AND type filters.
 *
 * @module FilterEngine
 */

import type { IFCObject } from '../../types'

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Result of any FilterEngine filter operation.
 * Separates objects into visible and hidden GlobalId arrays.
 */
export interface FilterResult {
  /** GlobalIds of objects that pass all active filters */
  visible: string[]
  /** GlobalIds of objects that do NOT pass all active filters */
  hidden:  string[]
}

// ── FilterEngine ──────────────────────────────────────────────────────────────

export class FilterEngine {
  /**
   * Filters IFC objects by active information layer IDs.
   *
   * Logic:
   * - Empty `activeLayerIds` → all objects visible (no filter applied).
   * - One layer ID → objects must belong to that layer.
   * - Multiple layer IDs → objects must belong to ALL of them (AND logic).
   *
   * The layer membership of each object is stored in `IFCObject.layerIds`,
   * which is patched by `useGlobalIdLayerMap()` after each DB sync.
   *
   * @param objects        - All IFC objects currently loaded in the model
   * @param activeLayerIds - UUIDs of the currently active filter layers
   * @returns FilterResult containing separate visible and hidden GlobalId arrays
   */
  static applyLayerFilter(
    objects:        IFCObject[],
    activeLayerIds: string[]
  ): FilterResult {
    if (activeLayerIds.length === 0) {
      return {
        visible: objects.map(o => o.globalId),
        hidden:  [],
      }
    }

    const visible: string[] = []
    const hidden:  string[] = []

    for (const obj of objects) {
      const matchesAll = activeLayerIds.every(
        lid => obj.layerIds.includes(lid)
      )
      if (matchesAll) visible.push(obj.globalId)
      else             hidden.push(obj.globalId)
    }

    return { visible, hidden }
  }

  /**
   * Filters IFC objects by one or more IFC entity types.
   *
   * Example: `activeTypes = ['IfcWall', 'IfcSlab']` shows only walls and slabs.
   *
   * @param objects      - All IFC objects currently loaded in the model
   * @param activeTypes  - IFC type strings to filter by (e.g. 'IfcWall')
   * @returns FilterResult containing separate visible and hidden GlobalId arrays
   */
  static applyTypeFilter(
    objects:     IFCObject[],
    activeTypes: string[]
  ): FilterResult {
    if (activeTypes.length === 0) {
      return {
        visible: objects.map(o => o.globalId),
        hidden:  [],
      }
    }

    const visible: string[] = []
    const hidden:  string[] = []

    for (const obj of objects) {
      if (activeTypes.includes(obj.type)) visible.push(obj.globalId)
      else                                 hidden.push(obj.globalId)
    }

    return { visible, hidden }
  }

  /**
   * Combines layer and type filters in a single pass.
   * An object must pass BOTH filters to be visible.
   *
   * This is more efficient than chaining applyLayerFilter + applyTypeFilter
   * because it iterates the objects array only once.
   *
   * @param objects        - All IFC objects currently loaded in the model
   * @param activeLayerIds - UUIDs of the currently active filter layers
   * @param activeTypes    - IFC type strings to filter by
   * @returns FilterResult containing separate visible and hidden GlobalId arrays
   */
  static applyCombinedFilter(
    objects:        IFCObject[],
    activeLayerIds: string[],
    activeTypes:    string[]
  ): FilterResult {
    const noLayerFilter = activeLayerIds.length === 0
    const noTypeFilter  = activeTypes.length    === 0

    if (noLayerFilter && noTypeFilter) {
      return {
        visible: objects.map(o => o.globalId),
        hidden:  [],
      }
    }

    const visible: string[] = []
    const hidden:  string[] = []

    for (const obj of objects) {
      const passesLayer = noLayerFilter ||
        activeLayerIds.every(lid => obj.layerIds.includes(lid))
      const passesType  = noTypeFilter ||
        activeTypes.includes(obj.type)

      if (passesLayer && passesType) visible.push(obj.globalId)
      else                            hidden.push(obj.globalId)
    }

    return { visible, hidden }
  }
}