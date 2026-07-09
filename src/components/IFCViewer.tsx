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

  // Read current action slots so we can detect when they are null
  const zoomToObject    = useViewerStore(s => s.zoomToObject)
  const isolateObjects  = useViewerStore(s => s.isolateObjects)

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
        console.log('[IFCViewer] onObjectPicked — globalId:', globalId, 'isMulti:', isMulti)
        if (globalId) selectObject(globalId, isMulti)
        else          clearSelection()
      },

      onSceneReady: () => {
        console.log('[IFCViewer] onSceneReady — registering engine actions')
        setSceneReady(true)

        // ── Register engine action callbacks into the store ──
        // Done inside onSceneReady so the engine is fully booted
        // before any component can call the callbacks.
        setEngineActions(
          (globalId: string) => {
            console.log('[IFCViewer] zoomToObject called — globalId:', globalId)
            engineRef.current?.zoomToObject(globalId).catch(console.warn)
          },
          (globalIds: string[]) => {
            console.log('[IFCViewer] isolateObjects called — count:', globalIds.length)
            engineRef.current?.isolateObjects(globalIds).catch(console.warn)
          }
        )
      },

      onModelLoaded: (_count) => {
        console.log('[IFCViewer] onModelLoaded — objectCount:', _count)
        setModelLoadState('loaded')
      },

      onError: (message) => {
        console.warn('[IFCViewer] onError —', message)
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
      console.log('[IFCViewer] disposing ViewerEngine')
      engine.dispose()
      engineRef.current = null
      setSceneReady(false)
      clearEngineActions()
      resetModel()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Guard: re-register engine actions if they were wiped ─
  //
  // This is a belt-and-suspenders safety net. The primary fix is in
  // viewer.store.ts (resetModel no longer nulls the callbacks). However,
  // if any code path ever nulls zoomToObject / isolateObjects while the
  // engine is still alive, this effect immediately restores them.
  //
  // It fires whenever sceneReady becomes true OR whenever the callbacks
  // are discovered to be null while the engine is live.
  //
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !sceneReady) return
    if (zoomToObject !== null && isolateObjects !== null) return

    console.warn(
      '[IFCViewer] ⚠ Engine action callbacks are null while engine is alive — restoring.',
      'zoomToObject:', zoomToObject,
      'isolateObjects:', isolateObjects,
    )

    setEngineActions(
      (globalId: string) => {
        console.log('[IFCViewer] zoomToObject (restored) — globalId:', globalId)
        engineRef.current?.zoomToObject(globalId).catch(console.warn)
      },
      (globalIds: string[]) => {
        console.log('[IFCViewer] isolateObjects (restored) — count:', globalIds.length)
        engineRef.current?.isolateObjects(globalIds).catch(console.warn)
      }
    )
  }, [sceneReady, zoomToObject, isolateObjects, setEngineActions])

  // ── Unload 3D scene when state returns to idle ───────────
  useEffect(() => {
    if (modelLoadState !== 'idle') return
    const engine = engineRef.current
    if (!engine) return
    console.log('[IFCViewer] modelLoadState → idle, calling unloadAll')
    engine.unloadAll().catch(err => {
      console.warn('[IFCViewer] unloadAll on idle transition:', err)
    })
  }, [modelLoadState])

  // ── Debug: log selection changes ─────────────────────────
  useEffect(() => {
    console.log(
      '[IFCViewer] Selection changed —',
      'primaryGlobalId:', primaryGlobalId,
      'selectedCount:', selectedGlobalIds.size,
    )
    const store = useViewerStore.getState()
    console.log(
      '[IFCViewer] Engine action state —',
      'zoomToObject:', store.zoomToObject !== null ? '✅ set' : '❌ null',
      'isolateObjects:', store.isolateObjects !== null ? '✅ set' : '❌ null',
    )
  }, [primaryGlobalId, selectedGlobalIds])

  // ── Debug: log modelLoadState transitions ─────────────────
  useEffect(() => {
    console.log('[IFCViewer] modelLoadState →', modelLoadState)
    if (modelLoadState === 'loaded') {
      const store = useViewerStore.getState()
      const loadedModels = engineRef.current?.getLoadedModels() ?? []
      console.log(
        '[IFCViewer] Model loaded —',
        'ifcObjects in store:', useViewerStore.getState().ifcObjects.length,
        'loadedModels in engine:', loadedModels.length,
        'zoomToObject:', store.zoomToObject !== null ? '✅ set' : '❌ null',
        'isolateObjects:', store.isolateObjects !== null ? '✅ set' : '❌ null',
      )
    }
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