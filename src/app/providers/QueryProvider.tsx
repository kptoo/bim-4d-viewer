/**
 * QueryProvider — TanStack React Query client and provider.
 *
 * Configures a single QueryClient for the entire application.
 * All data fetching and caching flows through this client.
 *
 * Cache strategy:
 * - `staleTime: 60_000`   — data is considered fresh for 1 minute.
 *   After that, it is refetched in the background on the next use.
 * - `gcTime: 5 * 60_000`  — unused cache entries are garbage collected
 *   after 5 minutes of no active subscribers.
 * - `retry: 2`            — failed queries are retried twice before
 *   surfacing an error. Mutations retry once (DB writes should not
 *   be retried aggressively to avoid duplicate inserts).
 * - `refetchOnWindowFocus: false` — BIM app; users switch tabs during
 *   analysis and do not expect data to reload on focus.
 *
 * Error handling:
 * - Query errors surface via `useQuery(...).isError` and `.error` in
 *   each consuming hook. The QueryProvider itself does not intercept
 *   or swallow them.
 * - Mutation errors surface via `useMutation(...).error`.
 *
 * @module QueryProvider
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// ── QueryClient singleton ──────────────────────────────────────────────────────

/**
 * Singleton QueryClient.
 *
 * Created once at module load time so the same cache is shared
 * across all QueryProvider mounts (typically only one in production,
 * but important for Strict Mode double-invocation in development).
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * Data is fresh for 1 minute after the last successful fetch.
       * Background refetches begin only after this window expires.
       */
      staleTime: 60_000,

      /**
       * Garbage-collect unused cache entries after 5 minutes.
       * This keeps memory usage bounded in long-running sessions.
       */
      gcTime: 5 * 60_000,

      /**
       * Retry failed queries twice before surfacing an error to the UI.
       * The default exponential back-off applies (1s, 2s).
       */
      retry: 2,

      /**
       * Disable background refetch on window focus.
       * BIM sessions can be long and switching to another tab
       * (e.g. to review drawings) should not discard the model state.
       */
      refetchOnWindowFocus: false,

      /**
       * Disable automatic refetch on network reconnect in production.
       * The user is in control of when data should be refreshed.
       */
      refetchOnReconnect: 'always',
    },

    mutations: {
      /**
       * Retry failed mutations once.
       * DB write mutations must not be retried aggressively as this
       * risks duplicate INSERT operations for non-idempotent writes.
       * The retry is useful for transient network hiccups.
       */
      retry: 1,
    },
  },
})

// ── Provider ──────────────────────────────────────────────────────────────────

interface QueryProviderProps {
  children: ReactNode
}

/**
 * Wraps the application in the TanStack Query provider.
 * Must be placed above all components that call `useQuery` or `useMutation`.
 */
export default function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}