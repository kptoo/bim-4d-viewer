/**
 * IFCViewer — React wrapper for ViewerEngine.
 * Fix: only show upload zone when modelLoadState is 'idle'.
 * Fix: only show error overlay when modelLoadState is 'error'.
 * Fix: never show upload zone before sceneReady.
 */

import { useEffect, useRef } from 'react'
import { ViewerEngine } from '../viewer/ViewerEngine'
import { useViewerStore } from '../store/viewer.store'
import { useSelectionStore } from '../store/selection.store'
import { useSimulationStore } from '../store/simulation.store'
import { useActivityStore } from '../store/activity.store'
import { useUIStore } from '../store/ui.store'
import IFCUploadZone from '../features/viewer/IFCUploadZone'

export default function IFCViewer() {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef    = useRef<ViewerEngine | null>(null)

  // ── Store reads ──────────────────────────────────────────
  const ifcObjects        = useViewerStore(s => s.ifcObjects)
  const modelLoadState    = useViewerStore(s => s.modelLoadState)
  const sceneReady        = useViewerStore(s => s.sceneReady)
  const setSceneReady     = useViewerStore(s => s.setSceneReady)
  const setModelLoadState = useViewerStore(s => s.setModelLoadState)
  const setModelError     = useViewerStore(s => s.setModelError)
  const resetModel        = useViewerStore(s => s.resetModel)

  const selectedGlobalIds = useSelectionStore(s => s.selectedGlobalIds)
  const primaryGlobalId   = useSelectionStore(s => s.primaryGlobalId)
  const selectObject      = useSelectionStore(s => s.selectObject)
  const clearSelection    = useSelectionStore(s => s.clearSelection)

  const computeAllFrames  = useSimulationStore(s => s.computeAllFrames)
  const progress          = useSimulationStore(s => s.progress)
  const activities        = useActivityStore(s => s.activities)
  const addError          = useUIStore(s => s.addError)

  // ── Init ViewerEngine once ───────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Reset any leftover error state from a previous session
    resetModel()

    const engine = new ViewerEngine({
      container,

      onObjectPicked: (globalId, isMulti) => {
        if (globalId) selectObject(globalId, isMulti)
        else          clearSelection()
      },

      onSceneReady: () => {
        setSceneReady(true)
      },

      onModelLoaded: (_count) => {
        setModelLoadState('loaded')
      },

      onError: (message) => {
        addError(message, '3D Viewer')
        setModelError(message)
        setModelLoadState('error')
      },
    })

    engine.init().catch(err => {
      const msg = err instanceof Error ? err.message : 'Viewer failed to initialize'
      addError(msg, '3D Viewer')
      setModelError(msg)
      setModelLoadState('error')
    })

    engineRef.current = engine

    return () => {
      engine.dispose()
      engineRef.current = null
      setSceneReady(false)
      resetModel()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Apply simulation colors ──────────────────────────────
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || modelLoadState !== 'loaded') return

    const frames    = computeAllFrames(activities)
    const overrides = new Map<string, string>()

    ifcObjects.forEach(obj => {
      if (obj.globalId === primaryGlobalId) {
        overrides.set(obj.globalId, '#FF8C00')
      } else if (selectedGlobalIds.has(obj.globalId)) {
        overrides.set(obj.globalId, '#FFD700')
      } else {
        const frame = frames.get(obj.globalId)
        overrides.set(obj.globalId, frame?.color ?? '#B0B0B0')
      }
    })

    engine.applyColorOverrides(overrides)
  }, [
    primaryGlobalId,
    selectedGlobalIds,
    progress,
    computeAllFrames,
    activities,
    ifcObjects,
    modelLoadState,
  ])

  // ── Stats counts ─────────────────────────────────────────
  const frames = computeAllFrames(activities)
  const counts = { completed: 0, active: 0, future: 0 }
  ifcObjects.forEach(obj => {
    const status = frames.get(obj.globalId)?.status ?? 'future'
    counts[status]++
  })

  // ── Overlay logic ─────────────────────────────────────────
  // Show spinner while engine is booting (before sceneReady)
  const showInitializing = !sceneReady && modelLoadState !== 'error'

  // Show upload zone only when scene is ready and no model loaded
  const showUploadZone = sceneReady && modelLoadState === 'idle'

  // Show loading overlay while IFC is being parsed
  const showLoadingOverlay = sceneReady && modelLoadState === 'loading'

  // Show error overlay only on explicit error
  const showErrorOverlay = modelLoadState === 'error'

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#070B0F' }}>

      {/* Three.js / OBC canvas mounts here */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* ── Initializing overlay — engine booting ── */}
      {showInitializing && (
        <div style={{
          position:       'absolute',
          inset:          0,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          background:     'rgba(7, 11, 15, 0.92)',
          zIndex:         10,
        }}>
          <div className="upload-zone upload-zone--loading">
            <div className="upload-spinner" />
            <p className="upload-zone__title">Initializing Viewer...</p>
            <p className="upload-zone__subtitle">Setting up 3D engine.</p>
          </div>
        </div>
      )}

      {/* ── Upload zone — ready and waiting for a file ── */}
      {showUploadZone && (
        <div style={{
          position:       'absolute',
          inset:          0,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          background:     'rgba(7, 11, 15, 0.92)',
          zIndex:         10,
        }}>
          <IFCUploadZone viewerEngine={engineRef.current} />
        </div>
      )}

      {/* ── Parsing overlay — IFC being processed ── */}
      {showLoadingOverlay && (
        <div style={{
          position:       'absolute',
          inset:          0,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          background:     'rgba(7, 11, 15, 0.92)',
          zIndex:         10,
        }}>
          <div className="upload-zone upload-zone--loading">
            <div className="upload-spinner" />
            <p className="upload-zone__title">Parsing IFC Model...</p>
            <p className="upload-zone__subtitle">
              This may take up to 30 seconds for large files.
            </p>
          </div>
        </div>
      )}

      {/* ── Error overlay — something went wrong ── */}
      {showErrorOverlay && (
        <div style={{
          position:       'absolute',
          inset:          0,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          background:     'rgba(7, 11, 15, 0.92)',
          zIndex:         10,
        }}>
          <IFCUploadZone viewerEngine={engineRef.current} />
        </div>
      )}

      {/* ── Stats overlay — model loaded ── */}
      {modelLoadState === 'loaded' && (
        <>
          <div className="viewer-stats">
            <div className="viewer-stats__row">
              <span>Total Elements</span>
              <span className="viewer-stats__val">{ifcObjects.length}</span>
            </div>
            <div className="viewer-stats__row">
              <span>Completed</span>
              <span className="viewer-stats__val" style={{ color: '#2ECC71' }}>
                {counts.completed}
              </span>
            </div>
            <div className="viewer-stats__row">
              <span>Active</span>
              <span className="viewer-stats__val" style={{ color: '#2F6BFF' }}>
                {counts.active}
              </span>
            </div>
            <div className="viewer-stats__row">
              <span>Upcoming</span>
              <span className="viewer-stats__val" style={{ color: '#B0B0B0' }}>
                {counts.future}
              </span>
            </div>
          </div>

          <div className="viewer-legend">
            <div className="viewer-legend__title">Element Status</div>
            <div className="legend-item">
              <div className="legend-swatch" style={{ background: '#2ECC71' }} />
              Completed
            </div>
            <div className="legend-item">
              <div className="legend-swatch" style={{ background: '#2F6BFF' }} />
              Active / In-Progress
            </div>
            <div className="legend-item">
              <div className="legend-swatch" style={{ background: '#B0B0B0' }} />
              Upcoming
            </div>
            <div className="legend-item">
              <div className="legend-swatch" style={{ background: '#FFD700' }} />
              Selected
            </div>
          </div>
        </>
      )}
    </div>
  )
}