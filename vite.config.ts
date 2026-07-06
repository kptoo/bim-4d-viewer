import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
  ],

  optimizeDeps: {
    exclude: ['web-ifc'],
  },

  // Remove COEP header — it blocks cross-origin WASM/worker fetches
  // from unpkg CDN. Only needed if using SharedArrayBuffer directly.
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },

  build: {
    target: 'esnext',
  },

  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})