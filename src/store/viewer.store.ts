/**
 * viewer.store.ts — Zustand store for the 3D viewer and IFC model state.
 *
 * This store is the bridge between the pure-JS ViewerEngine (Three.js)
 * and the React component tree. It holds:
 *
 * 1. **Model data** — IFC objects and the spatial tree extracted from the IFC file.
 * 2. **Load state** — Tracks the IFC loading lifecycle (idle → loading → loaded/error).
 * 3. **Render state** — Active camera view and wireframe toggle.
 * 4. **Engine actions** — Callback references into the live ViewerEngine instance.
 *    These are nulled only when the engine is disposed (component unmount).
 *
 * Phase 6 selection UX change:
 * - Added `isIsolated: boolean` and `setIsIsolated(boolean)`.
 *
 *   Previously, isolation state was local React state (`useState`) inside
 *   `IFCInspector`. This made it invisible to every other component —
 *   `SelectionLabel`, `IFCViewer`'s Escape handler, and the viewer toolbar
 *   could not know whether the model was isolated or not.
 *
 *   Moving it to the store makes it a single observable truth:
 *   - `IFCInspector` calls `setIsIsolated` when it triggers `isolateObjects`.
 *   - `SelectionLabel` reads `isIsolated` to show/hide the "Show All" button.
 *   - `IFCViewer`'s Escape handler calls `setIsIsolated(false)` when it resets.
 *   - Any future toolbar or context menu can read the same value.
 *
 * Architecture note on engine actions:
 *   Engine actions (zoom, isolate, camera views) are closures that reference
 *   the live ViewerEngine via engineRef.current in IFCViewer. They are
 *   registered once in onSceneReady and persist across model reloads.
 *
 *   `resetModel()` intentionally does NOT clear engine actions. Only
 *   `clearEngineActions()` — called in the IFCViewer unmount cleanup —
 *   should null them. See viewer.store.ts inline comments for details.
 *
 * @module viewer.store
 */

import { create } from 'zustand'
import type { IFCObject, IFCSpatialTree } from '../types'

// ── Type exports ───────────────────────────────────────────────────────────────

/**
 * The active camera view mode.
 * 'wireframe' is used to track the active state of the wireframe toggle button,
 * not as a standalone camera projection.
 */
export type RenderMode = 'perspective' | 'top' | 'front' | 'wireframe'

/**
 * IFC model load lifecycle states.
 * - `idle`    — No model loaded; upload zone is visible.
 * - `loading` — WASM parsing in progress; loading overlay is visible.
 * - `loaded`  — Model fully loaded and rendered in the 3D scene.
 * - `error`   — Load failed; error message is displayed.
 */
export type ModelLoadState =
  | 'idle'
  | 'loading'
  | 'loaded'
  | 'error'

// ── State shape ───────────────────────────────────────────────────────────────

interface ViewerState {
  /** All IFC physical elements extracted from the model (no spatial nodes). */
  ifcObjects: IFCObject[]

  /**
   * The IFC spatial decomposition tree built from IFCRELAGGREGATES and
   * IFCRELCONTAINEDINSPATIALSTRUCTURE relationships.
   * null when no model is loaded or extraction failed.
   */
  spatialTree: IFCSpatialTree | null

  /** Current model load lifecycle state. */
  modelLoadState: ModelLoadState

  /** Error message when modelLoadState === 'error'. null otherwise. */
  modelError: string | null

  /** Name of the loaded IFC file (e.g. "office-building.ifc"). null when unloaded. */
  modelFileName: string | null

  /** Size of the loaded IFC file in bytes. null when unloaded. */
  modelFileSize: number | null

  /**
   * Whether the Three.js scene has been initialized.
   * Set to true once ViewerEngine.init() completes (onSceneReady fires).
   * Controls whether engine action buttons are enabled in the UI.
   */
  sceneReady: boolean

  /** The active camera view mode. Used to highlight the correct view button. */
  renderMode: RenderMode

  /**
   * Whether wireframe mode is currently enabled.
   * Tracked separately from renderMode so wireframe can be toggled
   * independently of the active camera projection.
   */
  wireframeActive: boolean

  /**
   * Whether the model is currently in isolate mode.
   *
   * TRUE  — One or more objects are isolated; all others are hidden.
   * FALSE — All objects are visible (normal model state).
   *
   * Previously tracked as local useState in IFCInspector. Moved to the
   * viewer store so SelectionLabel, IFCViewer's Escape handler, and any
   * future UI element can observe and clear the isolation state without
   * opening the Inspector panel.
   *
   * Writers: IFCInspector (when the Isolate/Show All button is clicked).
   * Readers: SelectionLabel (shows "Show All" button), IFCViewer (Escape key).
   */
  isIsolated: boolean

