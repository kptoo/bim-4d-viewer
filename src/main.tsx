/**
 * main.tsx — Application entry point.
 *
 * Provider stack (outermost to innermost):
 *
 *   React.StrictMode
 *   └── QueryProvider          (TanStack Query client)
 *       └── ErrorBoundary      (top-level crash recovery)
 *           └── Layout         (application UI)
 *
 * Strict Mode intentionally double-invokes effects in development to
 * surface lifecycle bugs early. The ViewerEngine's dispose guard
 * (`if (this.isDisposed) return`) handles the double-mount case.
 *
 * The root ErrorBoundary is a last-resort safety net. Panel-level
 * error boundaries in Layout.tsx provide more granular recovery.
 *
 * @module main
 */

import React            from 'react'
import ReactDOM         from 'react-dom/client'
import { ErrorBoundary } from './app/providers/ErrorBoundary'
import QueryProvider    from './app/providers/QueryProvider'
import Layout           from './components/Layout'
import './App.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error(
    '[main] Root element #root not found in index.html. ' +
    'Ensure <div id="root"></div> is present in the HTML.'
  )
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryProvider>
      <ErrorBoundary context="Application Root">
        <Layout />
      </ErrorBoundary>
    </QueryProvider>
  </React.StrictMode>
)