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
import type { Activity, CreateActivityPayload, UpdateActivityPayload } from '../types'

// ── Query keys ────────────────────────────────────────────────────────────────

export const activityKeys = {
  all:         ['activities']                      as const,
  detail:      (id: string) => ['activities', id]  as const,
  globalIdMap: ['activities', 'globalIdMap']       as const,
}

// ── useActivities ─────────────────────────────────────────────────────────────

/**
 * Fetches all activities and syncs them into the activity store.
 * Mirrors the pattern of useLayers() — React Query is the source of truth,
 * Zustand is the synchronised local cache consumed by components.
 */
export function useActivities(): UseQueryResult<Activity[]> {
  const setActivities = useActivityStore(s => s.setActivities)

  const query = useQuery<Activity[]>({
    queryKey: activityKeys.all,
    queryFn:  getActivities,
    // Always consider data fresh for 30 seconds; re-fetch in background after
    staleTime: 30_000,
  })

  // Sync into Zustand on every successful fetch
  useEffect(() => {
    if (query.data) {
      setActivities(query.data)
    }
  }, [query.data, setActivities])

  return query
}

// ── useActivityById ───────────────────────────────────────────────────────────

/**
 * Fetches a single activity by ID.
 * Used by modals / detail views that need fresh data.
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
 * Fetches the full globalId → activityIds[] map and syncs IFCObject.activityIds
 * in the viewer store, so SelectionStore and Simulation work against live DB data.
 *
 * This is the primary bridge between DB activity links and the viewer.
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

  // Patch IFCObject.activityIds whenever the map refreshes
  useEffect(() => {
    if (!query.data || ifcObjects.length === 0) return

    const map = query.data
    const patched = ifcObjects.map(obj => ({
      ...obj,
      activityIds: map.get(obj.globalId) ?? [],
    }))

    setIFCObjects(patched)
  }, [query.data, ifcObjects.length, setIFCObjects]) // intentionally omit `ifcObjects` ref

  return query
}

// ── useCreateActivity ─────────────────────────────────────────────────────────

/**
 * Mutation hook for creating a new activity.
 * Invalidates the activities query on success so the list refreshes.
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
  })
}

// ── useUpdateActivity ─────────────────────────────────────────────────────────

/**
 * Mutation hook for updating an existing activity.
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
  })
}

// ── useDeleteActivity ─────────────────────────────────────────────────────────

/**
 * Mutation hook for deleting an activity.
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
  })
}