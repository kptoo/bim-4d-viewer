import * as THREE from 'three'
import * as OBC from '@thatopen/components'
import * as FRAGS from '@thatopen/fragments'
import { ColorManager } from './ColorManager'

export interface ViewerEngineConfig {
  container:      HTMLDivElement
  onObjectPicked: (globalId: string | null, isMulti: boolean) => void
  onSceneReady:   () => void
  onModelLoaded:  (objectCount: number) => void
  onError:        (message: string) => void
}

interface RaycastResult {
  localId:  number
  distance: number
  point:    THREE.Vector3
}

// ── Augmented FragmentsModel interface ───────────────────────────────────────
// Only declares the methods we actually call. All are verified against
// @thatopen/fragments@3.4.6 dist/index.d.ts.

interface FragmentsModelInternal {
  // ID resolution
  getLocalIds():                       Promise<number[]>
  getGuidsByLocalIds(ids: number[]):   Promise<(string | null)[]>
  getLocalIdsByGuids(guids: string[]): Promise<(number | null)[]>

  // Bounding box — CORRECT API for zoom (no mesh walking)
  getMergedBox(localIds: number[]): Promise<THREE.Box3>

  // Visibility — CORRECT method name is setVisible (not setVisibility)
  setVisible(localIds: number[] | undefined, visible: boolean): Promise<void>
  resetVisible(): Promise<void>

  // Raycast
  raycast(params: {
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera
    mouse:  THREE.Vector2
    dom:    HTMLCanvasElement
  }): Promise<RaycastResult | null>

  // Tiles map — DataMap<string|number, THREE.Mesh>
  // Used only for debug inspection if needed
  tiles: Map<string | number, THREE.Mesh>
}

export class ViewerEngine {
  readonly components:       OBC.Components
  private world!:            OBC.SimpleWorld<
                               OBC.SimpleScene,
                               OBC.SimpleCamera,
                               OBC.SimpleRenderer
                             >
  private fragmentsManager!: OBC.FragmentsManager
  private ifcLoader!:        OBC.IfcLoader
  readonly colorManager:     ColorManager
  private loadedModels:      FRAGS.FragmentsModel[] = []

  private readonly config: ViewerEngineConfig
  private isDisposed = false
  private ro?: ResizeObserver

  // Tracks isolation state so restoreVisibility() knows whether a reset is needed
  private isIsolated = false

  constructor(config: ViewerEngineConfig) {
    this.config       = config
    this.components   = new OBC.Components()
    this.colorManager = new ColorManager()
  }

  async init(): Promise<void> {
    try {
      const worlds = this.components.get(OBC.Worlds)
      this.world   = worlds.create<
        OBC.SimpleScene,
        OBC.SimpleCamera,
        OBC.SimpleRenderer
      >()

      this.world.scene    = new OBC.SimpleScene(this.components)
      this.world.renderer = new OBC.SimpleRenderer(this.components, this.config.container)
      this.world.camera   = new OBC.SimpleCamera(this.components)

      this.components.init()
      this.removeBranding()

      this.world.scene.setup()
      this.world.scene.three.background = new THREE.Color(0x070B0F)
      this.world.scene.three.add(new THREE.AmbientLight(0xffffff, 0.5))

      const sun = new THREE.DirectionalLight(0xffffff, 1.2)
      sun.position.set(10, 20, 10)
      sun.castShadow            = true
      sun.shadow.mapSize.width  = 2048
      sun.shadow.mapSize.height = 2048
      sun.shadow.camera.near    = 0.5
      sun.shadow.camera.far     = 100
      sun.shadow.camera.left    = -50
      sun.shadow.camera.right   =  50
      sun.shadow.camera.top     =  50
      sun.shadow.camera.bottom  = -50
      this.world.scene.three.add(sun)

      const fill = new THREE.DirectionalLight(0x4466ff, 0.3)
      fill.position.set(-10, 5, -10)
      this.world.scene.three.add(fill)

      this.world.scene.three.add(new THREE.GridHelper(100, 100, 0x1C2128, 0x1C2128))

      this.world.camera.controls.setLookAt(12, 14, 18, 0, 0, 0)

      this.fragmentsManager = this.components.get(OBC.FragmentsManager)

      try {
        this.fragmentsManager.init('/worker.mjs')
      } catch {
        try {
          const workerUrl = await OBC.FragmentsManager.getWorker()
          this.fragmentsManager.init(workerUrl)
        } catch (workerErr) {
          console.warn('[ViewerEngine] Worker init failed:', workerErr)
        }
      }

      this.world.camera.controls.addEventListener('rest', () => {
        if (!this.isDisposed && this.fragmentsManager.initialized) {
          this.fragmentsManager.core.update(true)
        }
      })

      this.fragmentsManager.list.onItemSet.add(({ value: model }) => {
        model.useCamera(this.world.camera.three)
        this.world.scene.three.add(model.object)
        if (this.fragmentsManager.initialized) {
          this.fragmentsManager.core.update(true)
        }
        this.loadedModels.push(model)
      })

      this.ifcLoader = this.components.get(OBC.IfcLoader)
      await this.ifcLoader.setup({
        autoSetWasm: false,
        wasm: {
          path:     'https://unpkg.com/web-ifc@0.0.77/',
          absolute: true,
        },
      })

      this.config.container.addEventListener('click', this.handleClick)

      this.ro = new ResizeObserver(() => {
        if (!this.isDisposed && this.world?.renderer) {
          this.world.renderer.resize()
        }
      })
      this.ro.observe(this.config.container)

      this.config.onSceneReady()

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Viewer failed to initialize'
      this.config.onError(msg)
      throw err
    }
  }

