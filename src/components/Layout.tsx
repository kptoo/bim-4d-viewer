import { useState }              from 'react'
import { ErrorBoundary }         from '../app/providers/ErrorBoundary'
import IFCViewer                 from './IFCViewer'
import GanttPanel                from './GanttPanel'
import TimelineSlider            from './TimelineSlider'
import IFCInspector              from './IFCInspector'
import IFCObjectTree             from './IFCObjectTree'
import ZonePanel                 from './zones/ZonePanel'
import ZoneFilterBar             from './zones/ZoneFilterBar'
import { useViewerStore }        from '../store/viewer.store'
import { useLayerStore }         from '../store/layer.store'
import { IFCUploadService }      from '../services/ifc/IFCUploadService'

type RightTab = 'inspector' | 'tree' | 'zones'

export default function Layout() {
  const ifcObjects     = useViewerStore(s => s.ifcObjects)
  const modelLoadState = useViewerStore(s => s.modelLoadState)
  const modelFileName  = useViewerStore(s => s.modelFileName)
  const modelFileSize  = useViewerStore(s => s.modelFileSize)
  const resetModel     = useViewerStore(s => s.resetModel)

  // Zone filter count for tab badge
  const activeFilterIds = useLayerStore(s => s.activeFilterIds)

  const [rightTab, setRightTab] = useState<RightTab>('inspector')

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
          {/* Zone filter indicator in header */}
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
            <button className="panel-action-btn active">Perspective</button>
            <button className="panel-action-btn">Top</button>
            <button className="panel-action-btn">Front</button>
            <button className="panel-action-btn">Wireframe</button>
          </div>
        </div>
        <div className="panel-body" style={{ flexDirection: 'column' }}>
          <ErrorBoundary context="3D Viewer">
            <IFCViewer />
          </ErrorBoundary>
          {/* Zone filter bar replaces layer filter bar — same store, updated copy */}
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

        {/* Right: Inspector | Object Tree | Zones */}
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
              {/*
                Renamed from "Layers" → "Zones" throughout.
                Active filter count badge shows when filters are on.
              */}
              <button
                className={`panel-tab${rightTab === 'zones' ? ' panel-tab--active' : ''}`}
                onClick={() => setRightTab('zones')}
              >
                Zones
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

            ) : (
              /*
                Zones tab — replaces the old two-section "Layers + Assign" split.
                ZonePanel is a single unified surface for zone management.
                Assignment is handled inline in the Inspector via ZoneAssignWidget,
                so the Zones tab no longer needs a separate assignment section.
              */
              <ErrorBoundary context="Zones Panel">
                <ZonePanel />
              </ErrorBoundary>
            )}

          </div>
        </div>

      </div>
    </div>
  )
}