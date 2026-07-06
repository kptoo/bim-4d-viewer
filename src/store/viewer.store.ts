/**
 * Viewer store — Phase 2 update.
 *
 * Now tracks real IFC loading state in addition to
 * the viewer engine reference. The ViewerEngine instance
 * is stored as a ref outside React — this store only
 * holds serializable state.
 */

import { create } from 'zustand'
import type { IFCObject } from '../types'

export type RenderMode = 'perspective' | 'top' | 'front' | 'wireframe'

export type ModelLoadState =
  | 'idle'        // No model loaded, showing upload zone
  | 'loading'     // WASM parsing in progress
  | 'loaded'      // Model fully loaded and rendered
  | 'error'       // Load failed

interface ViewerState {
  /** All IFC objects currently loaded */
  ifcObjects:       IFCObject[]
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

  // ── Actions ──────────────────────────────────────────────
  setIFCObjects:      (objects: IFCObject[]) => void
  setModelLoadState:  (state: ModelLoadState) => void
  setModelError:      (error: string | null) => void
  setModelMeta:       (fileName: string, fileSize: number) => void
  setSceneReady:      (ready: boolean) => void
  setRenderMode:      (mode: RenderMode) => void
  resetModel:         () => void
  getObjectByGlobalId:(globalId: string) => IFCObject | undefined
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  ifcObjects:      [],
  modelLoadState:  'idle',
  modelError:      null,
  modelFileName:   null,
  modelFileSize:   null,
  sceneReady:      false,
  renderMode:      'perspective',

  setIFCObjects:     (objects) => set({ ifcObjects: objects }),
  setModelLoadState: (state)   => set({ modelLoadState: state }),
  setModelError:     (error)   => set({ modelError: error }),
  setModelMeta:      (fileName, fileSize) => set({ modelFileName: fileName, modelFileSize: fileSize }),
  setSceneReady:     (ready)   => set({ sceneReady: ready }),
  setRenderMode:     (mode)    => set({ renderMode: mode }),

  resetModel: () => set({
    ifcObjects:    [],
    modelLoadState:'idle',
    modelError:    null,
    modelFileName: null,
    modelFileSize: null,
  }),

  getObjectByGlobalId: (globalId) =>
    get().ifcObjects.find(o => o.globalId === globalId),
}))