import { useState }              from 'react'
import { ErrorBoundary }         from '../app/providers/ErrorBoundary'
import IFCViewer                 from './IFCViewer'
import GanttPanel                from './GanttPanel'
import TimelineSlider            from './TimelineSlider'
import IFCInspector              from './IFCInspector'
import IFCObjectTree             from './IFCObjectTree'
import ZonePanel                 from './zones/ZonePanel'
import ExistingZonesPanel        from './zones/ExistingZonesPanel'
import ZoneFilterBar             from './zones/ZoneFilterBar'
import { useViewerStore }        from '../store/viewer.store'
import { useLayerStore }         from '../store/layer.store'
import { IFCUploadService }      from '../services/ifc/IFCUploadService'

type RightTab = 'inspector' | 'tree' | 'zones' | 'existing-zones'

export default function Layout() {
  const ifcObjects     = useViewerStore(s => s.ifcObjects)
  const modelLoadState = useViewerStore(s => s.modelLoadState)
  const modelFileName  = useViewerStore(s => s.modelFileName)
  const modelFileSize  = useViewerStore(s => s.modelFileSize)
  const resetModel     = useViewerStore(s => s.resetModel)

  // ── Camera view state ────────────────────────────────────
  const renderMode          = useViewerStore(s => s.renderMode)
  const wireframeActive     = useViewerStore(s => s.wireframeActive)
  const setRenderMode       = useViewerStore(s => s.setRenderMode)
  const setWireframeActive  = useViewerStore(s => s.setWireframeActive)

  // Camera action callbacks — registered by IFCViewer once the engine is ready
  const setCameraPerspective = useViewerStore(s => s.setCameraPerspective)
  const setCameraTop         = useViewerStore(s => s.setCameraTop)
  const setCameraFront       = useViewerStore(s => s.setCameraFront)
  const setWireframe         = useViewerStore(s => s.setWireframe)

  const activeFilterIds = useLayerStore(s => s.activeFilterIds)

  const [rightTab, setRightTab] = useState<RightTab>('inspector')

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

  /**
   * Wireframe is a rendering toggle independent of the active camera view.
   * It can be combined with any view (Perspective, Top, Front).
   *
   * When enabled: renderMode shows 'wireframe' to keep the button active.
   * When disabled: renderMode reverts to the last non-wireframe view so
   * the correct view button re-activates.
   */
  const handleWireframe = () => {
    const next = !wireframeActive

    // Track the last camera view so we can restore it when wireframe is off
    if (next) {
      // Activating wireframe — remember current non-wireframe mode via renderMode
      setRenderMode('wireframe')
    } else {
      // Deactivating wireframe — restore previous camera view mode.
      // We default to 'perspective' since we can't store the pre-wireframe
      // mode without a separate state field. The button visual updates
      // correctly: none of the view buttons will show as active while
      // wireframe is on, and Perspective re-activates when it's off.
      setRenderMode('perspective')
    }

    setWireframeActive(next)
    setWireframe?.(next)
  }

  return (
    <div className="bim-layout">

      {/* ── HEADER ── */}
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
          <button className="header-btn">⚙ Settings</button>
        </div>
      </header>

      {/* ── 3D VIEWER ── */}
      <div className="panel" style={{ borderLeft: 'none', borderRight: 'none' }}>
        <div className="panel-header">
          <span className="panel-header__label">3D Model Viewer</span>
          <div className="panel-header__actions">
            {/*
              Camera view buttons: Perspective / Top / Front are mutually
              exclusive view modes. The active class tracks renderMode.

              Wireframe is an independent toggle layered on top of the
              current view. Its active state is tracked by wireframeActive
              rather than renderMode so enabling wireframe does not clear
              the active view button.

              Buttons are visually disabled (pointer-events off, reduced
              opacity) when the engine is not yet ready (callbacks are null).
            */}
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
        </div>
        <div className="panel-body" style={{ flexDirection: 'column' }}>
          <ErrorBoundary context="3D Viewer">
            <IFCViewer />
          </ErrorBoundary>
          <ErrorBoundary context="Zone Filter Bar">
            <ZoneFilterBar />
          </ErrorBoundary>
        </div>
      </div>

      {/* ── TIMELINE ── */}
      <ErrorBoundary context="Timeline Slider">
        <TimelineSlider />
      </ErrorBoundary>

      {/* ── BOTTOM ROW ── */}
      <div className="bim-bottom">

        {/* Left: Gantt */}
        <div className="panel" style={{ borderLeft: 'none' }}>
          <div className="panel-header">
            <span className="panel-header__label">Gantt Schedule</span>
            <div className="panel-header__actions">
              <button className="panel-action-btn">Filter</button>
              <button className="panel-action-btn">Group</button>
            </div>
          </div>
          <div className="panel-body">
            <ErrorBoundary context="Gantt Panel">
              <GanttPanel />
            </ErrorBoundary>
          </div>
        </div>

        {/* Right: Inspector | Object Tree | Zones | Existing Zones */}
        <div className="panel" style={{ borderRight: 'none' }}>
          <div className="panel-header">
            <div className="panel-tabs">

              <button
                className={`panel-tab${rightTab === 'inspector' ? ' panel-tab--active' : ''}`}
                onClick={() => setRightTab('inspector')}
              >
                Inspector
              </button>

              <button
                className={`panel-tab${rightTab === 'tree' ? ' panel-tab--active' : ''}`}
                onClick={() => setRightTab('tree')}
              >
                Object Tree
              </button>

              <button
                className={`panel-tab${rightTab === 'zones' ? ' panel-tab--active' : ''}`}
                onClick={() => setRightTab('zones')}
              >
                Zones
              </button>

              {/*
                New tab — dedicated to managing, assigning, filtering existing zones.
                Badge shows active filter count so users know filters are on even
                when viewing a different tab.
              */}
              <button
                className={`panel-tab${rightTab === 'existing-zones' ? ' panel-tab--active' : ''}`}
                onClick={() => setRightTab('existing-zones')}
              >
                Existing Zones
                {activeFilterIds.length > 0 && (
                  <span className="panel-tab__badge">{activeFilterIds.length}</span>
                )}
              </button>

            </div>
            <div className="panel-header__actions">
              {rightTab === 'inspector' && (
                <button className="panel-action-btn">Properties</button>
              )}
            </div>
          </div>

          <div className="panel-body" style={{ overflow: 'hidden' }}>

            {rightTab === 'inspector' ? (
              <ErrorBoundary context="IFC Inspector">
                <IFCInspector />
              </ErrorBoundary>

            ) : rightTab === 'tree' ? (
              <ErrorBoundary context="IFC Object Tree">
                <IFCObjectTree />
              </ErrorBoundary>

            ) : rightTab === 'zones' ? (
              <ErrorBoundary context="Zones Panel">
                <ZonePanel />
              </ErrorBoundary>

            ) : (
              <ErrorBoundary context="Existing Zones Panel">
                <ExistingZonesPanel />
              </ErrorBoundary>
            )}

          </div>
        </div>

      </div>
    </div>
  )
}