  private removeBranding(): void {
    try {
      const container = this.config.container
      const selectors = [
        '#thatopen-logo', '[id*="thatopen"]', '[class*="thatopen"]',
        '[id*="that-open"]', '[class*="that-open"]', 'a[href*="thatopen.com"]',
      ]
      for (const selector of selectors) {
        container.querySelectorAll(selector).forEach(el => el.remove())
      }
      Array.from(container.children).forEach(child => {
        if (child.tagName.toLowerCase() === 'canvas') return
        const html = child.outerHTML.toLowerCase()
        if (html.includes('thatopen') || html.includes('thatopen.com')) {
          child.remove()
        }
      })
    } catch { /* non-critical */ }
  }

  // ── Unload ────────────────────────────────────────────────

  async unloadAll(): Promise<void> {
    this.isIsolated = false

    if (this.loadedModels.length === 0) return

    const toDispose = [...this.loadedModels]
    this.loadedModels = []

    for (const model of toDispose) {
      try {
        await model.dispose()
      } catch (err) {
        console.warn('[ViewerEngine] model.dispose() error:', err)
        try { this.world.scene.three.remove(model.object) } catch { /* ignore */ }
      }
    }
  }

  // ── Phase 3+: Zoom to object ──────────────────────────────

  /**
   * Fits the camera to the bounding box of a single IFC object.
   *
   * Uses model.getMergedBox(localIds) — the correct v3.4.6 API.
   * This is resolved by the worker thread from actual geometry data,
   * so no mesh traversal is required and LOD tiles are handled correctly.
   *
   * Previous broken approach: walking model.object children looking for
   * mesh.userData.expressID — that key does NOT exist in v3.4.6.
   * Tiles set userData.sampleId / userData.tileId / userData.itemIds (Set<number>).
   */
  async zoomToObject(globalId: string): Promise<void> {
    console.log('[ViewerEngine] zoomToObject — GlobalId:', globalId)

    if (!this.fragmentsManager?.initialized) {
      console.warn('[ViewerEngine] zoomToObject: FragmentsManager not initialized')
      return
    }
    if (this.loadedModels.length === 0) {
      console.warn('[ViewerEngine] zoomToObject: no models loaded')
      return
    }

    for (const model of this.loadedModels) {
      const internal = model as unknown as FragmentsModelInternal

      // Step 1: GlobalId → localId
      let localIds: (number | null)[] = []
      try {
        localIds = await internal.getLocalIdsByGuids([globalId])
      } catch (err) {
        console.warn('[ViewerEngine] zoomToObject: getLocalIdsByGuids failed', err)
        continue
      }

      const localId = localIds[0]
      console.log('[ViewerEngine] zoomToObject — localId:', localId)

      if (localId === null || localId === undefined) {
        console.warn('[ViewerEngine] zoomToObject: GlobalId not found in model')
        continue
      }

      // Step 2: Get the bounding box directly from the engine (correct API)
      // getMergedBox is resolved by the worker from actual geometry — no mesh walking
      let box: THREE.Box3
      try {
        box = await internal.getMergedBox([localId])
        console.log('[ViewerEngine] zoomToObject — bbox:', box.min, box.max, 'isEmpty:', box.isEmpty())
      } catch (err) {
        console.warn('[ViewerEngine] zoomToObject: getMergedBox failed', err)
        // Fallback: fit to whole model
        box = new THREE.Box3().setFromObject(model.object)
        console.log('[ViewerEngine] zoomToObject — fallback to model bbox:', box.isEmpty())
      }

      if (box.isEmpty()) {
        console.warn('[ViewerEngine] zoomToObject: bounding box is empty — skipping camera move')
        return
      }

      // Step 3: Move camera
      try {
        await this.world.camera.controls.fitToBox(box, true, {
          paddingLeft:   0.5,
          paddingRight:  0.5,
          paddingTop:    0.5,
          paddingBottom: 0.5,
        })
        console.log('[ViewerEngine] zoomToObject — camera move complete')
      } catch (err) {
        console.warn('[ViewerEngine] zoomToObject: fitToBox failed', err)
      }

      return // first model that contains the object wins
    }
  }

