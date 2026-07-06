import React from 'react'
import ReactDOM from 'react-dom/client'
import { ErrorBoundary } from './app/providers/ErrorBoundary'
import Layout from './components/Layout'
import './App.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary context="Application Root">
      <Layout />
    </ErrorBoundary>
  </React.StrictMode>
)