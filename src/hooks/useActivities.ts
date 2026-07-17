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
 * @module useActivities
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query'
import { useEffect }        from 'react'
import { useActivityStore } from '../store/activity.store'
import { useViewerStore }   from '../store/viewer.store'
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

/**
 * Centralised query key factory for the Activity domain.
 * Using a factory ensures consistent key shapes across hooks and invalidations.
 */
export const activityKeys = {
  /** Key for the complete activities list */
  all:         ['activities']                      as const,
  /** Key for a single activity by UUID */
  detail:      (id: string) => ['activities', id]  as const,
  /** Key for the globalId → activityIds[] mapping */
  globalIdMap: ['activities', 'globalIdMap']       as const,
} as const

// ── useActivities ─────────────────────────────────────────────────────────────

/**
 * Fetches all activities from the database and syncs them into the
 * activity store.
 *
 * Called by both ActivityPanel and GanttPanel. React Query deduplicates
 * concurrent calls — only one network request is made regardless of
 * how many components call this hook simultaneously.
 *
 * @returns UseQueryResult<Activity[]> — includes isLoading, isError, error, data
 */
export function useActivities(): UseQueryResult<Activity[]> {
  const setActivities = useActivityStore(s => s.setActivities)

  const query = useQuery<Activity[]>({
    queryKey: activityKeys.all,
    queryFn:  getActivities,
    // Data is fresh for 30 seconds; background refetch begins after
    staleTime: 30_000,
  })

  // Sync fetched data into the Zustand store so components that
  // read from useActivityStore get the latest data immediately.
  useEffect(() => {
    if (query.data) {
      setActivities(query.data)
    }
  }, [query.data, setActivities])

  return query
}

// ── useActivityById ───────────────────────────────────────────────────────────

/**
 * Fetches a single activity by its UUID.
 * Useful for detail views or modals that need guaranteed-fresh data.
 *
 * @param id - Activity UUID. Query is disabled when the string is empty.
 * @returns UseQueryResult<Activity | null> — null when the ID is not found
 */
export function useActivityById(id: string): UseQueryResult<Activity | null> {
  return useQuery<Activity | null>({
    queryKey: activityKeys.detail(id),
    queryFn:  () => getActivityById(id),
    enabled:  id.length > 0,
  })
}

// ── useGlobalIdActivityMap ────────────────────────────────────────────────────

/**
 * Fetches the complete globalId → activityIds[] mapping from the database
 * and patches IFCObject.activityIds in the viewer store.
 *
 * This is the primary bridge between database activity links and the
 * 3D viewer's IFC object metadata. The simulation engine and filter
 * engine both read activityIds from viewer store IFCObjects.
 *
 * Note: The query is disabled until IFC objects are loaded (enabled guard)
 * because there is nothing to patch without a model.
 *
 * @returns UseQueryResult<Map<string, string[]>>
 */
export function useGlobalIdActivityMap(): UseQueryResult<Map<string, string[]>> {
  const setIFCObjects = useViewerStore(s => s.setIFCObjects)
  const ifcObjects    = useViewerStore(s => s.ifcObjects)

  const query = useQuery<Map<string, string[]>>({
    queryKey: activityKeys.globalIdMap,
    queryFn:  buildGlobalIdToActivityIdsMap,
    enabled:  ifcObjects.length > 0,
    staleTime: 30_000,
  })

  // Patch IFCObject.activityIds whenever the map refreshes.
  // We use ifcObjects.length (not the reference) in the dependency array
  // intentionally — we only want to re-patch when the model changes,
  // not on every render where the array reference changes.
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

/**
 * Mutation hook for creating a new activity.
 *
 * On success:
 * - Invalidates the activities list (triggers refetch + store sync).
 * - Invalidates the globalIdMap (may have new links).
 *
 * @returns UseMutationResult<Activity, Error, CreateActivityPayload>
 */
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

/**
 * Mutation hook for updating an existing activity.
 *
 * On success:
 * - Invalidates the activities list.
 * - Invalidates the specific activity's detail cache.
 * - Invalidates the globalIdMap if links changed.
 *
 * @returns UseMutationResult<Activity | null, Error, UpdateActivityPayload>
 */
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

/**
 * Mutation hook for deleting an activity.
 * The database CASCADE rule handles associated activity_object_links rows.
 *
 * On success:
 * - Invalidates the activities list.
 * - Invalidates the specific activity's detail cache.
 * - Invalidates the globalIdMap (links are removed by CASCADE).
 *
 * @returns UseMutationResult<boolean, Error, string>
 *   The string variable is the activity UUID.
 *   Returns true if deleted, false if not found.
 */
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