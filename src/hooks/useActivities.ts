/**
 * useActivities — React Query hooks for the Activity domain.
 *
 * Architecture:
 * - React Query is the source of truth for server data.
 * - Zustand (useActivityStore) is the synchronised local cache.
 * - Components read from Zustand for O(1) access patterns.
 * - React Query handles background refetch, retry, and cache invalidation.
 *
 * Query keys:
 *   activityKeys.all         → all activities list
 *   activityKeys.detail(id)  → single activity by ID
 *   activityKeys.globalIdMap → globalId → activityIds[] mapping
 *
 * Cache invalidation strategy:
 * - Mutations invalidate all affected query keys after a confirmed DB write.
 * - The globalIdMap is always invalidated alongside activity mutations because
 *   links between activities and IFC objects may have changed.
 *
 * Activity-scoped timeline change (this iteration):
 * - `useActivities` now calls `setFullProjectDates` instead of `setProjectDates`.
 *
 *   `setFullProjectDates(start, end)` records the project-wide date range as
 *   the "home" position and simultaneously syncs the active window to it.
 *   This means:
 *     - On initial load (no activity selected): slider spans the full project.
 *     - When an activity is selected: `useActivityTimeline` narrows the active
 *       window to that activity's dates via `setProjectDates`.
 *     - When selection clears: `useActivityTimeline` restores the full range
 *       from `fullProjectStart` / `fullProjectEnd` via `setProjectDates`.
 *     - If activities are edited and the DB refetches: `setFullProjectDates`
 *       updates the home range. If no activity is selected, the active window
 *       also updates automatically.
 *
 * @module useActivities
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query'
import { useEffect }              from 'react'
import { useActivityStore }       from '../store/activity.store'
import { useViewerStore }         from '../store/viewer.store'
import { useSimulationStore }     from '../store/simulation.store'
import {
  getActivities,
  getActivityById,
  createActivity,
  updateActivity,
  deleteActivity,
  buildGlobalIdToActivityIdsMap,
} from '../services/api/activities.api'
import type {
  Activity,
  CreateActivityPayload,
  UpdateActivityPayload,
} from '../types'

// ── Query key factory ─────────────────────────────────────────────────────────

export const activityKeys = {
  all:         ['activities']                      as const,
  detail:      (id: string) => ['activities', id]  as const,
  globalIdMap: ['activities', 'globalIdMap']       as const,
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Derives the project-wide simulation date range from all activities.
 *
 * Adds 30-day padding on each side so the slider has visual breathing room
 * at both ends (matches GanttPanel's `deriveProjectRange` convention).
 *
 * Falls back to the current calendar year when the activity list is empty.
 *
 * @param activities - All loaded activities
 * @returns { start: Date, end: Date }
 */
function deriveFullProjectRange(activities: Activity[]): { start: Date; end: Date } {
  if (activities.length === 0) {
    const year = new Date().getFullYear()
    return {
      start: new Date(`${year}-01-01`),
      end:   new Date(`${year}-12-31`),
    }
  }

  let minMs = Infinity
  let maxMs = -Infinity

  for (const activity of activities) {
    const s = new Date(activity.startDate).getTime()
    const e = new Date(activity.endDate).getTime()
    if (s < minMs) minMs = s
    if (e > maxMs) maxMs = e
  }

  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
  return {
    start: new Date(minMs - THIRTY_DAYS),
    end:   new Date(maxMs + THIRTY_DAYS),
  }
}

// ── useActivities ─────────────────────────────────────────────────────────────

/**
 * Fetches all activities from the database, syncs them into the activity
 * store, and records the project-wide simulation date range.
 *
 * Called by both ActivityPanel and GanttPanel. React Query deduplicates
 * concurrent calls — only one network request is made regardless of
 * how many components call this hook simultaneously.
 *
 * @returns UseQueryResult<Activity[]>
 */
