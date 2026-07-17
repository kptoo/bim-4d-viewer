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
import SelectionLabel          from './SelectionLabel'
import { useAllAssignments, useGlobalIdLayerMap } from '../hooks/useAssignments'
import { useActivities, useGlobalIdActivityMap }  from '../hooks/useActivities'

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
  const setCameraActions    = useViewerStore(s => s.setCameraActions)
  const clearEngineActions  = useViewerStore(s => s.clearEngineActions)

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

  // ── Phase 3: Bootstrap DB data — layers ──────────────────
  // React Query deduplicates: subscribing here doesn't fire extra requests.
  useAllAssignments()
  useGlobalIdLayerMap()

  // ── Phase 4: Bootstrap DB data — activities ──────────────
  // useActivities fetches all activities and syncs to activity store.
  // useGlobalIdActivityMap patches IFCObject.activityIds for FilterEngine.
  useActivities()
  useGlobalIdActivityMap()

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

        setCameraActions(
          () => { engineRef.current?.setCameraPerspective().catch(console.warn) },
          () => { engineRef.current?.setCameraTop().catch(console.warn) },
          () => { engineRef.current?.setCameraFront().catch(console.warn) },
          (enabled: boolean) => { engineRef.current?.setWireframe(enabled) }
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
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !sceneReady) return
    if (zoomToObject !== null && isolateObjects !== null) return

    console.warn('[IFCViewer] ⚠ Engine action callbacks are null while engine is alive — restoring.')

    setEngineActions(
      (globalId: string) => {
        engineRef.current?.zoomToObject(globalId).catch(console.warn)
      },
      (globalIds: string[]) => {
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

  // ── Effect 3: Layer filter visibility ───────────────────
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

  // ── Effect 4: Wireframe selection reveal (programmatic path) ──
  //
  // ARCHITECTURE — TWO PATHS FOR WIREFRAME SELECTION REVEAL
  // ─────────────────────────────────────────────────────────
  //
  // PATH 1 — 3D click (handled in ViewerEngine.handleClick):
  //   The raycast result already contains the localId of the clicked element.
  //   ViewerEngine calls setWireframeSelection() synchronously, before
  //   onObjectPicked() fires. This bypasses React scheduling entirely.
  //   No store reads, no async waits, no Effect 4 needed.
  //
  // PATH 2 — Programmatic selection (Gantt, Object Tree, this effect):
  //   Selection originates outside the 3D scene. The engine doesn't know about
  //   it until the store updates and this effect fires. We call
  //   engine.updateWireframeSelection(globalIds) which resolves to localIds
  //   and calls setWireframeSelection internally.
  //
  // WHY WE CHECK engine.isWireframeEnabled() INSTEAD OF wireframeActive:
  //   wireframeActive in viewer.store is the UI state (set by Layout.tsx button).
  //   engine.isWireframeEnabled() is the engine's actual rendering state.
  //   These should always agree, but if viewer.store.ts wasn't updated with
  //   wireframeActive (original codebase doesn't have it), wireframeActive
  //   would be undefined → always falsy → Effect 4 exits silently every time.
  //   Checking the engine directly is robust regardless of store version.
  //
  // NOTE: For clicks, Path 1 already handled the reveal. This effect running
  // again is a no-op because updateWireframeSelection() will resolve the same
  // GlobalIds to the same localIds already revealed by Path 1.

  useEffect(() => {
    const engine = engineRef.current
    if (!engine || modelLoadState !== 'loaded') return

    // Query the engine's actual state — robust against store version mismatches
    if (!engine.isWireframeEnabled()) return

    const globalIds = Array.from(selectedGlobalIds)

    console.log(
      '[IFCViewer] Effect 4 — wireframe selection update (programmatic path)',
      `selectedGlobalIds: [${globalIds.slice(0, 3).join(', ')}${globalIds.length > 3 ? '…' : ''}]`
    )

    // updateWireframeSelection handles empty array → clear reveal
    engine.updateWireframeSelection(globalIds).catch(console.warn)

  }, [
    selectedGlobalIds,
    primaryGlobalId,
    modelLoadState,
    // wireframeActive intentionally omitted — we check engine.isWireframeEnabled()
    // directly to avoid dependency on store version. The effect still fires on
    // selection changes regardless of wireframe state; the guard inside
    // engine.isWireframeEnabled() exits cleanly when wireframe is off.
  ])

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

      {modelLoadState === 'loaded' && (
        <SelectionLabel engineRef={engineRef} />
      )}

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