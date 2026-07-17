/**
 * useAssignments — React Query hooks for the Layer Assignment domain.
 *
 * Layer assignments link IFC object GlobalIds to information layers.
 * These hooks provide all CRUD operations needed to manage those links.
 *
 * Architecture:
 * - React Query owns the server state.
 * - useLayerStore holds the denormalised assignment list for O(1) lookups
 *   (e.g. getLayersForObject during filter evaluation).
 * - useViewerStore.ifcObjects[].layerIds is patched by useGlobalIdLayerMap()
 *   so the FilterEngine can evaluate layer filters without a DB call.
 *
 * @module useAssignments
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query'
import { useEffect }      from 'react'
import { useLayerStore }  from '../store/layer.store'
import { useViewerStore } from '../store/viewer.store'
import {
  fetchAllAssignments,
  fetchAssignmentsByLayer,
  fetchAssignmentsByGlobalId,
  assignObjectsToLayer,
  removeAssignment,
  removeObjectFromLayer,
  buildGlobalIdToLayerIdsMap,
} from '../services/api/assignments.api'
import { layerKeys } from './useLayers'
import type { LayerAssignment } from '../types'

// ── Query key factory ─────────────────────────────────────────────────────────

/**
 * Centralised query key factory for the Assignment domain.
 */
export const assignmentKeys = {
  /** Key for all assignments */
  all:         ['assignments']                                          as const,
  /** Key for assignments filtered to a specific layer */
  byLayer:     (layerId: string)  => ['assignments', 'layer',  layerId] as const,
  /** Key for assignments filtered to a specific IFC object */
  byGlobalId:  (globalId: string) => ['assignments', 'object', globalId] as const,
  /** Key for the globalId → layerIds[] mapping used to patch viewer store */
  globalIdMap: ['assignments', 'globalIdMap']                          as const,
} as const

// ── useAllAssignments ─────────────────────────────────────────────────────────

/**
 * Fetches ALL assignments from the database and syncs them into the layer store.
 *
 * Called once in IFCViewer after model load to seed the layer store.
 * The layer store's assignments list is read by getLayersForObject() which
 * powers the IFCInspector's layer badge display.
 *
 * @returns UseQueryResult<LayerAssignment[]>
 */
export function useAllAssignments(): UseQueryResult<LayerAssignment[]> {
  const setAssignments = useLayerStore(s => s.setAssignments)

  const query = useQuery<LayerAssignment[]>({
    queryKey: assignmentKeys.all,
    queryFn:  fetchAllAssignments,
  })

  useEffect(() => {
    if (query.data) {
      setAssignments(query.data)
    }
  }, [query.data, setAssignments])

  return query
}

// ── useAssignmentsByLayer ─────────────────────────────────────────────────────

/**
 * Fetches all assignments for a specific information layer.
 * Used by the LayerAssignmentPanel to list assigned objects.
 *
 * @param layerId - Layer UUID. Query disabled when empty.
 * @returns UseQueryResult<LayerAssignment[]>
 */
export function useAssignmentsByLayer(
  layerId: string
): UseQueryResult<LayerAssignment[]> {
  return useQuery<LayerAssignment[]>({
    queryKey: assignmentKeys.byLayer(layerId),
    queryFn:  () => fetchAssignmentsByLayer(layerId),
    enabled:  layerId.length > 0,
  })
}

// ── useAssignmentsByGlobalId ──────────────────────────────────────────────────

/**
 * Fetches all layer assignments for a specific IFC object.
 * Used by the IFCInspector to show which layers an object belongs to.
 *
 * @param globalId - IFC object GlobalId. Query disabled when empty.
 * @returns UseQueryResult<LayerAssignment[]>
 */
export function useAssignmentsByGlobalId(
  globalId: string
): UseQueryResult<LayerAssignment[]> {
  return useQuery<LayerAssignment[]>({
    queryKey: assignmentKeys.byGlobalId(globalId),
    queryFn:  () => fetchAssignmentsByGlobalId(globalId),
    enabled:  globalId.length > 0,
  })
}

// ── useGlobalIdLayerMap ───────────────────────────────────────────────────────

/**
 * Fetches the complete globalId → layerIds[] mapping and patches
 * IFCObject.layerIds in the viewer store.
 *
 * This is the primary bridge between database assignments and the
 * FilterEngine. The FilterEngine reads layerIds from IFCObjects to
 * determine which objects to show/hide based on active layer filters.
 *
 * Guard: Query is disabled until IFC objects are loaded (ifcObjects.length > 0).
 *
 * @returns UseQueryResult<Map<string, string[]>>
 */
