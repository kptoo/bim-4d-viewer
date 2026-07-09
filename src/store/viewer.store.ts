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
  /** Current render mode */
  renderMode:       RenderMode

  /**
   * Engine action: zoom the camera to fit a single IFC object.
   * Set by IFCViewer once the ViewerEngine is ready.
   * null when no engine is mounted.
   */
  zoomToObject:     ((globalId: string) => void) | null

  /**
   * Engine action: isolate one or more IFC objects (hide all others).
   * Passing an empty array restores full visibility.
   * Set by IFCViewer once the ViewerEngine is ready.
   * null when no engine is mounted.
   */
  isolateObjects:   ((globalIds: string[]) => void) | null

  // ── Actions ──────────────────────────────────────────────
  setIFCObjects:       (objects: IFCObject[]) => void
  setSpatialTree:      (tree: IFCSpatialTree | null) => void
  setModelLoadState:   (state: ModelLoadState) => void
  setModelError:       (error: string | null) => void
  setModelMeta:        (fileName: string, fileSize: number) => void
  setSceneReady:       (ready: boolean) => void
  setRenderMode:       (mode: RenderMode) => void
  setEngineActions:    (
    zoom: (globalId: string) => void,
    isolate: (globalIds: string[]) => void
  ) => void
  clearEngineActions:  () => void
  resetModel:          () => void
  getObjectByGlobalId: (globalId: string) => IFCObject | undefined
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  ifcObjects:      [],
  spatialTree:     null,
  modelLoadState:  'idle',
  modelError:      null,
  modelFileName:   null,
  modelFileSize:   null,
  sceneReady:      false,
  renderMode:      'perspective',
  zoomToObject:    null,
  isolateObjects:  null,

  setIFCObjects:     (objects) => set({ ifcObjects: objects }),
  setSpatialTree:    (tree)    => set({ spatialTree: tree }),
  setModelLoadState: (state)   => set({ modelLoadState: state }),
  setModelError:     (error)   => set({ modelError: error }),
  setModelMeta:      (fileName, fileSize) => set({ modelFileName: fileName, modelFileSize: fileSize }),
  setSceneReady:     (ready)   => set({ sceneReady: ready }),
  setRenderMode:     (mode)    => set({ renderMode: mode }),

  setEngineActions: (zoom, isolate) => set({
    zoomToObject:   zoom,
    isolateObjects: isolate,
  }),

  clearEngineActions: () => set({
    zoomToObject:   null,
    isolateObjects: null,
  }),

  resetModel: () => set({
    ifcObjects:    [],
    spatialTree:   null,
    modelLoadState:'idle',
    modelError:    null,
    modelFileName: null,
    modelFileSize: null,
    zoomToObject:  null,
    isolateObjects: null,
  }),

  getObjectByGlobalId: (globalId) =>
    get().ifcObjects.find(o => o.globalId === globalId),
}))