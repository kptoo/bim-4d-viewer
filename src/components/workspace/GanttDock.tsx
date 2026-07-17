/**
 * GanttDock.tsx — Resizable, collapsible bottom dock for the Gantt timeline.
 *
 * Phase 6 continuation changes:
 * - The `TimelineSlider` (4D playback controls) is now rendered INSIDE the
 *   dock, directly above the Gantt chart, so both hide and show together as
 *   one coherent unit when the user opens/closes the dock from the NavRail.
 *   Previously, `TimelineSlider` lived as a permanent sibling in `Layout.tsx`
 *   between the viewer and the dock — that was the root cause of the "always
 *   visible" inconsistency.
 *
 * - The dock header's collapse button now uses the same chevron convention
 *   as before, but it doubles as the only close mechanism alongside the
 *   NavRail icon, matching the `SlidePanel` pattern exactly.
 *
 * Behaviour:
 * - Hidden by default (workspace.store `ganttCollapsed` starts as `true`).
 * - Opens when the user clicks the 📊 NavRail icon (calls `toggleGantt()`).
 * - Closes when: the NavRail icon is clicked again, OR the ▼ header button.
 * - Drag the top resize handle to adjust dock height (120–520 px).
 * - Resize is done via direct DOM mutation during drag (no React re-renders).
 * - Height is committed to workspace.store on pointerup.
 * - `GanttPanel` and `TimelineSlider` are NEVER unmounted — preserves React
 *   Query cache, Frappe/D3 state, and simulation store state across open/close.
 * - `aria-hidden` toggles so screen readers skip hidden content.
 *
 * Layout when open:
 *   ┌──────────────────────────────────────────────┐
 *   │ [resize handle]                              │
 *   │ [header] Gantt Schedule  [Filter][Group][▼]  │
 *   │ ─────────────────────────────────────────── │
 *   │ 4D Timeline Control  [⏮][▶]  ──slider──    │
 *   │ ─────────────────────────────────────────── │
 *   │ GanttPanel                                   │
 *   └──────────────────────────────────────────────┘
 *
 * @module GanttDock
 */

import React, { useRef, useCallback } from 'react'
import { ErrorBoundary }   from '../../app/providers/ErrorBoundary'
import GanttPanel          from '../GanttPanel'
import TimelineSlider      from '../TimelineSlider'
import { useWorkspaceStore } from '../../store/workspace.store'

const DOCK_HEADER_HEIGHT = 36   // px — visible even when collapsed

const GanttDock: React.FC = () => {
  const ganttCollapsed = useWorkspaceStore(s => s.ganttCollapsed)
  const ganttHeight    = useWorkspaceStore(s => s.ganttHeight)
  const toggleGantt    = useWorkspaceStore(s => s.toggleGantt)
  const setGanttHeight = useWorkspaceStore(s => s.setGanttHeight)

  const dockRef     = useRef<HTMLDivElement>(null)
  const dragStartY  = useRef<number>(0)
  const dragStartH  = useRef<number>(0)

  // ── Drag-resize ─────────────────────────────────────────────────────────────
  //
  // Live DOM mutation during drag avoids scheduling React re-renders at 60 fps.
  // The final value is committed to the store only on pointerup, which triggers
  // exactly one re-render to sync CSS height from the store.

  const onPointerMove = useCallback((e: PointerEvent) => {
    const delta   = dragStartY.current - e.clientY  // drag up = taller
    const newH    = dragStartH.current + delta
    if (dockRef.current) {
      const clamped = Math.max(120, Math.min(520, newH))
      dockRef.current.style.height = `${clamped}px`
    }
  }, [])

  const onPointerUp = useCallback((e: PointerEvent) => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup',   onPointerUp)
    const delta = dragStartY.current - e.clientY
    const newH  = dragStartH.current + delta
    setGanttHeight(newH)  // commit to store → one React re-render
  }, [onPointerMove, setGanttHeight])

  const onHandlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    dragStartY.current = e.clientY
    dragStartH.current = dockRef.current?.offsetHeight ?? ganttHeight
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup',   onPointerUp)
  }, [ganttHeight, onPointerMove, onPointerUp])

  // ── Computed style ───────────────────────────────────────────────────────────
  //
  // When collapsed: height collapses to 0 (not just the header) so the viewer
  // fully reclaims the space. The dock's CSS `overflow: hidden` hides everything.
  // When open: height is the user's last-set value from the store.

  const dockStyle: React.CSSProperties = {
    height: ganttCollapsed ? 0 : ganttHeight,
  }

  return (
    <div
      ref={dockRef}
      className={`gantt-dock${ganttCollapsed ? ' gantt-dock--collapsed' : ''}`}
      style={dockStyle}
      aria-hidden={ganttCollapsed}
    >
      {/* ── Resize handle — only rendered when expanded ── */}
      {!ganttCollapsed && (
        <div
          className="gantt-dock__resize-handle"
          onPointerDown={onHandlePointerDown}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize Gantt dock"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp')   setGanttHeight(ganttHeight + 20)
            if (e.key === 'ArrowDown') setGanttHeight(ganttHeight - 20)
          }}
        />
      )}

      {/* ── Dock header bar — title + Filter / Group / close ── */}
      <div className="gantt-dock__header">
        <span className="gantt-dock__title">Gantt Schedule</span>
        <div className="gantt-dock__actions">
          <button className="panel-action-btn">Filter</button>
          <button className="panel-action-btn">Group</button>
          {/* Close button mirrors SlidePanel's ✕ button in behaviour */}
          <button
            className="gantt-dock__collapse-btn"
            onClick={toggleGantt}
            title="Close Gantt dock"
            aria-label="Close Gantt dock"
            aria-expanded={!ganttCollapsed}
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Dock body — TimelineSlider + GanttPanel, always mounted ── */}
      <div className="gantt-dock__body">

        {/* 4D Timeline controls live inside the dock so they hide with it */}
        <ErrorBoundary context="Timeline Slider">
          <TimelineSlider />
        </ErrorBoundary>

        {/* Gantt chart fills remaining dock height */}
        <div className="gantt-dock__chart">
          <ErrorBoundary context="Gantt Panel">
            <GanttPanel />
          </ErrorBoundary>
        </div>

      </div>
    </div>
  )
}

export default GanttDock