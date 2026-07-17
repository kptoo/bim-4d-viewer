/**
 * App.tsx — Top-level application component.
 *
 * Intentionally minimal. Its sole purpose is to serve as the composition
 * root for any future router or provider layers that sit above Layout.
 *
 * All application layout and panel composition lives in Layout.tsx.
 * All providers (QueryProvider, ErrorBoundary) live in main.tsx.
 *
 * @module App
 */

import Layout from '../components/Layout'

export default function App() {
  return <Layout />
}