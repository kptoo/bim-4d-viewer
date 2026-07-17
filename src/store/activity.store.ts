/**
 * activity.store.ts — Zustand store for construction schedule activities.
 *
 * Architecture:
 * - React Query is the source of truth for server data.
 * - This store is the synchronised in-memory cache consumed by components.
 * - The `linkMap` is pre-computed whenever activities are updated, providing
 *   O(1) lookups for both directions of the activity ↔ IFC object relationship.
 *
 * Update flow:
 *   DB fetch → useActivities() hook → setActivities() → store + linkMap rebuild
 *
 * Optimistic updates:
 * - addActivity, updateActivity, deleteActivity apply changes locally.
 * - The real data arrives via setActivities() after React Query invalidation.
 * - This gives instant UI feedback while the server processes the write.
 *
 * @module activity.store
 */

import { create }            from 'zustand'
import { ActivityLinker }    from '../core/ifc/ActivityLinker'
import type {
  Activity,
  CreateActivityPayload,
  UpdateActivityPayload,
} from '../types'
import type { LinkMap } from '../core/ifc/ActivityLinker'

// ── State shape ───────────────────────────────────────────────────────────────

interface ActivityState {
  /** All activities loaded from the database. Ordered by start_date ASC. */
  activities: Activity[]

  /**
   * Pre-computed bidirectional link map for O(1) lookups.
   * Rebuilt whenever `activities` changes via setActivities().
   */
  linkMap: LinkMap

  /**
   * Whether the initial DB fetch has completed.
   * Used to distinguish "loading" from "loaded + empty".
   */
  isLoaded: boolean

  // ── Actions ──────────────────────────────────────────────

  /**
   * Replaces the activity list with fresh data from the database.
   * Called by the useActivities() hook after a successful fetch.
   * Also rebuilds the linkMap and sets isLoaded = true.
   *
   * @param activities - Fresh activity array from the DB
   */
  setActivities: (activities: Activity[]) => void

  /**
   * Optimistically adds a new activity to the local list.
   * A temporary ID is assigned — overwritten when the real data arrives
   * via setActivities() after React Query invalidation.
   *
   * @param payload - Activity creation payload (no id/timestamps)
   */
  addActivity: (payload: CreateActivityPayload) => void

  /**
   * Optimistically updates an existing activity in the local list.
   * Applies a partial update — only provided fields are changed.
   *
   * @param payload - Partial activity with required `id`
   */
  updateActivity: (payload: UpdateActivityPayload) => void

  /**
   * Optimistically removes an activity from the local list by ID.
   *
   * @param id - Activity UUID to remove
   */
  deleteActivity: (id: string) => void

  /**
   * Returns a single activity by its UUID.
   * Returns undefined if not found.
   *
   * @param id - Activity UUID
   */
  getActivityById: (id: string) => Activity | undefined

  /**
   * Returns all activities linked to a specific IFC object.
   * Uses the pre-computed linkMap for O(1) lookup.
   *
   * @param globalId - IFC object GlobalId
   */
  getActivitiesForObject: (globalId: string) => Activity[]

  /**
   * Returns all IFC GlobalIds linked to a specific activity.
   * Uses the pre-computed linkMap for O(1) lookup.
   *
   * @param activityId - Activity UUID
   */
  getObjectsForActivity: (activityId: string) => string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds the bidirectional link map from an activity array.
 * Extracted as a named function for clarity.
 */
function buildLinkMap(activities: Activity[]): LinkMap {
  return ActivityLinker.buildLinkMap(activities)
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useActivityStore = create<ActivityState>((set, get) => ({
  activities: [],
  linkMap:    buildLinkMap([]),
  isLoaded:   false,

  setActivities: (activities) =>
    set({ activities, linkMap: buildLinkMap(activities), isLoaded: true }),

  addActivity: (payload) => {
    // Temporary ID — replaced when the real data arrives from the DB
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
    const activityIds = ActivityLinker.getActivitiesForObject(globalId, get().linkMap)
    return activityIds
      .map(id => get().activities.find(a => a.id === id))
      .filter((a): a is Activity => a !== undefined)
  },

  getObjectsForActivity: (activityId) =>
    ActivityLinker.getObjectsForActivity(activityId, get().linkMap),
}))