export function useActivities(): UseQueryResult<Activity[]> {
  const setActivities       = useActivityStore(s => s.setActivities)
  const setFullProjectDates = useSimulationStore(s => s.setFullProjectDates)

  const query = useQuery<Activity[]>({
    queryKey: activityKeys.all,
    queryFn:  getActivities,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!query.data) return

    // 1. Sync activities into the Zustand activity store
    setActivities(query.data)

    // 2. Derive the project-wide date range and record it as the home position.
    //    setFullProjectDates() also updates the active window (projectStart /
    //    projectEnd) so the slider reflects the full project when no activity
    //    is selected.
    //
    //    When an activity IS selected, useActivityTimeline has already narrowed
    //    the active window. setFullProjectDates only touches fullProjectStart /
    //    fullProjectEnd directly — the active window is re-synced to the full
    //    range via setProjectDates() inside setFullProjectDates, but only if no
    //    activity selection is active. See useActivityTimeline for that guard.
    //
    //    NOTE: We call setFullProjectDates unconditionally here. The reason this
    //    is safe even when an activity is selected is that useActivityTimeline's
    //    useEffect (which watches selectedActivityId) will re-fire after this
    //    effect runs, restoring the activity-scoped window.
    const { start, end } = deriveFullProjectRange(query.data)
    setFullProjectDates(start, end)

  }, [query.data, setActivities, setFullProjectDates])

  return query
}

// ── useActivityById ───────────────────────────────────────────────────────────

export function useActivityById(id: string): UseQueryResult<Activity | null> {
  return useQuery<Activity | null>({
    queryKey: activityKeys.detail(id),
    queryFn:  () => getActivityById(id),
    enabled:  id.length > 0,
  })
}

// ── useGlobalIdActivityMap ────────────────────────────────────────────────────

export function useGlobalIdActivityMap(): UseQueryResult<Map<string, string[]>> {
  const setIFCObjects = useViewerStore(s => s.setIFCObjects)
  const ifcObjects    = useViewerStore(s => s.ifcObjects)

  const query = useQuery<Map<string, string[]>>({
    queryKey: activityKeys.globalIdMap,
    queryFn:  buildGlobalIdToActivityIdsMap,
    enabled:  ifcObjects.length > 0,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!query.data || ifcObjects.length === 0) return

    const map     = query.data
    const patched = ifcObjects.map(obj => ({
      ...obj,
      activityIds: map.get(obj.globalId) ?? [],
    }))

    setIFCObjects(patched)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, ifcObjects.length, setIFCObjects])

  return query
}

// ── useCreateActivity ─────────────────────────────────────────────────────────

export function useCreateActivity(): UseMutationResult<
  Activity,
  Error,
  CreateActivityPayload
> {
  const queryClient = useQueryClient()

  return useMutation<Activity, Error, CreateActivityPayload>({
    mutationFn: (payload) => createActivity(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: activityKeys.all })
      void queryClient.invalidateQueries({ queryKey: activityKeys.globalIdMap })
    },
    onError: (error) => {
      console.error('[useCreateActivity] Failed to create activity:', error.message)
    },
  })
}

// ── useUpdateActivity ─────────────────────────────────────────────────────────

export function useUpdateActivity(): UseMutationResult<
  Activity | null,
  Error,
  UpdateActivityPayload
> {
  const queryClient = useQueryClient()

  return useMutation<Activity | null, Error, UpdateActivityPayload>({
    mutationFn: (payload) => updateActivity(payload),
    onSuccess: (_result, payload) => {
      void queryClient.invalidateQueries({ queryKey: activityKeys.all })
      void queryClient.invalidateQueries({ queryKey: activityKeys.detail(payload.id) })
      void queryClient.invalidateQueries({ queryKey: activityKeys.globalIdMap })
    },
    onError: (error) => {
      console.error('[useUpdateActivity] Failed to update activity:', error.message)
    },
  })
}

// ── useDeleteActivity ─────────────────────────────────────────────────────────

export function useDeleteActivity(): UseMutationResult<boolean, Error, string> {
  const queryClient = useQueryClient()

  return useMutation<boolean, Error, string>({
    mutationFn: (id) => deleteActivity(id),
    onSuccess: (_result, id) => {
      void queryClient.invalidateQueries({ queryKey: activityKeys.all })
      void queryClient.invalidateQueries({ queryKey: activityKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: activityKeys.globalIdMap })
    },
    onError: (error) => {
      console.error('[useDeleteActivity] Failed to delete activity:', error.message)
    },
  })
}