/**
 * Unit tests for FilterEngine.
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest'
import { FilterEngine } from './FilterEngine'
import type { IFCObject } from '../../types'

// ── Fixtures ─────────────────────────────────────────────────

const makeObject = (
  overrides: Partial<IFCObject> & { globalId: string }
): IFCObject => ({
  name:          'Test Object',
  type:          'IfcWall',
  properties:    [],
  layerIds:      [],
  activityIds:   [],
  visible:       true,
  colorOverride: null,
  ...overrides,
})

const objects: IFCObject[] = [
  makeObject({ globalId: 'A1', type: 'IfcWall',   layerIds: ['layer-zone', 'layer-cost'] }),
  makeObject({ globalId: 'A2', type: 'IfcWall',   layerIds: ['layer-zone']               }),
  makeObject({ globalId: 'A3', type: 'IfcColumn', layerIds: ['layer-cost']               }),
  makeObject({ globalId: 'A4', type: 'IfcSlab',   layerIds: []                           }),
]

// ── applyLayerFilter ─────────────────────────────────────────

describe('FilterEngine.applyLayerFilter', () => {
  it('returns all objects visible when no filters active', () => {
    const result = FilterEngine.applyLayerFilter(objects, [])
    expect(result.visible).toHaveLength(4)
    expect(result.hidden).toHaveLength(0)
  })

  it('filters by single layer — only matching objects visible', () => {
    const result = FilterEngine.applyLayerFilter(objects, ['layer-zone'])
    expect(result.visible).toContain('A1')
    expect(result.visible).toContain('A2')
    expect(result.hidden).toContain('A3')
    expect(result.hidden).toContain('A4')
  })

  it('filters by multiple layers — AND logic', () => {
    const result = FilterEngine.applyLayerFilter(objects, ['layer-zone', 'layer-cost'])
    expect(result.visible).toEqual(['A1'])
    expect(result.hidden).toContain('A2')
    expect(result.hidden).toContain('A3')
    expect(result.hidden).toContain('A4')
  })

  it('hides all objects when filter matches nothing', () => {
    const result = FilterEngine.applyLayerFilter(objects, ['layer-nonexistent'])
    expect(result.visible).toHaveLength(0)
    expect(result.hidden).toHaveLength(4)
  })
})

// ── applyTypeFilter ──────────────────────────────────────────

describe('FilterEngine.applyTypeFilter', () => {
  it('returns all visible when no types active', () => {
    const result = FilterEngine.applyTypeFilter(objects, [])
    expect(result.visible).toHaveLength(4)
  })

  it('filters by single type', () => {
    const result = FilterEngine.applyTypeFilter(objects, ['IfcWall'])
    expect(result.visible).toContain('A1')
    expect(result.visible).toContain('A2')
    expect(result.hidden).toContain('A3')
    expect(result.hidden).toContain('A4')
  })

  it('filters by multiple types', () => {
    const result = FilterEngine.applyTypeFilter(objects, ['IfcWall', 'IfcColumn'])
    expect(result.visible).toContain('A1')
    expect(result.visible).toContain('A2')
    expect(result.visible).toContain('A3')
    expect(result.hidden).toContain('A4')
  })
})

// ── applyCombinedFilter ──────────────────────────────────────

describe('FilterEngine.applyCombinedFilter', () => {
  it('returns all visible when no filters active', () => {
    const result = FilterEngine.applyCombinedFilter(objects, [], [])
    expect(result.visible).toHaveLength(4)
  })

  it('combines layer and type — object must satisfy both', () => {
    // Only IfcWall with layer-cost → only A1
    const result = FilterEngine.applyCombinedFilter(
      objects,
      ['layer-cost'],
      ['IfcWall']
    )
    expect(result.visible).toEqual(['A1'])
  })
})