  // ── Phase 3+: Isolate objects ─────────────────────────────

  /**
   * Isolates a set of IFC objects by hiding everything else.
   * Passing an empty array restores full visibility.
   *
   * Uses model.setVisible(localIds, visible): Promise<void>
   * which is the correct v3.4.6 API.
   *
   * Previous broken approach used setVisibility() — that method does
   * not exist on FragmentsModel in any version of @thatopen/fragments.
   */
  async isolateObjects(globalIds: string[]): Promise<void> {
    console.log('[ViewerEngine] isolateObjects —', globalIds.length, 'GlobalIds')

    if (!this.fragmentsManager?.initialized) {
      console.warn('[ViewerEngine] isolateObjects: FragmentsManager not initialized')
      return
    }
    if (this.loadedModels.length === 0) {
      console.warn('[ViewerEngine] isolateObjects: no models loaded')
      return
    }

    if (globalIds.length === 0) {
      console.log('[ViewerEngine] isolateObjects: empty — restoring visibility')
      await this.restoreVisibility()
      return
    }

    this.isIsolated = true

    await Promise.all(
      this.loadedModels.map(async (model) => {
        const internal = model as unknown as FragmentsModelInternal

        // Step 1: resolve target GlobalIds → localIds
        let targetLocalIds: (number | null)[] = []
        try {
          targetLocalIds = await internal.getLocalIdsByGuids(globalIds)
        } catch (err) {
          console.warn('[ViewerEngine] isolateObjects: getLocalIdsByGuids failed', err)
          return
        }

        const targetSet = new Set<number>(
          targetLocalIds.filter((id): id is number => id !== null && id !== undefined)
        )
        console.log('[ViewerEngine] isolateObjects — target localIds:', targetSet.size)

        if (targetSet.size === 0) {
          console.warn('[ViewerEngine] isolateObjects: no localIds resolved')
          return
        }

        // Step 2: hide everything, then show only targets
        // setVisible(undefined, false) hides ALL items
        // setVisible(targetArray, true) shows only the targets
        try {
          await internal.setVisible(undefined, false)
          console.log('[ViewerEngine] isolateObjects — hid all items')

          await internal.setVisible(Array.from(targetSet), true)
          console.log('[ViewerEngine] isolateObjects — showed', targetSet.size, 'items')
        } catch (err) {
          console.warn('[ViewerEngine] isolateObjects: setVisible failed', err)
        }
      })
    )

    console.log('[ViewerEngine] isolateObjects — complete')
  }

  // ── Phase 3: Layer-filter visibility ─────────────────────
  // These methods use setVisible/resetVisible (correct API).

  async hideObjects(globalIds: string[]): Promise<void> {
    if (globalIds.length === 0 || !this.fragmentsManager?.initialized) return

    await Promise.all(
      this.loadedModels.map(async (model) => {
        const internal = model as unknown as FragmentsModelInternal
        try {
          const localIds = await internal.getLocalIdsByGuids(globalIds)
          const valid    = localIds.filter((id): id is number => id !== null && id !== undefined)
          if (valid.length === 0) return
          await internal.setVisible(valid, false)
        } catch {
          // Non-critical — suppress
        }
      })
    )
  }

  async showObjects(globalIds: string[]): Promise<void> {
    if (globalIds.length === 0 || !this.fragmentsManager?.initialized) return

    await Promise.all(
      this.loadedModels.map(async (model) => {
        const internal = model as unknown as FragmentsModelInternal
        try {
          const localIds = await internal.getLocalIdsByGuids(globalIds)
          const valid    = localIds.filter((id): id is number => id !== null && id !== undefined)
          if (valid.length === 0) return
          await internal.setVisible(valid, true)
        } catch {
          // Suppress
        }
      })
    )
  }

  async restoreVisibility(): Promise<void> {
    if (!this.fragmentsManager?.initialized) return

    await Promise.all(
      this.loadedModels.map(async (model) => {
        const internal = model as unknown as FragmentsModelInternal
        try {
          // resetVisible() restores all items to visible — correct v3.4.6 API
          await internal.resetVisible()
        } catch {
          // Suppress
        }
      })
    )

    this.isIsolated = false
  }

  // ── Color overrides ───────────────────────────────────────

