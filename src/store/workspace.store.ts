/**
 * workspace.store.ts — Zustand store for Phase 6 workspace layout state.
 *
 * Manages:
 * - Which side panel is currently open (single-panel policy)
 * - Gantt dock: collapsed state + remembered height
 * - Panel widths (future: per-panel drag-resize)
 *
 * Phase 6 continuation change:
 * - `ganttCollapsed` now defaults to `true` so the Gantt dock starts hidden,
 *   exactly matching the hide-by-default behaviour of every SlidePanel.
 *   The NavRail Gantt icon calls `toggleGantt()` to open/close it on demand.
 *
 * Design principles:
 * - Single active side panel at a time (clicking a second panel closes the first).
 * - Gantt dock height survives collapse/expand cycles via lastGanttHeight.
 * - This store is UI-only; no business logic or domain data lives here.
 * - Keeps existing ui.store intact — this store extends, does not replace it.
 *
 * @module workspace.store
 */

import { create } from 'zustand'

// ── Panel identifiers ──────────────────────────────────────────────────────────

/**
 * All panels reachable from the left navigation rail.
 * 'none' means no slide-out panel is open (viewer fills the space).
 */
export type SidePanel =
  | 'ifc'
  | 'layers'
  | 'activities'
  | 'inspector'
  | 'settings'
  | 'none'

// ── State shape ───────────────────────────────────────────────────────────────

interface WorkspaceState {
  /** The currently visible slide-out panel. 'none' = viewer-only mode. */
  activePanel: SidePanel

  /** Width of the open side panel in pixels. User-resizable (future). */
  panelWidth: number

  /**
   * Whether the bottom Gantt / 4D Timeline dock is collapsed.
   *
   * Defaults to `true` — the Gantt starts hidden, exactly like every other
   * panel, and opens only when the user clicks its NavRail icon.
   */
  ganttCollapsed: boolean

  /** Height of the Gantt dock in pixels when expanded. Persists across collapse. */
  ganttHeight: number

  /** The last non-zero Gantt height — used to restore after collapse. */
  lastGanttHeight: number

  // ── Actions ──────────────────────────────────────────────────────────

  /**
   * Open a side panel. If the panel is already open, close it (toggle).
   * Implements the single-active-panel policy.
   */
  openPanel: (panel: SidePanel) => void

  /** Force-close the active side panel. */
  closePanel: () => void

  /**
   * Toggle the Gantt / 4D Timeline dock open or closed.
   * Remembers dock height across collapse/expand cycles.
   * Called by the NavRail Gantt icon and by the dock's own collapse button.
   */
  toggleGantt: () => void

  /** Set Gantt dock height (called during drag-resize). */
  setGanttHeight: (height: number) => void

  /** Set panel width (called during drag-resize). */
  setPanelWidth: (width: number) => void
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_PANEL_WIDTH  = 320
const DEFAULT_GANTT_HEIGHT = 260
const MIN_GANTT_HEIGHT     = 120
const MAX_GANTT_HEIGHT     = 520

// ── Store ─────────────────────────────────────────────────────────────────────

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  activePanel:     'none',
  panelWidth:      DEFAULT_PANEL_WIDTH,

  // ── Gantt starts COLLAPSED (hidden by default, same as all other panels) ──
  ganttCollapsed:  true,
  ganttHeight:     DEFAULT_GANTT_HEIGHT,
  lastGanttHeight: DEFAULT_GANTT_HEIGHT,

  openPanel: (panel) => {
    const { activePanel } = get()
    // Toggle: clicking the already-open panel closes it
    set({ activePanel: activePanel === panel ? 'none' : panel })
  },

  closePanel: () => set({ activePanel: 'none' }),

  toggleGantt: () => {
    const { ganttCollapsed, ganttHeight } = get()
    if (ganttCollapsed) {
      // Expanding — restore last remembered height
      set({ ganttCollapsed: false })
    } else {
      // Collapsing — remember current height before hiding
      set({
        ganttCollapsed:  true,
        lastGanttHeight: ganttHeight,
      })
    }
  },

  setGanttHeight: (height) => {
    const clamped = Math.max(MIN_GANTT_HEIGHT, Math.min(MAX_GANTT_HEIGHT, height))
    set({ ganttHeight: clamped, lastGanttHeight: clamped })
  },

  setPanelWidth: (width) => {
    const clamped = Math.max(260, Math.min(520, width))
    set({ panelWidth: clamped })
  },
}))