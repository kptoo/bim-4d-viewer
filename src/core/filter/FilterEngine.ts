/**
 * FilterEngine — Pure business logic for object filtering.
 *
 * ZERO React dependencies. ZERO Three.js dependencies.
 * Fully unit-testable and framework-agnostic.
 *
 * Filtering logic must never live inside React components
 * or the viewer engine. Components call useFilter() hook
 * which delegates to this engine.
 */

import type { IFCObject } from '../../types'

export interface FilterResult {
  /** GlobalIds of objects that match all active filters */
  visible: string[]
  /** GlobalIds of objects that do NOT match all active filters */
  hidden: string[]
}

export class FilterEngine {
  /**
   * Filters IFC objects by active information layer IDs.
   *
   * Behavior:
   * - Empty activeLayerIds → all objects visible (no filter applied)
   * - One layer ID → objects must belong to that layer
   * - Multiple layer IDs → objects must belong to ALL of them (AND logic)
   *
   * @param objects        - All IFC objects in the model
   * @param activeLayerIds - Currently active filter layer IDs
   * @returns FilterResult with visible and hidden GlobalId arrays
   */
  static applyLayerFilter(
    objects: IFCObject[],
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
   * Filters IFC objects by one or more IFC types.
   *
   * @param objects      - All IFC objects in the model
   * @param activeTypes  - IFC type strings to filter by
   * @returns FilterResult
   */
  static applyTypeFilter(
    objects: IFCObject[],
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
   * Combines layer and type filters.
   * An object must pass BOTH filters to be visible.
   *
   * @param objects        - All IFC objects in the model
   * @param activeLayerIds - Active layer filter IDs
   * @param activeTypes    - Active type filter strings
   * @returns FilterResult
   */
  static applyCombinedFilter(
    objects: IFCObject[],
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