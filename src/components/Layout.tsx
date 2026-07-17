/**
 * Layout.tsx — Phase 6 Workspace: Viewer-Centric Layout
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────────────┐
 *   │  Top Toolbar (header)                               │
 *   ├──────┬──────────────────────────────────────────────┤
 *   │      │                                              │
 *   │ Nav  │  Slide-out Panel (optional)  │  IFC Viewer  │
 *   │ Rail │  (only one open at a time)   │  (primary)   │
 *   │      │                              │              │
 *   ├──────┴──────────────────────────────────────────────┤
 *   │  Gantt Dock — hidden by default, opens via NavRail  │
 *   │  (contains: 4D Timeline Slider + Gantt chart)       │
 *   └─────────────────────────────────────────────────────┘
 *
 * Phase 6 continuation changes vs initial Phase 6:
 * - `<TimelineSlider>` has been removed from Layout. It now lives inside
 *   `<GanttDock>` so it hides and shows together with the Gantt chart as
 *   a single unified bottom dock — matching the behaviour of every SlidePanel.
 * - `<GanttDock>` starts collapsed (workspace.store default) and opens only
 *   when the user clicks the 📊 icon in the NavRail.
 * - The viewer occupies the full remaining space when the dock is closed.
 * - No business logic has changed. All stores, hooks, and services are intact.
 *
 * @module Layout
 */

import React                     from 'react'
import { ErrorBoundary }         from '../app/providers/ErrorBoundary'
import IFCViewer                 from './IFCViewer'
import IFCInspector              from './IFCInspector'
import IFCObjectTree             from './IFCObjectTree'
import ZonePanel                 from './zones/ZonePanel'
import ExistingZonesPanel        from './zones/ExistingZonesPanel'
import ZoneFilterBar             from './zones/ZoneFilterBar'
import ActivityPanel             from './activities/ActivityPanel'
import NavRail                   from './workspace/NavRail'
import SlidePanel                from './workspace/SlidePanel'
import GanttDock                 from './workspace/GanttDock'
import { useWorkspaceStore }     from '../store/workspace.store'
import { useViewerStore }        from '../store/viewer.store'
import { useLayerStore }         from '../store/layer.store'
import { useActivityStore }      from '../store/activity.store'
import { IFCUploadService }      from '../services/ifc/IFCUploadService'

