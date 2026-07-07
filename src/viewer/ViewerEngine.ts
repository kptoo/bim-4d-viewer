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

interface FragmentsModelInternal {
  getLocalIds():                     Promise<number[]>
  getGuidsByLocalIds(ids: number[]): Promise<(string | null)[]>
  raycast(params: {
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera
    mouse:  THREE.Vector2
    dom:    HTMLCanvasElement
  }): Promise<RaycastResult | null>
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

  constructor(config: ViewerEngineConfig) {
    this.config       = config
    this.components   = new OBC.Components()
    this.colorManager = new ColorManager()
  }

  async init(): Promise<void> {
    try {
      // ── 1. World ──────────────────────────────────────────
      const worlds = this.components.get(OBC.Worlds)
      this.world   = worlds.create<
        OBC.SimpleScene,
        OBC.SimpleCamera,
        OBC.SimpleRenderer
      >()

      this.world.scene    = new OBC.SimpleScene(this.components)
      this.world.renderer = new OBC.SimpleRenderer(
        this.components,
        this.config.container
      )
      this.world.camera = new OBC.SimpleCamera(this.components)

      // ── 2. Boot engine ────────────────────────────────────
      this.components.init()

      // ── 2b. Remove "That Open Company" branding ───────────
      // SimpleRenderer injects a branding overlay element into the container
      // after init(). We remove it by targeting the known element attributes.
      // This does NOT modify any library source; it only removes a DOM node
      // that the library itself appended to our container div.
      this.removeBranding()

      // ── 3. Scene ──────────────────────────────────────────
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

      this.world.scene.three.add(
        new THREE.GridHelper(100, 100, 0x1C2128, 0x1C2128)
      )

      // ── 4. Camera default position ────────────────────────
      this.world.camera.controls.setLookAt(12, 14, 18, 0, 0, 0)

      // ── 5. FragmentsManager ───────────────────────────────
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

      // ── 6. IfcLoader ──────────────────────────────────────
      this.ifcLoader = this.components.get(OBC.IfcLoader)
      await this.ifcLoader.setup({
        autoSetWasm: false,
        wasm: {
          path:     'https://unpkg.com/web-ifc@0.0.77/',
          absolute: true,
        },
      })

      // ── 7. Click / pick handler ───────────────────────────
      this.config.container.addEventListener('click', this.handleClick)

      // ── 8. Resize observer ────────────────────────────────
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

  /**
   * Removes the "That Open Company" branding overlay injected by SimpleRenderer.
   *
   * @thatopen/components SimpleRenderer appends a small <div> watermark to
   * the container element after components.init(). This method removes it by
   * scanning the container's direct children for the known branding element
   * (identified by its style characteristics or data attributes).
   *
   * We do NOT modify library source — only our own container's DOM children.
   * Called immediately after components.init() so the element is already present.
   */
  private removeBranding(): void {
    try {
      const container = this.config.container

      // The branding element is a direct child <div> of the container
      // with fixed positioning and a low z-index watermark.
      // OBC v3.x injects it with id="thatopen-logo" or a known class.
      // We target any of the known selectors defensively.
      const selectors = [
        '#thatopen-logo',
        '[id*="thatopen"]',
        '[class*="thatopen"]',
        '[id*="that-open"]',
        '[class*="that-open"]',
        // Fallback: any anchor linking to thatopen.com injected by the library
        'a[href*="thatopen.com"]',
      ]

      for (const selector of selectors) {
        container.querySelectorAll(selector).forEach(el => {
          el.remove()
          console.log(`[ViewerEngine] Removed branding element matching: ${selector}`)
        })
      }

      // Also scan direct children for any <div> or <a> injected after the canvas
      // that links to the That Open Company website
      Array.from(container.children).forEach(child => {
        const tagName = child.tagName.toLowerCase()
        if (tagName === 'canvas') return // keep the canvas

        const html = child.outerHTML.toLowerCase()
        if (
          html.includes('thatopen') ||
          html.includes('that open') ||
          html.includes('thatopen.com')
        ) {
          child.remove()
          console.log('[ViewerEngine] Removed branding element via content scan')
        }
      })

    } catch (err) {
      // Non-critical: if removal fails the branding may appear but the viewer works
      console.warn('[ViewerEngine] removeBranding failed:', err)
    }
  }

  // ────────────────────────────────────────────────────────
  // Unloads every currently loaded model and frees all
  // associated GPU and worker resources.
  //
  // model.dispose() is the canonical That Open Engine API:
  //   - Terminates the worker thread slot for this model
  //   - Frees shared MaterialManager entries
  //   - Removes model.object from its parent (the scene)
  //   - Disposes tile mesh geometries
  //
  // Called automatically at the top of loadIFC() so that
  // loading a second IFC always starts from a clean scene.
  // Also exposed publicly so callers (IFCUploadZone, Layout)
  // can clear the scene before showing the upload UI.
  // ────────────────────────────────────────────────────────
  async unloadAll(): Promise<void> {
    if (this.loadedModels.length === 0) return

    const toDispose = [...this.loadedModels]
    this.loadedModels = []

    for (const model of toDispose) {
      try {
        await model.dispose()
      } catch (err) {
        // Dispose errors are non-critical — log and continue
        console.warn('[ViewerEngine] model.dispose() error:', err)
        // Fallback: manually remove from scene if dispose() failed
        try {
          this.world.scene.three.remove(model.object)
        } catch {
          // ignore
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────
  // Camera fit
  // ────────────────────────────────────────────────────────
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
          sun.position.set(
            center.x + maxDim,
            center.y + maxDim * 2,
            center.z + maxDim
          )
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

  // ────────────────────────────────────────────────────────
  // Click handler
  // mouse carries raw client coordinates (e.clientX / e.clientY).
  // The Fragments library's screenToCast() calls getBoundingClientRect()
  // on the canvas and converts to NDC internally.
  // ────────────────────────────────────────────────────────
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
          } catch {
            return
          }

          if (!result || result.localId === undefined) return

          let guids: (string | null)[] = []
          try {
            guids = await internal.getGuidsByLocalIds([result.localId])
          } catch {
            return
          }

          const globalId = guids[0]
          if (typeof globalId !== 'string' || globalId.length === 0) return

          candidates.push({
            globalId,
            distance: result.distance ?? Infinity,
          })
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

  /**
   * Unloads any existing model, then loads the given IFC buffer.
   * Does NOT call onModelLoaded — that is done by IFCParserService
   * after extractObjects() completes, ensuring count is never 0.
   */
  async loadIFC(
    buffer:   Uint8Array,
    fileName: string = 'model'
  ): Promise<FRAGS.FragmentsModel> {
    if (!this.fragmentsManager.initialized) {
      throw new Error(
        'FragmentsManager not initialized. Ensure /public/worker.mjs exists.'
      )
    }

    // Always start from a clean scene — dispose previous model first
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

  applyColorOverrides(overrides: Map<string, string>): void {
    if (!this.fragmentsManager?.initialized) return
    this.colorManager.applyOverrides(overrides, this.loadedModels)
  }

  resetColors(): void {
    if (!this.fragmentsManager?.initialized) return
    this.colorManager.resetAll(this.loadedModels)
  }

  getScene(): THREE.Scene {
    return this.world.scene.three
  }

  getFragmentsManager(): OBC.FragmentsManager {
    return this.fragmentsManager
  }

  getLoadedModels(): FRAGS.FragmentsModel[] {
    return this.loadedModels
  }

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    try {
      this.ro?.disconnect()
      this.config.container.removeEventListener('click', this.handleClick)
      this.components.dispose()
    } catch {
      // Suppress errors during unmount
    }
  }
}