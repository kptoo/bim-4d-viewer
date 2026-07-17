/**
 * useLayers — React Query hooks for the Information Layer domain.
 *
 * Architecture:
 * - React Query is the source of truth for server data.
 * - Zustand (useLayerStore) is the synchronised local cache for layers.
 * - Optimistic updates are applied for rename, color, and delete operations
 *   to give instant UI feedback while the server processes the request.
 *
 * Optimistic update pattern:
 *   1. onMutate:  Cancel in-flight queries, snapshot cache, apply optimistic update.
 *   2. onError:   Roll back to the snapshot.
 *   3. onSettled: Invalidate to sync with server truth.
 *
 * @module useLayers
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query'
import { useEffect }     from 'react'
import { useLayerStore } from '../store/layer.store'
import {
  fetchLayers,
  createLayer,
  renameLayer,
  updateLayerColor,
  deleteLayer,
  fetchLayerCounts,
} from '../services/api/layers.api'
import type {
  InformationLayer,
  CreateLayerPayload,
} from '../types'

// ── Query key factory ─────────────────────────────────────────────────────────

/**
 * Centralised query key factory for the Layer domain.
 */
export const layerKeys = {
  /** Key for the complete layers list */
  all:    ['layers']                     as const,
  /** Key for assignment counts per layer */
  counts: ['layers', 'counts']           as const,
  /** Key for a single layer by UUID */
  detail: (id: string) => ['layers', id] as const,
} as const

// ── useLayers ─────────────────────────────────────────────────────────────────

/**
 * Fetches all information layers and syncs them into the layer store.
 *
 * Called by LayerPanel. React Query deduplicates concurrent calls so
 * multiple consumers share a single network request.
 *
 * @returns UseQueryResult<InformationLayer[]>
 */
export function useLayers(): UseQueryResult<InformationLayer[]> {
  const setLayers = useLayerStore(s => s.setLayers)

  const query = useQuery<InformationLayer[]>({
    queryKey: layerKeys.all,
    queryFn:  fetchLayers,
  })

  // Sync fetched data into Zustand so FilterEngine continues to work
  // via layer.store.layers (FilterEngine is not React-aware).
  useEffect(() => {
    if (query.data) {
      setLayers(query.data)
    }
  }, [query.data, setLayers])

  return query
}

// ── useLayerCounts ────────────────────────────────────────────────────────────

/**
 * Fetches assignment counts per layer.
 *
 * Returns a Map<layerId, count> used for displaying "X elements" badges
 * on each layer row in the UI.
 *
 * @returns UseQueryResult<Map<string, number>>
 */
export function useLayerCounts(): UseQueryResult<Map<string, number>> {
  return useQuery<Map<string, number>>({
    queryKey: layerKeys.counts,
    queryFn:  fetchLayerCounts,
  })
}

// ── useCreateLayer ────────────────────────────────────────────────────────────

interface CreateLayerVariables {
  payload: CreateLayerPayload
}

/**
 * Mutation hook for creating a new information layer.
 *
 * On success:
 * - Prepends the new layer to the React Query cache (optimistic feel).
 * - Invalidates layer counts (the new layer has 0 assignments).
 *
 * @returns UseMutationResult<InformationLayer, Error, CreateLayerVariables>
 */
export function useCreateLayer(): UseMutationResult<
  InformationLayer,
  Error,
  CreateLayerVariables
> {
  const queryClient = useQueryClient()

  return useMutation<InformationLayer, Error, CreateLayerVariables>({
    mutationFn: ({ payload }) => createLayer(payload),

    onSuccess: (newLayer) => {
      // Optimistically prepend to the cache — avoids a round-trip refetch
      queryClient.setQueryData<InformationLayer[]>(
        layerKeys.all,
        (old = []) => [newLayer, ...old]
      )
      void queryClient.invalidateQueries({ queryKey: layerKeys.counts })
    },

    onError: (error) => {
      console.error('[useCreateLayer] Failed to create layer:', error.message)
      // Invalidate to restore server state in case the optimistic update is stale
      void queryClient.invalidateQueries({ queryKey: layerKeys.all })
    },
  })
}

// ── useRenameLayer ────────────────────────────────────────────────────────────

interface RenameLayerVariables {
  id:      string
  newName: string
}