export default function Layout() {
  // ── Workspace layout state ───────────────────────────────
  const activePanel = useWorkspaceStore(s => s.activePanel)

  // ── Viewer model state ───────────────────────────────────
  const ifcObjects     = useViewerStore(s => s.ifcObjects)
  const modelLoadState = useViewerStore(s => s.modelLoadState)
  const modelFileName  = useViewerStore(s => s.modelFileName)
  const modelFileSize  = useViewerStore(s => s.modelFileSize)
  const resetModel     = useViewerStore(s => s.resetModel)

  // ── Camera view state ────────────────────────────────────
  const renderMode         = useViewerStore(s => s.renderMode)
  const wireframeActive    = useViewerStore(s => s.wireframeActive)
  const setRenderMode      = useViewerStore(s => s.setRenderMode)
  const setWireframeActive = useViewerStore(s => s.setWireframeActive)

  // Camera action callbacks — registered by IFCViewer once the engine is ready
  const setCameraPerspective = useViewerStore(s => s.setCameraPerspective)
  const setCameraTop         = useViewerStore(s => s.setCameraTop)
  const setCameraFront       = useViewerStore(s => s.setCameraFront)
  const setWireframe         = useViewerStore(s => s.setWireframe)

  // ── Badge counts ─────────────────────────────────────────
  const activeFilterIds = useLayerStore(s => s.activeFilterIds)
  const activityCount   = useActivityStore(s => s.activities.length)

  // ── Camera button handlers ────────────────────────────────

  const handlePerspective = () => {
    setRenderMode('perspective')
    setCameraPerspective?.()
  }

  const handleTop = () => {
    setRenderMode('top')
    setCameraTop?.()
  }

  const handleFront = () => {
    setRenderMode('front')
    setCameraFront?.()
  }

  const handleWireframe = () => {
    const next = !wireframeActive
    if (next) {
      setRenderMode('wireframe')
    } else {
      setRenderMode('perspective')
    }
    setWireframeActive(next)
    setWireframe?.(next)
  }

  return (
    <div className="bim-layout-v6">

      {/* ══════════════════════════════════════════════════════
          HEADER TOOLBAR
      ══════════════════════════════════════════════════════ */}
      <header className="bim-header">
        <div className="bim-header__logo">
          <div className="bim-header__logo-icon">4D</div>
          <div>
            <div className="bim-header__title">4D BIM VIEWER</div>
            <div className="bim-header__subtitle">Construction Progress Platform</div>
          </div>
        </div>

        <div className="bim-header__center">
          <span className="bim-badge bim-badge--active">
            <span className="dot" />
            {modelLoadState === 'loaded' && modelFileName
              ? modelFileName
              : 'No Model Loaded'}
          </span>
          {modelLoadState === 'loaded' && modelFileSize && (
            <span className="bim-badge">
              {IFCUploadService.formatFileSize(modelFileSize)}
            </span>
          )}
          <span className="bim-badge">
            {ifcObjects.length} Elements
          </span>
          {activityCount > 0 && (
            <span className="bim-badge">
              📅 {activityCount} {activityCount === 1 ? 'Activity' : 'Activities'}
            </span>
          )}
          {activeFilterIds.length > 0 && (
            <span className="bim-badge bim-badge--zone-filter">
              📐 {activeFilterIds.length} zone{activeFilterIds.length !== 1 ? 's' : ''} filtered
            </span>
          )}
        </div>

        <div className="bim-header__right">
          {modelLoadState === 'loaded' && (
            <button className="header-btn" onClick={resetModel}>
              ↩ Load New Model
            </button>
          )}
          <button className="header-btn">📤 Export Report</button>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════
          WORKSPACE BODY  (nav rail + slide panels + viewer)
          ──────────────────────────────────────────────────
          The viewer-workspace flex child expands to fill all
          available width when no SlidePanel is open, and
          contracts smoothly when one opens. The GanttDock
          below shrinks this entire row vertically when open.
      ══════════════════════════════════════════════════════ */}
      <div className="workspace-body">

        {/* ── Left navigation rail ── */}
        <NavRail />

        {/* ── Slide-out panels — always mounted, shown/hidden via CSS ──────
            All five panels are kept in the DOM at all times so React Query
            caches, in-progress form state, and Zustand subscriptions survive
            panel close/reopen without any data loss or re-fetch.
        ── */}

        <SlidePanel isOpen={activePanel === 'ifc'} title="IFC Model">
          <ErrorBoundary context="IFC Object Tree">
            <IFCObjectTree />
          </ErrorBoundary>
        </SlidePanel>

        <SlidePanel isOpen={activePanel === 'layers'} title="Information Layers">
          <ErrorBoundary context="Zones Panel">
            <ZonePanel />
          </ErrorBoundary>
          <ErrorBoundary context="Existing Zones Panel">
            <ExistingZonesPanel />
          </ErrorBoundary>
        </SlidePanel>

        <SlidePanel isOpen={activePanel === 'activities'} title="Activities">
          <ErrorBoundary context="Activities Panel">
            <ActivityPanel />
          </ErrorBoundary>
        </SlidePanel>

        <SlidePanel isOpen={activePanel === 'inspector'} title="Inspector">
          <ErrorBoundary context="IFC Inspector">
            <IFCInspector />
          </ErrorBoundary>
        </SlidePanel>

        <SlidePanel isOpen={activePanel === 'settings'} title="Settings">
          <div className="settings-placeholder">
            <p className="settings-placeholder__text">Settings panel coming soon.</p>
          </div>
        </SlidePanel>

        {/* ── Primary 3D viewer workspace ── */}
        <div className="viewer-workspace">

          {/* Camera controls toolbar — floats above the canvas */}
          <div className="viewer-toolbar">
            <div className="viewer-toolbar__views">
              <button
                className={`panel-action-btn${renderMode === 'perspective' ? ' active' : ''}`}
                onClick={handlePerspective}
                disabled={setCameraPerspective === null}
                title="Perspective view"
              >
                Perspective
              </button>
              <button
                className={`panel-action-btn${renderMode === 'top' ? ' active' : ''}`}
                onClick={handleTop}
                disabled={setCameraTop === null}
                title="Top view (plan)"
              >
                Top
              </button>
              <button
                className={`panel-action-btn${renderMode === 'front' ? ' active' : ''}`}
                onClick={handleFront}
                disabled={setCameraFront === null}
                title="Front view (elevation)"
              >
                Front
              </button>
              <button
                className={`panel-action-btn${wireframeActive ? ' active' : ''}`}
                onClick={handleWireframe}
                disabled={setWireframe === null}
                title={wireframeActive ? 'Disable wireframe' : 'Enable wireframe'}
              >
                Wireframe
              </button>
            </div>

            {/* Active layer filter badge — always visible in the viewer toolbar
                so the user can see filter state regardless of which panel is open */}
            {activeFilterIds.length > 0 && (
              <div className="viewer-toolbar__filter-badge">
                <span className="bim-badge bim-badge--zone-filter">
                  📐 {activeFilterIds.length} layer{activeFilterIds.length !== 1 ? 's' : ''} active
                </span>
              </div>
            )}
          </div>

          {/* 3D canvas — fills all remaining vertical space in viewer-workspace */}
          <div className="viewer-canvas-host">
            <ErrorBoundary context="3D Viewer">
              <IFCViewer />
            </ErrorBoundary>
            <ErrorBoundary context="Zone Filter Bar">
              <ZoneFilterBar />
            </ErrorBoundary>
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          GANTT DOCK
          ──────────────────────────────────────────────────
          Starts collapsed (height: 0) so the viewer fills the
          full screen on load. The 📊 NavRail icon calls
          toggleGantt() to open/close it — identical to how
          every SlidePanel responds to its NavRail icon.

          The dock contains both the 4D Timeline Slider and the
          Gantt chart as a unified unit. Neither component is
          ever unmounted — React Query caches and simulation
          state are preserved across open/close cycles.
      ══════════════════════════════════════════════════════ */}
      <GanttDock />

    </div>
  )
}