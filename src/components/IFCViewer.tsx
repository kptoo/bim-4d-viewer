import { useEffect, useRef } from 'react'
import { ViewerEngine }        from '../viewer/ViewerEngine'
import { useViewerStore }      from '../store/viewer.store'
import { useSelectionStore }   from '../store/selection.store'
import { useSimulationStore }  from '../store/simulation.store'
import { useActivityStore }    from '../store/activity.store'
import { useUIStore }          from '../store/ui.store'
import { useLayerStore }       from '../store/layer.store'
import { FilterEngine }        from '../core/filter/FilterEngine'
import IFCUploadZone           from '../features/viewer/IFCUploadZone'
import { useAllAssignments, useGlobalIdLayerMap } from '../hooks/useAssignments'

export default function IFCViewer() {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef    = useRef<ViewerEngine | null>(null)

  // ── Store reads ──────────────────────────────────────────
  const ifcObjects          = useViewerStore(s => s.ifcObjects)
  const modelLoadState      = useViewerStore(s => s.modelLoadState)
  const sceneReady          = useViewerStore(s => s.sceneReady)
  const setSceneReady       = useViewerStore(s => s.setSceneReady)
  const setModelLoadState   = useViewerStore(s => s.setModelLoadState)
  const setModelError       = useViewerStore(s => s.setModelError)
  const resetModel          = useViewerStore(s => s.resetModel)
  const setEngineActions    = useViewerStore(s => s.setEngineActions)
  const clearEngineActions  = useViewerStore(s => s.clearEngineActions)

  const selectedGlobalIds  = useSelectionStore(s => s.selectedGlobalIds)
  const primaryGlobalId    = useSelectionStore(s => s.primaryGlobalId)
  const selectObject       = useSelectionStore(s => s.selectObject)
  const clearSelection     = useSelectionStore(s => s.clearSelection)

  const computeAllFrames   = useSimulationStore(s => s.computeAllFrames)
  const progress           = useSimulationStore(s => s.progress)
  const isSimulationActive = useSimulationStore(s => s.isSimulationActive)
  const activities         = useActivityStore(s => s.activities)
  const addError           = useUIStore(s => s.addError)

  const activeFilterIds    = useLayerStore(s => s.activeFilterIds)

  // ── Phase 3: Bootstrap DB data ───────────────────────────
  useAllAssignments()
  useGlobalIdLayerMap()

  // ── Init ViewerEngine once ───────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    resetModel()

    const engine = new ViewerEngine({
      container,

      onObjectPicked: (globalId, isMulti) => {
        if (globalId) selectObject(globalId, isMulti)
        else          clearSelection()
      },

      onSceneReady: () => {
        setSceneReady(true)

        // ── Register engine action callbacks into the store ──
        // Done inside onSceneReady so the engine is fully booted
        // before any component can call the callbacks.
        setEngineActions(
          (globalId: string) => {
            engineRef.current?.zoomToObject(globalId).catch(console.warn)
          },
          (globalIds: string[]) => {
            engineRef.current?.isolateObjects(globalIds).catch(console.warn)
          }
        )
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
      clearEngineActions()
      resetModel()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Unload 3D scene when state returns to idle ───────────
  useEffect(() => {
    if (modelLoadState !== 'idle') return
    const engine = engineRef.current
    if (!engine) return
    engine.unloadAll().catch(err => {
      console.warn('[IFCViewer] unloadAll on idle transition:', err)
    })
  }, [modelLoadState])

  // ── Effect 1: Simulation color overlay ──────────────────
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || modelLoadState !== 'loaded') return

    if (!isSimulationActive) {
      engine.resetColors()
      return
    }

    const frames    = computeAllFrames(activities)
    const overrides = new Map<string, string>()

    for (const obj of ifcObjects) {
      if (obj.globalId === primaryGlobalId) {
        overrides.set(obj.globalId, '#FF8C00')
      } else if (selectedGlobalIds.has(obj.globalId)) {
        overrides.set(obj.globalId, '#FFD700')
      } else {
        const frame = frames.get(obj.globalId)
        if (frame) {
          overrides.set(obj.globalId, frame.color)
        }
      }
    }

    engine.applyColorOverrides(overrides)

  }, [
    isSimulationActive,
    primaryGlobalId,
    selectedGlobalIds,
    progress,
    computeAllFrames,
    activities,
    ifcObjects,
    modelLoadState,
  ])

  // ── Effect 2: Selection highlight (simulation OFF) ───────
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || modelLoadState !== 'loaded') return

    if (isSimulationActive) return

    if (selectedGlobalIds.size === 0 && primaryGlobalId === null) return

    const overrides = new Map<string, string>()

    if (primaryGlobalId) {
      overrides.set(primaryGlobalId, '#FF8C00')
    }
    for (const globalId of selectedGlobalIds) {
      if (globalId !== primaryGlobalId) {
        overrides.set(globalId, '#FFD700')
      }
    }

    engine.applyColorOverrides(overrides)

    return () => {
      const eng = engineRef.current
      if (!eng || isSimulationActive) return
      eng.resetColors()
    }

  }, [
    isSimulationActive,
    selectedGlobalIds,
    primaryGlobalId,
    modelLoadState,
  ])

  // ── Effect 3 (Phase 3): Layer filter visibility ──────────
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || modelLoadState !== 'loaded' || ifcObjects.length === 0) return

    if (activeFilterIds.length === 0) {
      engine.restoreVisibility().catch(console.warn)
      return
    }

    const result = FilterEngine.applyLayerFilter(ifcObjects, activeFilterIds)

    Promise.all([
      engine.hideObjects(result.hidden),
      engine.showObjects(result.visible),
    ]).catch(console.warn)

  }, [activeFilterIds, ifcObjects, modelLoadState])

  // ── Stats counts ─────────────────────────────────────────
  const frames = computeAllFrames(activities)
  const counts = { completed: 0, active: 0, future: 0 }
  ifcObjects.forEach(obj => {
    const status = frames.get(obj.globalId)?.status ?? 'future'
    counts[status]++
  })

  const showInitializing   = !sceneReady && modelLoadState !== 'error'
  const showUploadZone     = sceneReady && modelLoadState === 'idle'
  const showLoadingOverlay = sceneReady && modelLoadState === 'loading'
  const showErrorOverlay   = modelLoadState === 'error'

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#070B0F' }}>

      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {showInitializing && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(7, 11, 15, 0.92)', zIndex: 10,
        }}>
          <div className="upload-zone upload-zone--loading">
            <div className="upload-spinner" />
            <p className="upload-zone__title">Initializing Viewer...</p>
            <p className="upload-zone__subtitle">Setting up 3D engine.</p>
          </div>
        </div>
      )}

      {showUploadZone && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(7, 11, 15, 0.92)', zIndex: 10,
        }}>
          <IFCUploadZone viewerEngine={engineRef.current} />
        </div>
      )}

      {showLoadingOverlay && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(7, 11, 15, 0.92)', zIndex: 10,
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

      {showErrorOverlay && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(7, 11, 15, 0.92)', zIndex: 10,
        }}>
          <IFCUploadZone viewerEngine={engineRef.current} />
        </div>
      )}

      {modelLoadState === 'loaded' && (
        <>
          <div className="viewer-stats">
            <div className="viewer-stats__row">
              <span>Total Elements</span>
              <span className="viewer-stats__val">{ifcObjects.length}</span>
            </div>
            <div className="viewer-stats__row">
              <span>Completed</span>
              <span className="viewer-stats__val" style={{ color: '#2ECC71' }}>{counts.completed}</span>
            </div>
            <div className="viewer-stats__row">
              <span>Active</span>
              <span className="viewer-stats__val" style={{ color: '#2F6BFF' }}>{counts.active}</span>
            </div>
            <div className="viewer-stats__row">
              <span>Upcoming</span>
              <span className="viewer-stats__val" style={{ color: '#B0B0B0' }}>{counts.future}</span>
            </div>
          </div>

          <div className="viewer-legend">
            <div className="viewer-legend__title">
              {isSimulationActive ? 'Element Status' : 'IFC Appearance'}
            </div>
            {isSimulationActive ? (
              <>
                <div className="legend-item"><div className="legend-swatch" style={{ background: '#2ECC71' }} />Completed</div>
                <div className="legend-item"><div className="legend-swatch" style={{ background: '#2F6BFF' }} />Active / In-Progress</div>
                <div className="legend-item"><div className="legend-swatch" style={{ background: '#B0B0B0' }} />Upcoming</div>
                <div className="legend-item"><div className="legend-swatch" style={{ background: '#FFD700' }} />Selected</div>
              </>
            ) : (
              <div className="legend-item" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                Original IFC colors active.<br />Start simulation to see construction status.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}