/**
 * Mutation hook for renaming an information layer.
 *
 * Uses a full optimistic update pattern:
 * - Applies the new name immediately in the cache.
 * - Rolls back on server error.
 * - Re-syncs with the server on settle.
 *
 * @returns UseMutationResult<InformationLayer | null, Error, RenameLayerVariables>
 */
export function useRenameLayer(): UseMutationResult<
  InformationLayer | null,
  Error,
  RenameLayerVariables
> {
  const queryClient = useQueryClient()

  return useMutation<InformationLayer | null, Error, RenameLayerVariables>({
    mutationFn: ({ id, newName }) => renameLayer(id, newName),

    onMutate: async ({ id, newName }) => {
      await queryClient.cancelQueries({ queryKey: layerKeys.all })
      const previous = queryClient.getQueryData<InformationLayer[]>(layerKeys.all)

      queryClient.setQueryData<InformationLayer[]>(
        layerKeys.all,
        (old = []) => old.map(l => l.id === id ? { ...l, name: newName } : l)
      )

      return { previous }
    },

    onError: (_err, _vars, context) => {
      const ctx = context as { previous?: InformationLayer[] } | undefined
      if (ctx?.previous) {
        queryClient.setQueryData(layerKeys.all, ctx.previous)
      }
      console.error('[useRenameLayer] Failed:', _err.message)
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: layerKeys.all })
    },
  })
}

// ── useUpdateLayerColor ───────────────────────────────────────────────────────

interface UpdateColorVariables {
  id:    string
  color: string
}

/**
 * Mutation hook for updating a layer's display color.
 *
 * Uses optimistic update: immediately applies the color change in the
 * cache so the swatch updates without a round-trip delay.
 *
 * @returns UseMutationResult<InformationLayer | null, Error, UpdateColorVariables>
 */
export function useUpdateLayerColor(): UseMutationResult<
  InformationLayer | null,
  Error,
  UpdateColorVariables
> {
  const queryClient = useQueryClient()

  return useMutation<InformationLayer | null, Error, UpdateColorVariables>({
    mutationFn: ({ id, color }) => updateLayerColor(id, color),

    onMutate: async ({ id, color }) => {
      await queryClient.cancelQueries({ queryKey: layerKeys.all })
      const previous = queryClient.getQueryData<InformationLayer[]>(layerKeys.all)

      queryClient.setQueryData<InformationLayer[]>(
        layerKeys.all,
        (old = []) => old.map(l => l.id === id ? { ...l, color } : l)
      )

      return { previous }
    },

    onError: (_err, _vars, context) => {
      const ctx = context as { previous?: InformationLayer[] } | undefined
      if (ctx?.previous) {
        queryClient.setQueryData(layerKeys.all, ctx.previous)
      }
      console.error('[useUpdateLayerColor] Failed:', _err.message)
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: layerKeys.all })
    },
  })
}

// ── useDeleteLayer ────────────────────────────────────────────────────────────

/**
 * Mutation hook for deleting an information layer.
 * The database CASCADE rule removes all associated assignments automatically.
 *
 * Uses optimistic update: immediately removes the layer from the cache
 * so the UI updates without waiting for the server.
 *
 * On success: clears any active filter that referenced the deleted layer.
 *
 * @returns UseMutationResult<boolean, Error, string>
 *   The string variable is the layer UUID.
 */
export function useDeleteLayer(): UseMutationResult<boolean, Error, string> {
  const queryClient = useQueryClient()
  const clearFilter = useLayerStore(s => s.clearFilters)

  return useMutation<boolean, Error, string>({
    mutationFn: (id) => deleteLayer(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: layerKeys.all })
      const previous = queryClient.getQueryData<InformationLayer[]>(layerKeys.all)

      queryClient.setQueryData<InformationLayer[]>(
        layerKeys.all,
        (old = []) => old.filter(l => l.id !== id)
      )

      return { previous }
    },

    onSuccess: () => {
      // Clear filters — the deleted layer may have been an active filter
      clearFilter()
      void queryClient.invalidateQueries({ queryKey: layerKeys.counts })
    },

    onError: (_err, _vars, context) => {
      const ctx = context as { previous?: InformationLayer[] } | undefined
      if (ctx?.previous) {
        queryClient.setQueryData(layerKeys.all, ctx.previous)
      }
      console.error('[useDeleteLayer] Failed:', _err.message)
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: layerKeys.all })
    },
  })
}