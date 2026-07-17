/**
 * ui.store.ts — Zustand store for application-level UI state.
 *
 * Tracks:
 * - Global loading state (for operations that span multiple panels).
 * - Application-level errors (shown in a toast/notification system).
 * - Panel open/close state.
 *
 * Design principle:
 * - Domain errors (failed DB fetch, IFC parse error) surface through
 *   React Query's `isError` state or ViewerEngine callbacks. Those
 *   errors are displayed inline within the affected panel.
 * - This store is for cross-cutting errors that need a global notification,
 *   such as "Viewer failed to initialize" or "Network timeout".
 *
 * Relationship with React Query:
 * - This store does NOT duplicate React Query's loading/error state.
 * - Use `addError` only for errors that React Query cannot handle
 *   (e.g. ViewerEngine initialization, IFC WASM loading).
 *
 * @module ui.store
 */

import { create } from 'zustand'

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * An application-level error notification.
 * Stored in the errors array and dismissed by the user or auto-cleared.
 */
export type AppError = {
  /** Unique identifier for dismissal */
  id:      string
  /** User-facing error description */
  message: string
  /** Internal label for the originating system (e.g. "3D Viewer", "IFC Loader") */
  context: string
}

// ── State shape ───────────────────────────────────────────────────────────────

interface UIState {
  /**
   * Whether a long-running operation is in progress.
   * Set to true with a descriptive message during IFC parsing.
   * Components show a loading overlay when this is true.
   */
  isLoading: boolean

  /**
   * Human-readable description of the current loading operation.
   * Only meaningful when `isLoading = true`.
   */
  loadingMessage: string

  /**
   * Application-level error notifications.
   * Each entry shows as a dismissable notification in the UI.
   */
  errors: AppError[]

  /** Per-panel open/close state for collapsible panels. */
  isPanelOpen: {
    inspector: boolean
    layers:    boolean
    gantt:     boolean
  }

  // ── Actions ──────────────────────────────────────────────

  /**
   * Shows or hides the global loading overlay.
   *
   * @param loading - true to show, false to hide
   * @param message - Optional description shown in the loading indicator
   */
  setLoading: (loading: boolean, message?: string) => void

  /**
   * Adds an application-level error notification.
   * Automatically generates a unique ID for dismissal.
   *
   * @param message - User-facing error message
   * @param context - Internal label for the error origin (for console logging)
   */
  addError: (message: string, context: string) => void

  /**
   * Removes a single error notification by its ID.
   *
   * @param id - Error notification ID to remove
   */
  dismissError: (id: string) => void

  /** Removes all error notifications. */
  clearErrors: () => void

  /**
   * Toggles the open/close state of a named panel.
   *
   * @param panel - Panel name to toggle
   */
  togglePanel: (panel: keyof UIState['isPanelOpen']) => void
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useUIStore = create<UIState>((set) => ({
  isLoading:      false,
  loadingMessage: '',
  errors:         [],
  isPanelOpen: {
    inspector: true,
    layers:    false,
    gantt:     true,
  },

  setLoading: (loading, message = '') =>
    set({ isLoading: loading, loadingMessage: message }),

  addError: (message, context) =>
    set(state => ({
      errors: [
        ...state.errors,
        { id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, message, context },
      ],
    })),

  dismissError: (id) =>
    set(state => ({
      errors: state.errors.filter(e => e.id !== id),
    })),

  clearErrors: () => set({ errors: [] }),

  togglePanel: (panel) =>
    set(state => ({
      isPanelOpen: {
        ...state.isPanelOpen,
        [panel]: !state.isPanelOpen[panel],
      },
    })),
}))