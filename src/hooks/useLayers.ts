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

// ── Query keys ────────────────────────────────────────────────────────────────

export const layerKeys = {
  all:    ['layers']                     as const,
  counts: ['layers', 'counts']           as const,
  detail: (id: string) => ['layers', id] as const,
}

// ── useLayers ─────────────────────────────────────────────────────────────────

/**
 * Fetches all information layers and syncs them into the layer store.
 */
export function useLayers(): UseQueryResult<InformationLayer[]> {
  const setLayers = useLayerStore(s => s.setLayers)

  const query = useQuery<InformationLayer[]>({
    queryKey: layerKeys.all,
    queryFn:  fetchLayers,
  })

  // Sync into Zustand on every successful fetch so FilterEngine
  // continues to work via layer.store.layers.
  useEffect(() => {
    if (query.data) {
      setLayers(query.data)
    }
  }, [query.data, setLayers])

  return query
}

// ── useLayerCounts ─────────────────────────────────────────────────────────────

/**
 * Fetches assignment counts per layer.
 * Returns a Map<layerId, count>.
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
 * Invalidates the layers list on success.
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
      // Optimistically prepend to cache
      queryClient.setQueryData<InformationLayer[]>(
        layerKeys.all,
        (old = []) => [newLayer, ...old]
      )
      // Invalidate counts
      void queryClient.invalidateQueries({ queryKey: layerKeys.counts })
    },
  })
}

// ── useRenameLayer ────────────────────────────────────────────────────────────

interface RenameLayerVariables {
  id:      string
  newName: string
}

/**
 * Mutation hook for renaming a layer.
 * Optimistically updates the cache.
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
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: layerKeys.all })
    },
  })
}

// ── useDeleteLayer ────────────────────────────────────────────────────────────

/**
 * Mutation hook for deleting a layer.
 * Optimistically removes it from the cache.
 * The database CASCADE handles associated assignments.
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
      // Clear any active filter referencing the deleted layer
      clearFilter()
      void queryClient.invalidateQueries({ queryKey: layerKeys.counts })
    },

    onError: (_err, _vars, context) => {
      const ctx = context as { previous?: InformationLayer[] } | undefined
      if (ctx?.previous) {
        queryClient.setQueryData(layerKeys.all, ctx.previous)
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: layerKeys.all })
    },
  })
}