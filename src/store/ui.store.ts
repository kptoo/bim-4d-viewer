/**
 * UI store — owns application-level UI state.
 *
 * Tracks loading states, errors, and panel visibility.
 * Keeps UI concerns out of all domain stores.
 */

import { create } from 'zustand'

export type AppError = {
  id:      string
  message: string
  context: string
}

interface UIState {
  isLoading:       boolean
  loadingMessage:  string
  errors:          AppError[]
  isPanelOpen: {
    inspector: boolean
    layers:    boolean
    gantt:     boolean
  }

  // ── Actions ──────────────────────────────────────────────
  setLoading:    (loading: boolean, message?: string) => void
  addError:      (message: string, context: string) => void
  dismissError:  (id: string) => void
  clearErrors:   () => void
  togglePanel:   (panel: keyof UIState['isPanelOpen']) => void
}

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
        { id: `err-${Date.now()}`, message, context },
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