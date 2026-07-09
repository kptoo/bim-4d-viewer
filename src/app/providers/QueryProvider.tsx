import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:        60_000,        // 1 minute
      gcTime:           5 * 60_000,   // 5 minutes
      retry:            2,
      refetchOnWindowFocus: false,     // BIM app — no need to refetch on focus
    },
    mutations: {
      retry: 1,
    },
  },
})

interface QueryProviderProps {
  children: ReactNode
}

export default function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}