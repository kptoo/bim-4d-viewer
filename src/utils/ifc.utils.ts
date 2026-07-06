/**
 * IFC utility functions.
 * Pure functions — no side effects, no framework dependencies.
 */

import type { IFCType } from '../types'

/**
 * Validates that a string looks like a valid IFC GlobalId.
 * IFC GlobalIds are 22-character base64-encoded strings.
 */
export function isValidGlobalId(value: string): boolean {
  return typeof value === 'string' && /^[0-9A-Za-z_$]{22}$/.test(value)
}

/**
 * Returns a display-friendly label for an IFC type.
 * Strips the "Ifc" prefix for UI presentation.
 *
 * @example
 * ifcTypeLabel('IfcWall') // → 'Wall'
 * ifcTypeLabel('IfcCurtainWall') // → 'Curtain Wall'
 */
export function ifcTypeLabel(type: IFCType): string {
  const withoutPrefix = type.replace(/^Ifc/, '')
  // Insert space before each capital letter after the first
  return withoutPrefix.replace(/([A-Z])/g, ' $1').trim()
}

/**
 * Returns an emoji icon for a given IFC type.
 * Used in the Inspector panel and layer badges.
 */
export function ifcTypeIcon(type: IFCType): string {
  const icons: Partial<Record<IFCType, string>> = {
    IfcWall:                  '🧱',
    IfcSlab:                  '⬛',
    IfcColumn:                '🏛',
    IfcBeam:                  '➖',
    IfcStair:                 '🪜',
    IfcFlowSegment:           '🔩',
    IfcCurtainWall:           '🪟',
    IfcCovering:              '🟫',
    IfcDoor:                  '🚪',
    IfcWindow:                '🪟',
    IfcRoof:                  '🏠',
    IfcFoundation:            '🪨',
    IfcBuildingElementProxy:  '📦',
  }
  return icons[type] ?? '📦'
}

/**
 * Groups an array of IFC objects by their type.
 * Used in filtering and statistics panels.
 */
export function groupByType<T extends { type: IFCType }>(
  objects: T[]
): Map<IFCType, T[]> {
  const map = new Map<IFCType, T[]>()
  for (const obj of objects) {
    const existing = map.get(obj.type) ?? []
    existing.push(obj)
    map.set(obj.type, existing)
  }
  return map
}