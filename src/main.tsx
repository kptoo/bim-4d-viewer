import React from 'react'
import ReactDOM from 'react-dom/client'
import { ErrorBoundary } from './app/providers/ErrorBoundary'
import QueryProvider from './app/providers/QueryProvider'
import Layout from './components/Layout'
import './App.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryProvider>
      <ErrorBoundary context="Application Root">
        <Layout />
      </ErrorBoundary>
    </QueryProvider>
  </React.StrictMode>
)