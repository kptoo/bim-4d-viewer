import { create } from 'zustand'
import type { IFCObject, IFCSpatialTree } from '../types'

export type RenderMode = 'perspective' | 'top' | 'front' | 'wireframe'

export type ModelLoadState =
  | 'idle'        // No model loaded, showing upload zone
  | 'loading'     // WASM parsing in progress
  | 'loaded'      // Model fully loaded and rendered
  | 'error'       // Load failed

interface ViewerState {
  /** All IFC objects currently loaded (physical elements only) */
  ifcObjects:       IFCObject[]

  /**
   * The IFC spatial decomposition tree.
   * Built from IFCRELAGGREGATES + IFCRELCONTAINEDINSPATIALSTRUCTURE.
   * null when no model is loaded or extraction failed.
   */
  spatialTree:      IFCSpatialTree | null

  /** Current model load state */
  modelLoadState:   ModelLoadState
  /** Error message if modelLoadState === 'error' */
  modelError:       string | null
  /** Loaded file name for display */
  modelFileName:    string | null
  /** Loaded file size for display */
  modelFileSize:    number | null
  /** Whether the Three.js scene is initialized */
  sceneReady:       boolean
  /** Current render mode / active camera view */
  renderMode:       RenderMode
  /**
   * Whether wireframe is currently enabled.
   * Tracked separately from renderMode so that wireframe can be
   * toggled independently of the active camera view.
   */
  wireframeActive:  boolean

  /**
   * Engine action: zoom the camera to fit a single IFC object.
   * Set by IFCViewer once the ViewerEngine is ready (onSceneReady).
   * Persists across model loads — only cleared on ViewerEngine disposal.
   * null when no engine is mounted.
   */
  zoomToObject:     ((globalId: string) => void) | null

  /**
   * Engine action: isolate one or more IFC objects (hide all others).
   * Passing an empty array restores full visibility.
   * Set by IFCViewer once the ViewerEngine is ready (onSceneReady).
   * Persists across model loads — only cleared on ViewerEngine disposal.
   * null when no engine is mounted.
   */
  isolateObjects:   ((globalIds: string[]) => void) | null

  /**
   * Engine action: switch to perspective view.
   * Registered by IFCViewer in onSceneReady. null until engine is mounted.
   */
  setCameraPerspective: (() => void) | null

  /**
   * Engine action: switch to top (plan) view.
   * Registered by IFCViewer in onSceneReady. null until engine is mounted.
   */
  setCameraTop: (() => void) | null

  /**
   * Engine action: switch to front (elevation) view.
   * Registered by IFCViewer in onSceneReady. null until engine is mounted.
   */
  setCameraFront: (() => void) | null

  /**
   * Engine action: toggle wireframe rendering.
   * Registered by IFCViewer in onSceneReady. null until engine is mounted.
   */
  setWireframe: ((enabled: boolean) => void) | null

  // ── Actions ──────────────────────────────────────────────
  setIFCObjects:       (objects: IFCObject[]) => void
  setSpatialTree:      (tree: IFCSpatialTree | null) => void
  setModelLoadState:   (state: ModelLoadState) => void
  setModelError:       (error: string | null) => void
  setModelMeta:        (fileName: string, fileSize: number) => void
  setSceneReady:       (ready: boolean) => void
  setRenderMode:       (mode: RenderMode) => void
  setWireframeActive:  (active: boolean) => void
  setEngineActions:    (
    zoom: (globalId: string) => void,
    isolate: (globalIds: string[]) => void
  ) => void
  /**
   * Registers the camera view + wireframe callbacks from the live ViewerEngine.
   * Called inside IFCViewer's onSceneReady, alongside setEngineActions.
   * Persists across model loads — cleared only on engine disposal.
   */
  setCameraActions: (
    perspective: () => void,
    top:         () => void,
    front:       () => void,
    wireframe:   (enabled: boolean) => void
  ) => void
  clearEngineActions:  () => void
  resetModel:          () => void
  getObjectByGlobalId: (globalId: string) => IFCObject | undefined
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  ifcObjects:           [],
  spatialTree:          null,
  modelLoadState:       'idle',
  modelError:           null,
  modelFileName:        null,
  modelFileSize:        null,
  sceneReady:           false,
  renderMode:           'perspective',
  wireframeActive:      false,
  zoomToObject:         null,
  isolateObjects:       null,
  setCameraPerspective: null,
  setCameraTop:         null,
  setCameraFront:       null,
  setWireframe:         null,

  setIFCObjects:     (objects) => set({ ifcObjects: objects }),
  setSpatialTree:    (tree)    => set({ spatialTree: tree }),
  setModelLoadState: (state)   => set({ modelLoadState: state }),
  setModelError:     (error)   => set({ modelError: error }),
  setModelMeta:      (fileName, fileSize) => set({ modelFileName: fileName, modelFileSize: fileSize }),
  setSceneReady:     (ready)   => set({ sceneReady: ready }),
  setRenderMode:     (mode)    => set({ renderMode: mode }),
  setWireframeActive:(active)  => set({ wireframeActive: active }),

  setEngineActions: (zoom, isolate) => set({
    zoomToObject:   zoom,
    isolateObjects: isolate,
  }),

  setCameraActions: (perspective, top, front, wireframe) => set({
    setCameraPerspective: perspective,
    setCameraTop:         top,
    setCameraFront:       front,
    setWireframe:         wireframe,
  }),

  clearEngineActions: () => set({
    zoomToObject:         null,
    isolateObjects:       null,
    setCameraPerspective: null,
    setCameraTop:         null,
    setCameraFront:       null,
    setWireframe:         null,
  }),

  // ── FIX: resetModel resets only MODEL data and load state. ──────────────
  //
  // It must NOT null zoomToObject / isolateObjects / camera actions.
  //
  // Root cause of the bug:
  //   The "Load New Model" button in Layout.tsx calls resetModel() before the
  //   user uploads the next file.  resetModel previously nulled the engine
  //   action callbacks.  Because setEngineActions is only called once — inside
  //   onSceneReady, which fires only during ViewerEngine.init() at component
  //   mount — those callbacks were never restored after a model replacement.
  //   Result: Zoom / Isolate buttons remained permanently disabled for every
  //   model loaded after the first.
  //
  // Engine action callbacks are closures that reference the live ViewerEngine
  // via engineRef.current.  The ViewerEngine instance is created once at
  // IFCViewer mount and persists across model loads.  The callbacks remain
  // valid as long as the engine is alive.
  //
  // Responsibility split:
  //   • resetModel()        — clears MODEL data only (objects, tree, state,
  //                           meta, renderMode, wireframeActive).
  //                           Never touches engine action callbacks.
  //   • clearEngineActions() — called only in the IFCViewer mount-effect
  //                            cleanup (i.e. on engine disposal / unmount).
  //                            This is the only correct place to null them.
  //
  resetModel: () => set({
    ifcObjects:      [],
    spatialTree:     null,
    modelLoadState:  'idle',
    modelError:      null,
    modelFileName:   null,
    modelFileSize:   null,
    renderMode:      'perspective',
    wireframeActive: false,
    // zoomToObject, isolateObjects, and all camera actions are intentionally
    // NOT reset here — see comment above.
  }),

  getObjectByGlobalId: (globalId) =>
    get().ifcObjects.find(o => o.globalId === globalId),
}))