  applyColorOverrides(overrides: Map<string, string>): void {
    if (!this.fragmentsManager?.initialized) return
    this.colorManager.applyOverrides(overrides, this.loadedModels)
  }

  resetColors(): void {
    if (!this.fragmentsManager?.initialized) return
    this.colorManager.resetAll(this.loadedModels)
  }

  // ── IFC loading ───────────────────────────────────────────

  async loadIFC(buffer: Uint8Array, fileName: string = 'model'): Promise<FRAGS.FragmentsModel> {
    if (!this.fragmentsManager.initialized) {
      throw new Error('FragmentsManager not initialized. Ensure /public/worker.mjs exists.')
    }

    await this.unloadAll()

    try {
      const model = await this.ifcLoader.load(buffer, true, fileName)
      await this.fitCameraToModel(model)
      return model
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to parse IFC file'
      this.config.onError(msg)
      throw err
    }
  }

  // ── Camera ────────────────────────────────────────────────

  private async fitCameraToModel(model: FRAGS.FragmentsModel): Promise<void> {
    try {
      const box = new THREE.Box3()
      box.setFromObject(model.object)

      if (box.isEmpty()) {
        await new Promise(resolve => setTimeout(resolve, 150))
        box.setFromObject(model.object)
      }

      if (box.isEmpty()) return

      const size   = new THREE.Vector3()
      const center = new THREE.Vector3()
      box.getSize(size)
      box.getCenter(center)

      const gridY = box.min.y
      this.world.scene.three.children
        .filter(c => c instanceof THREE.GridHelper)
        .forEach(grid => { grid.position.y = gridY })

      const maxDim = Math.max(size.x, size.y, size.z)
      this.world.scene.three.children
        .filter((c): c is THREE.DirectionalLight =>
          c instanceof THREE.DirectionalLight && c.castShadow
        )
        .forEach(sun => {
          sun.position.set(center.x + maxDim, center.y + maxDim * 2, center.z + maxDim)
          sun.target.position.copy(center)
          sun.target.updateMatrixWorld()
          sun.shadow.camera.near   = 0.5
          sun.shadow.camera.far    = maxDim * 6
          sun.shadow.camera.left   = -maxDim * 2
          sun.shadow.camera.right  =  maxDim * 2
          sun.shadow.camera.top    =  maxDim * 2
          sun.shadow.camera.bottom = -maxDim * 2
          sun.shadow.camera.updateProjectionMatrix()
        })

      await this.world.camera.controls.fitToBox(box, true, {
        paddingLeft:   0.1,
        paddingRight:  0.1,
        paddingTop:    0.1,
        paddingBottom: 0.1,
      })

    } catch (err) {
      console.warn('[ViewerEngine] fitCameraToModel failed:', err)
    }
  }

  // ── Click handler ─────────────────────────────────────────

  private handleClick = async (e: MouseEvent): Promise<void> => {
    if (!this.world || !this.fragmentsManager?.initialized) return
    if (this.loadedModels.length === 0) return

    const isMulti    = e.ctrlKey || e.metaKey
    const domElement = this.world.renderer?.three?.domElement
    if (!domElement) return

    const mouse = new THREE.Vector2(e.clientX, e.clientY)

    try {
      const candidates: Array<{ globalId: string; distance: number }> = []

      await Promise.all(
        this.loadedModels.map(async (model) => {
          const internal = model as unknown as FragmentsModelInternal
          let result: RaycastResult | null = null

          try {
            result = await internal.raycast({
              camera: this.world.camera.three as THREE.PerspectiveCamera,
              mouse,
              dom:    domElement as HTMLCanvasElement,
            })
          } catch { return }

          if (!result || result.localId === undefined) return

          let guids: (string | null)[] = []
          try {
            guids = await internal.getGuidsByLocalIds([result.localId])
          } catch { return }

          const globalId = guids[0]
          if (typeof globalId !== 'string' || globalId.length === 0) return

          candidates.push({ globalId, distance: result.distance ?? Infinity })
        })
      )

      if (candidates.length === 0) {
        this.config.onObjectPicked(null, false)
        return
      }

      candidates.sort((a, b) => a.distance - b.distance)
      this.config.onObjectPicked(candidates[0].globalId, isMulti)

    } catch {
      this.config.onObjectPicked(null, false)
    }
  }

  // ── Getters ───────────────────────────────────────────────

  getScene(): THREE.Scene         { return this.world.scene.three }
  getFragmentsManager()           { return this.fragmentsManager }
  getLoadedModels()               { return this.loadedModels }

  // ── Dispose ───────────────────────────────────────────────

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    try {
      this.ro?.disconnect()
      this.config.container.removeEventListener('click', this.handleClick)
      this.components.dispose()
    } catch { /* suppress */ }
  }
}