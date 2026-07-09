import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query'
import { useEffect }     from 'react'
import { useLayerStore } from '../store/layer.store'
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

// ── Query keys ────────────────────────────────────────────────────────────────

export const assignmentKeys = {
  all:          ['assignments']                                      as const,
  byLayer:      (layerId: string)  => ['assignments', 'layer',  layerId] as const,
  byGlobalId:   (globalId: string) => ['assignments', 'object', globalId] as const,
  globalIdMap:  ['assignments', 'globalIdMap']                      as const,
}

// ── useAllAssignments ─────────────────────────────────────────────────────────

/**
 * Fetches ALL assignments and syncs them into the layer store.
 * Called once on app startup after model load.
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
 * Fetches all assignments for a specific layer.
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

// ── useGlobalIdLayerMap ────────────────────────────────────────────────────────

/**
 * Fetches the full globalId → layerIds[] map and syncs IFCObject.layerIds
 * in the viewer store so the FilterEngine can filter by layer.
 *
 * This is the primary bridge between DB assignments and the FilterEngine.
 */
export function useGlobalIdLayerMap(): UseQueryResult<Map<string, string[]>> {
  const setIFCObjects = useViewerStore(s => s.setIFCObjects)
  const ifcObjects    = useViewerStore(s => s.ifcObjects)

  const query = useQuery<Map<string, string[]>>({
    queryKey: assignmentKeys.globalIdMap,
    queryFn:  buildGlobalIdToLayerIdsMap,
    // Disable until objects are loaded
    enabled:  ifcObjects.length > 0,
  })

  // Patch IFCObject.layerIds whenever the map refreshes
  useEffect(() => {
    if (!query.data || ifcObjects.length === 0) return

    const map = query.data
    const patched = ifcObjects.map(obj => ({
      ...obj,
      layerIds: map.get(obj.globalId) ?? [],
    }))

    setIFCObjects(patched)
  }, [query.data, ifcObjects.length, setIFCObjects]) // intentionally omit `ifcObjects` ref

  return query
}

// ── useAssignLayer ────────────────────────────────────────────────────────────

interface AssignLayerVariables {
  layerId:   string
  globalIds: string[]
}

/**
 * Mutation hook for assigning one or more IFC objects to a layer.
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
  })
}

// ── useRemoveAssignment ────────────────────────────────────────────────────────

/**
 * Mutation hook for removing a single assignment by its UUID.
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
  })
}

// ── useRemoveObjectFromLayer ──────────────────────────────────────────────────

interface RemoveObjectVariables {
  layerId:  string
  globalId: string
}

/**
 * Mutation hook for removing a specific IFC object from a layer.
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
  })
}