  /**
   * Zooms the camera to frame a single IFC object.
   * Set by IFCViewer in onSceneReady. null until the engine is ready.
   */
  zoomToObject: ((globalId: string) => void) | null

  /**
   * Isolates one or more IFC objects (hides all others).
   * Passing an empty array restores full model visibility.
   * Set by IFCViewer in onSceneReady. null until the engine is ready.
   */
  isolateObjects: ((globalIds: string[]) => void) | null

  /** Switches the camera to standard perspective projection. */
  setCameraPerspective: (() => void) | null

  /** Switches the camera to orthographic top-down (plan) view. */
  setCameraTop: (() => void) | null

  /** Switches the camera to orthographic front (elevation) view. */
  setCameraFront: (() => void) | null

  /** Enables or disables wireframe overlay rendering. */
  setWireframe: ((enabled: boolean) => void) | null

  // ── Actions ──────────────────────────────────────────────

  /** Replaces the loaded IFC objects array. Called after IFC parsing completes. */
  setIFCObjects:       (objects: IFCObject[]) => void
  /** Sets the spatial decomposition tree. */
  setSpatialTree:      (tree: IFCSpatialTree | null) => void
  /** Updates the model load state machine. */
  setModelLoadState:   (state: ModelLoadState) => void
  /** Sets the error message. */
  setModelError:       (error: string | null) => void
  /** Sets model file metadata. */
  setModelMeta:        (fileName: string, fileSize: number) => void
  /** Marks the Three.js scene as initialized. */
  setSceneReady:       (ready: boolean) => void
  /** Updates the active camera view mode. */
  setRenderMode:       (mode: RenderMode) => void
  /** Updates the wireframe active flag. */
  setWireframeActive:  (active: boolean) => void

  /**
   * Sets the isolation state.
   *
   * Called by IFCInspector when isolateObjects() or isolateObjects([]) is
   * triggered. Also called by IFCViewer's Escape handler when clearing all
   * selection and isolation state at once.
   *
   * @param isolated - true when objects are isolated; false when all visible
   */
  setIsIsolated: (isolated: boolean) => void

  /**
   * Registers the zoom and isolate action callbacks from the ViewerEngine.
   * Called in IFCViewer's onSceneReady.
   */
  setEngineActions: (
    zoom:    (globalId: string) => void,
    isolate: (globalIds: string[]) => void
  ) => void

  /**
   * Registers the camera view and wireframe callbacks from the ViewerEngine.
   * Called in IFCViewer's onSceneReady alongside setEngineActions.
   */
  setCameraActions: (
    perspective: () => void,
    top:         () => void,
    front:       () => void,
    wireframe:   (enabled: boolean) => void
  ) => void

  /**
   * Clears all engine action callbacks.
   * Called ONLY in IFCViewer's useEffect cleanup (engine disposal).
   */
  clearEngineActions: () => void

  /**
   * Resets model data back to the 'idle' state.
   * Also resets isIsolated since isolation is meaningless without a model.
   * Does NOT clear engine action callbacks.
   */
  resetModel: () => void

  /**
   * Looks up a single IFC object by its GlobalId.
   */
  getObjectByGlobalId: (globalId: string) => IFCObject | undefined
}

// ── Store ─────────────────────────────────────────────────────────────────────

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
  isIsolated:           false,
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
  setIsIsolated:     (isolated) => set({ isIsolated: isolated }),

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

  // ── resetModel ─────────────────────────────────────────────────────────────
  //
  // Resets ONLY model data and load state. Does NOT touch engine callbacks.
  // Also resets isIsolated — isolation state is meaningless without a model.
  //
  // Background:
  //   The "Load New Model" flow (Layout → resetModel → upload → IFCViewer loads)
  //   must NOT clear engine action callbacks because:
  //
  //   1. The ViewerEngine instance is created ONCE at IFCViewer mount and
  //      persists for the lifetime of the component.
  //   2. Engine callbacks (zoom, isolate, camera) are closures over
  //      engineRef.current, which remains valid across model loads.
  //   3. setEngineActions() and setCameraActions() are called in onSceneReady,
  //      which fires ONLY during ViewerEngine.init() — not on each model load.
  //   4. If resetModel() cleared callbacks, they would never be restored for
  //      the second, third, etc. model loaded in the same session.
  //
  //   clearEngineActions() is the ONLY correct place to null callbacks, and
  //   it is called only in IFCViewer's useEffect cleanup (component unmount).
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
    isIsolated:      false,
    // zoomToObject, isolateObjects, setCameraPerspective, setCameraTop,
    // setCameraFront, setWireframe — intentionally NOT reset here.
  }),

  getObjectByGlobalId: (globalId) =>
    get().ifcObjects.find(o => o.globalId === globalId),
}))