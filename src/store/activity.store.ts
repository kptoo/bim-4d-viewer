/**
 * Activity store — owns construction schedule state.
 *
 * Phase 1: seeded with mock data.
 * Phase 4: will be replaced by React Query + Neon API.
 */

import { create } from 'zustand'
import { ActivityLinker } from '../core/ifc/ActivityLinker'
import type { Activity, CreateActivityPayload, UpdateActivityPayload } from '../types'
import type { LinkMap } from '../core/ifc/ActivityLinker'

/** Mock activities — replaced by DB data in Phase 4 */
const MOCK_ACTIVITIES: Activity[] = [
  {
    id: 'task-1', name: 'Foundation Works',
    startDate: '2024-01-01', endDate: '2024-02-28',
    color: '#E67E22', linkedGlobalIds: ['A1','A2','A3'],
    dependencies: [], createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'task-2', name: 'Structural Frame',
    startDate: '2024-02-15', endDate: '2024-04-30',
    color: '#3498DB', linkedGlobalIds: ['A4','A5','A6'],
    dependencies: ['task-1'], createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'task-3', name: 'Facade & Slabs',
    startDate: '2024-04-01', endDate: '2024-06-30',
    color: '#9B59B6', linkedGlobalIds: ['A7','A8'],
    dependencies: ['task-2'], createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'task-4', name: 'MEP Installation',
    startDate: '2024-05-15', endDate: '2024-08-31',
    color: '#1ABC9C', linkedGlobalIds: ['A9','A10'],
    dependencies: ['task-2'], createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'task-5', name: 'Finishes',
    startDate: '2024-08-01', endDate: '2024-11-30',
    color: '#E74C3C', linkedGlobalIds: ['A11','A12'],
    dependencies: ['task-4'], createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
  },
]

interface ActivityState {
  activities: Activity[]
  /** Pre-computed bidirectional link map */
  linkMap:    LinkMap

  // ── Actions ──────────────────────────────────────────────
  setActivities:    (activities: Activity[]) => void
  addActivity:      (payload: CreateActivityPayload) => void
  updateActivity:   (payload: UpdateActivityPayload) => void
  deleteActivity:   (id: string) => void
  getActivityById:  (id: string) => Activity | undefined
  getActivitiesForObject: (globalId: string) => Activity[]
}

function buildLinkMap(activities: Activity[]): LinkMap {
  return ActivityLinker.buildLinkMap(activities)
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  activities: MOCK_ACTIVITIES,
  linkMap:    buildLinkMap(MOCK_ACTIVITIES),

  setActivities: (activities) =>
    set({ activities, linkMap: buildLinkMap(activities) }),

  addActivity: (payload) => {
    const newActivity: Activity = {
      ...payload,
      id:        `task-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const next = [...get().activities, newActivity]
    set({ activities: next, linkMap: buildLinkMap(next) })
  },

  updateActivity: (payload) => {
    const next = get().activities.map(a =>
      a.id === payload.id
        ? { ...a, ...payload, updatedAt: new Date().toISOString() }
        : a
    )
    set({ activities: next, linkMap: buildLinkMap(next) })
  },

  deleteActivity: (id) => {
    const next = get().activities.filter(a => a.id !== id)
    set({ activities: next, linkMap: buildLinkMap(next) })
  },

  getActivityById: (id) =>
    get().activities.find(a => a.id === id),

  getActivitiesForObject: (globalId) => {
    const ids = ActivityLinker.getActivitiesForObject(globalId, get().linkMap)
    return ids
      .map(id => get().activities.find(a => a.id === id))
      .filter((a): a is Activity => a !== undefined)
  },
}))