export function useGlobalIdLayerMap(): UseQueryResult<Map<string, string[]>> {
  const setIFCObjects = useViewerStore(s => s.setIFCObjects)
  const ifcObjects    = useViewerStore(s => s.ifcObjects)

  const query = useQuery<Map<string, string[]>>({
    queryKey: assignmentKeys.globalIdMap,
    queryFn:  buildGlobalIdToLayerIdsMap,
    enabled:  ifcObjects.length > 0,
  })

  // Patch IFCObject.layerIds whenever the map refreshes.
  // intentionally using ifcObjects.length (not the array reference) to avoid
  // infinite patch loops when setIFCObjects changes the array reference.
  useEffect(() => {
    if (!query.data || ifcObjects.length === 0) return

    const map     = query.data
    const patched = ifcObjects.map(obj => ({
      ...obj,
      layerIds: map.get(obj.globalId) ?? [],
    }))

    setIFCObjects(patched)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, ifcObjects.length, setIFCObjects])

  return query
}

// ── useAssignLayer ────────────────────────────────────────────────────────────

interface AssignLayerVariables {
  layerId:   string
  globalIds: string[]
}

/**
 * Mutation hook for assigning one or more IFC objects to a layer.
 *
 * The underlying SQL uses ON CONFLICT DO NOTHING so repeated calls
 * are safe (idempotent at the database level).
 *
 * On success: invalidates all assignment keys + layer counts.
 *
 * @returns UseMutationResult<LayerAssignment[], Error, AssignLayerVariables>
 */
export function useAssignLayer(): UseMutationResult<
  LayerAssignment[],
  Error,
  AssignLayerVariables
> {
  const queryClient = useQueryClient()

  return useMutation<LayerAssignment[], Error, AssignLayerVariables>({
    mutationFn: ({ layerId, globalIds }) =>
      assignObjectsToLayer(layerId, globalIds),

    onSuccess: (_newAssignments, { layerId }) => {
      void queryClient.invalidateQueries({ queryKey: assignmentKeys.all })
      void queryClient.invalidateQueries({ queryKey: assignmentKeys.byLayer(layerId) })
      void queryClient.invalidateQueries({ queryKey: assignmentKeys.globalIdMap })
      void queryClient.invalidateQueries({ queryKey: layerKeys.counts })
    },

    onError: (error) => {
      console.error('[useAssignLayer] Failed to assign objects to layer:', error.message)
    },
  })
}

// ── useRemoveAssignment ───────────────────────────────────────────────────────

/**
 * Mutation hook for removing a single assignment by its UUID.
 *
 * @returns UseMutationResult<boolean, Error, string>
 *   The string variable is the assignment UUID.
 */
export function useRemoveAssignment(): UseMutationResult<boolean, Error, string> {
  const queryClient = useQueryClient()

  return useMutation<boolean, Error, string>({
    mutationFn: (id) => removeAssignment(id),

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: assignmentKeys.all })
      void queryClient.invalidateQueries({ queryKey: assignmentKeys.globalIdMap })
      void queryClient.invalidateQueries({ queryKey: layerKeys.counts })
    },

    onError: (error) => {
      console.error('[useRemoveAssignment] Failed to remove assignment:', error.message)
    },
  })
}

// ── useRemoveObjectFromLayer ──────────────────────────────────────────────────

interface RemoveObjectVariables {
  layerId:  string
  globalId: string
}

/**
 * Mutation hook for removing a specific IFC object from a layer.
 * Useful when unassigning a single element from within the Inspector panel.
 *
 * @returns UseMutationResult<number, Error, RemoveObjectVariables>
 *   The number result is the count of rows deleted (0 or 1).
 */
export function useRemoveObjectFromLayer(): UseMutationResult<
  number,
  Error,
  RemoveObjectVariables
> {
  const queryClient = useQueryClient()

  return useMutation<number, Error, RemoveObjectVariables>({
    mutationFn: ({ layerId, globalId }) =>
      removeObjectFromLayer(layerId, globalId),

    onSuccess: (_count, { layerId }) => {
      void queryClient.invalidateQueries({ queryKey: assignmentKeys.all })
      void queryClient.invalidateQueries({ queryKey: assignmentKeys.byLayer(layerId) })
      void queryClient.invalidateQueries({ queryKey: assignmentKeys.globalIdMap })
      void queryClient.invalidateQueries({ queryKey: layerKeys.counts })
    },

    onError: (error) => {
      console.error('[useRemoveObjectFromLayer] Failed:', error.message)
    },
  })
}