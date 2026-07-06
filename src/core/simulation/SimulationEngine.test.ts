/**
 * Unit tests for SimulationEngine.
 *
 * These tests verify pure business logic with no mocking needed.
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest'
import { SimulationEngine } from './SimulationEngine'
import type { Activity } from '../../types'

// ── Test fixtures ────────────────────────────────────────────

const makeActivity = (
  overrides: Partial<Activity> & { id: string }
): Activity => ({
  name:             'Test Activity',
  startDate:        '2024-01-01',
  endDate:          '2024-03-31',
  color:            '#3498DB',
  linkedGlobalIds:  [],
  dependencies:     [],
  createdAt:        '2024-01-01T00:00:00Z',
  updatedAt:        '2024-01-01T00:00:00Z',
  ...overrides,
})

// ── resolveStatus ────────────────────────────────────────────

describe('SimulationEngine.resolveStatus', () => {
  it('returns future when current date is before start', () => {
    const start = new Date('2024-02-01').getTime()
    const end   = new Date('2024-04-30').getTime()
    const now   = new Date('2024-01-15').getTime()
    expect(SimulationEngine.resolveStatus(now, start, end)).toBe('future')
  })

  it('returns active when current date equals start date', () => {
    const start = new Date('2024-02-01').getTime()
    const end   = new Date('2024-04-30').getTime()
    const now   = new Date('2024-02-01').getTime()
    expect(SimulationEngine.resolveStatus(now, start, end)).toBe('active')
  })

  it('returns active when current date is between start and end', () => {
    const start = new Date('2024-02-01').getTime()
    const end   = new Date('2024-04-30').getTime()
    const now   = new Date('2024-03-15').getTime()
    expect(SimulationEngine.resolveStatus(now, start, end)).toBe('active')
  })

  it('returns completed when current date is after end', () => {
    const start = new Date('2024-02-01').getTime()
    const end   = new Date('2024-04-30').getTime()
    const now   = new Date('2024-05-01').getTime()
    expect(SimulationEngine.resolveStatus(now, start, end)).toBe('completed')
  })
})

// ── computeFrames ────────────────────────────────────────────

describe('SimulationEngine.computeFrames', () => {
  it('returns empty map for empty activity list', () => {
    const frames = SimulationEngine.computeFrames(new Date(), [])
    expect(frames.size).toBe(0)
  })

  it('correctly marks a future object', () => {
    const activity = makeActivity({
      id:              'act-1',
      startDate:       '2024-06-01',
      endDate:         '2024-08-31',
      linkedGlobalIds: ['GLOBAL-001'],
    })
    const frames = SimulationEngine.computeFrames(
      new Date('2024-01-01'),
      [activity]
    )
    expect(frames.get('GLOBAL-001')?.status).toBe('future')
  })

  it('correctly marks an active object', () => {
    const activity = makeActivity({
      id:              'act-1',
      startDate:       '2024-01-01',
      endDate:         '2024-06-30',
      linkedGlobalIds: ['GLOBAL-001'],
    })
    const frames = SimulationEngine.computeFrames(
      new Date('2024-03-15'),
      [activity]
    )
    expect(frames.get('GLOBAL-001')?.status).toBe('active')
  })

  it('correctly marks a completed object', () => {
    const activity = makeActivity({
      id:              'act-1',
      startDate:       '2024-01-01',
      endDate:         '2024-03-31',
      linkedGlobalIds: ['GLOBAL-001'],
    })
    const frames = SimulationEngine.computeFrames(
      new Date('2024-05-01'),
      [activity]
    )
    expect(frames.get('GLOBAL-001')?.status).toBe('completed')
  })

  it('assigns correct color for each status', () => {
    const activities = [
      makeActivity({ id: 'a1', startDate: '2024-06-01', endDate: '2024-08-31', linkedGlobalIds: ['FUTURE'] }),
      makeActivity({ id: 'a2', startDate: '2024-01-01', endDate: '2024-06-30', linkedGlobalIds: ['ACTIVE'] }),
      makeActivity({ id: 'a3', startDate: '2024-01-01', endDate: '2024-02-28', linkedGlobalIds: ['DONE']   }),
    ]
    const frames = SimulationEngine.computeFrames(new Date('2024-04-01'), activities)
    expect(frames.get('FUTURE')?.color).toBe('#B0B0B0')
    expect(frames.get('ACTIVE')?.color).toBe('#2F6BFF')
    expect(frames.get('DONE')?.color  ).toBe('#2ECC71')
  })

  it('active takes priority over completed for overlapping activities', () => {
    const activities = [
      makeActivity({ id: 'a1', startDate: '2024-01-01', endDate: '2024-02-28', linkedGlobalIds: ['OBJ-1'] }),
      makeActivity({ id: 'a2', startDate: '2024-02-15', endDate: '2024-06-30', linkedGlobalIds: ['OBJ-1'] }),
    ]
    // On Feb 20 — a1 is completed, a2 is active → active wins
    const frames = SimulationEngine.computeFrames(
      new Date('2024-02-20'),
      activities
    )
    expect(frames.get('OBJ-1')?.status).toBe('active')
  })

  it('returns future for objects not linked to any activity', () => {
    const frames = SimulationEngine.computeFrames(
      new Date('2024-06-01'),
      [makeActivity({ id: 'a1', linkedGlobalIds: ['OTHER'] })]
    )
    expect(frames.get('UNLINKED')).toBeUndefined()
  })
})

// ── computeObjectStatus ──────────────────────────────────────

describe('SimulationEngine.computeObjectStatus', () => {
  it('returns future for unknown globalId', () => {
    const status = SimulationEngine.computeObjectStatus(
      'UNKNOWN',
      new Date('2024-06-01'),
      []
    )
    expect(status).toBe('future')
  })

  it('returns correct status for a known globalId', () => {
    const activity = makeActivity({
      id:              'a1',
      startDate:       '2024-01-01',
      endDate:         '2024-12-31',
      linkedGlobalIds: ['WALL-001'],
    })
    const status = SimulationEngine.computeObjectStatus(
      'WALL-001',
      new Date('2024-06-01'),
      [activity]
    )
    expect(status).toBe('active')
  })
})