import IFCViewer from './IFCViewer'
import GanttPanel from './GanttPanel'
import TimelineSlider from './TimelineSlider'
import IFCInspector from './IFCInspector'

export default function Layout() {
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
            Tower Block A — Phase 1
          </span>
          <span className="bim-badge">IFC 2x3</span>
          <span className="bim-badge">12 Elements</span>
        </div>

        <div className="bim-header__right">
          <button className="header-btn">⬆ Import IFC</button>
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
        <div className="panel-body">
          <IFCViewer />
        </div>
      </div>

      {/* ── TIMELINE ── */}
      <TimelineSlider />

      {/* ── BOTTOM ROW ── */}
      <div className="bim-bottom">
        <div className="panel" style={{ borderLeft: 'none' }}>
          <div className="panel-header">
            <span className="panel-header__label">Gantt Schedule</span>
            <div className="panel-header__actions">
              <button className="panel-action-btn">Filter</button>
              <button className="panel-action-btn">Group</button>
            </div>
          </div>
          <div className="panel-body">
            <GanttPanel />
          </div>
        </div>

        <div className="panel" style={{ borderRight: 'none' }}>
          <div className="panel-header">
            <span className="panel-header__label">IFC Inspector</span>
            <div className="panel-header__actions">
              <button className="panel-action-btn">Properties</button>
            </div>
          </div>
          <div className="panel-body">
            <IFCInspector />
          </div>
        </div>
      </div>
    </div>
  )
}
