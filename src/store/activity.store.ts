import { create }            from 'zustand'
import { ActivityLinker }    from '../core/ifc/ActivityLinker'
import type { Activity, CreateActivityPayload, UpdateActivityPayload } from '../types'
import type { LinkMap }      from '../core/ifc/ActivityLinker'

interface ActivityState {
  /** All activities loaded from the database */
  activities: Activity[]
  /** Pre-computed bidirectional link map for O(1) lookups */
  linkMap:    LinkMap
  /** Whether the initial DB fetch has completed */
  isLoaded:   boolean

  // ── Actions ──────────────────────────────────────────────

  /**
   * Called by useActivities() hook after a successful DB fetch.
   * Replaces the current in-memory list and rebuilds the link map.
   */
  setActivities: (activities: Activity[]) => void

  /**
   * Optimistic local add — used by useCreateActivity mutation's onMutate.
   * The real data arrives via setActivities() after cache invalidation.
   */
  addActivity: (payload: CreateActivityPayload) => void

  /**
   * Optimistic local update — used by useUpdateActivity mutation's onMutate.
   */
  updateActivity: (payload: UpdateActivityPayload) => void

  /**
   * Optimistic local delete — used by useDeleteActivity mutation's onMutate.
   */
  deleteActivity: (id: string) => void

  /** Selector: returns an activity by ID, or undefined */
  getActivityById: (id: string) => Activity | undefined

  /** Selector: returns all activities linked to an IFC object */
  getActivitiesForObject: (globalId: string) => Activity[]

  /** Selector: returns all IFC GlobalIds linked to an activity */
  getObjectsForActivity: (activityId: string) => string[]
}

function buildLinkMap(activities: Activity[]): LinkMap {
  return ActivityLinker.buildLinkMap(activities)
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  activities: [],
  linkMap:    buildLinkMap([]),
  isLoaded:   false,

  setActivities: (activities) =>
    set({ activities, linkMap: buildLinkMap(activities), isLoaded: true }),

  addActivity: (payload) => {
    // Generate a temporary ID — overwritten when the real data arrives
    const tempActivity: Activity = {
      ...payload,
      id:        `temp-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const next = [...get().activities, tempActivity]
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

  getObjectsForActivity: (activityId) =>
    ActivityLinker.getObjectsForActivity(activityId, get().linkMap),
}))