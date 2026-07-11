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
// Verified against @thatopen/fragments@3.4.6 dist/index.d.ts

interface FragmentsModelInternal {
  getLocalIds():                       Promise<number[]>
  getGuidsByLocalIds(ids: number[]):   Promise<(string | null)[]>
  getLocalIdsByGuids(guids: string[]): Promise<(number | null)[]>
  getMergedBox(localIds: number[]):    Promise<THREE.Box3>
  setVisible(localIds: number[] | undefined, visible: boolean): Promise<void>
  resetVisible(): Promise<void>

  // Per-item opacity — operates on GPU buffers within batched geometry,
  // completely independent of mesh.visible, setVisible(), and setColor().
  // undefined → all items. Verified in @thatopen/fragments@3.4.6 dist/index.d.ts line 1865.
  setOpacity(localIds: number[] | undefined, opacity: number): Promise<void>
  resetOpacity(localIds: number[] | undefined): Promise<void>

  raycast(params: {
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera
    mouse:  THREE.Vector2
    dom:    HTMLCanvasElement
  }): Promise<RaycastResult | null>

  tiles: {
    onItemSet:      { add: (cb: (e: { key: string | number; value: THREE.Mesh }) => void) => void }
    onBeforeDelete: { add: (cb: (e: { key: string | number; value: THREE.Mesh }) => void) => void }
  }
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
  private isIsolated = false

  // ── Wireframe state ───────────────────────────────────────
  //
  // WHY material.wireframe = true IS BANNED
  // ────────────────────────────────────────
  // That Open Engine v3.4.6 deletes geometry CPU arrays after the first GPU
  // upload. Three.js wireframe rendering reads geometry.index.array to build
  // line pairs — it crashes with "Cannot read 'length' of undefined" after
  // the first frame. LODMesh tiles use ShaderMaterial with no wireframe path.
  //
  // WHY mesh.visible = false IS WRONG FOR PER-ITEM CONTROL
  // ────────────────────────────────────────────────────────
  // Tiles are BATCHED. One THREE.Mesh tile contains many IFC items packed into
  // a single BufferGeometry. Per-item visibility, colour, and opacity are
  // controlled via GPU buffers managed by the engine's HighlightManager —
  // NOT by Three.js mesh.visible.
  //
  // When mesh.visible = false, Three.js skips the mesh entirely — the GPU
  // shader never runs. All per-item setOpacity/setColor/setVisible state
  // inside that mesh becomes unreachable. There is no way to show one item
  // from a hidden mesh.
  //
  // Furthermore, userData.itemIds on tiles is a Set of raw byte values from a
  // packed 4-byte per-vertex ID buffer, NOT a Set of IFC localIds. Comparing
  // localId 219 against this Set will never produce a match.
  //
  // CORRECT ARCHITECTURE — model.setOpacity()
  // ───────────────────────────────────────────
  // setOpacity(localIds, opacity) is the engine's own per-item opacity API.
  // It calls model.traverse(items, ...) and model.tiles.updateVirtualMeshes()
  // — a worker operation that writes opacity data for specific items within
  // shared batched geometry, completely independent of mesh.visible,
  // setVisible(), and setColor().
  //
  // WIREFRAME ON:
  //   • ALL tile meshes stay visible = true (shaders keep running)
  //   • model.setOpacity(undefined, 0) → all items become transparent (GPU-level)
  //   • LineSegments (EdgeGeometry) become visible → edges appear on dark bg
  //
  // SELECTION IN WIREFRAME:
  //   • model.resetOpacity(selectedLocalIds) → selected items restore full opacity
  //   • ColorManager.setColor() already applies #FF8C00 highlight (Effect 2 in IFCViewer)
  //   • Result: selected element appears as solid shaded highlighted mesh
  //
  // WIREFRAME OFF:
  //   • model.resetOpacity(undefined) → all items restore original opacity
  //   • LineSegments become hidden
  //
  // This approach never touches mesh.visible, never conflicts with setVisible()
  // (Zone/Isolate), never conflicts with setColor() (selection/simulation).

  private wireframeEnabled = false

  // tileKey → LineSegments: built once at tile-arrival, cached permanently.
  // mesh.visible is NEVER touched — tiles always remain visible=true.
  private wireframeLines = new Map<string | number, THREE.LineSegments>()

  // Tracks which localIds are currently opacity-restored (= "revealed" as shaded)
  // so we can re-hide them when selection changes.
  private revealedLocalIds = new Set<number>()

  // Shared LineBasicMaterial for all edge overlays — white on dark background.
  private readonly wireframeMaterial = new THREE.LineBasicMaterial({
    color:      0xFFFFFF,
    depthTest:  true,
    depthWrite: false,
  })

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
        this.hookModelTiles(model)
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

  // ── Wireframe: per-tile edge pre-building ─────────────────
  //
  // Registers two hooks on model.tiles:
  //   onItemSet      → builds EdgesGeometry + LineSegments while CPU arrays live
  //   onBeforeDelete → disposes the corresponding LineSegments
  //
  // IMPORTANT: mesh.visible is NEVER set here. Tile meshes always stay visible=true.
  // Wireframe "hiding" is achieved via model.setOpacity(undefined, 0), not mesh visibility.

  private hookModelTiles(model: FRAGS.FragmentsModel): void {
    const internal = model as unknown as FragmentsModelInternal

    internal.tiles.onItemSet.add(({ key, value: mesh }) => {
      this.buildTileEdges(key, mesh)
    })

    internal.tiles.onBeforeDelete.add(({ key }) => {
      this.disposeTileEdges(key)
    })
  }

  // ── Wireframe: build edges for one SHELL tile ─────────────
  //
  // Called synchronously inside tiles.onItemSet, before the first render frame.
  // At this point geometry.index.array and position.array are still live CPU TypedArrays.
  //
  // SHELL tiles: THREE.Mesh + non-instanced THREE.BufferGeometry + geometry.index
  // LOD tiles:   LODMesh + LODGeometry (InstancedBufferGeometry) → skipped
  //
  // The resulting LineSegments are added to the scene as siblings of model.object
  // and hidden by default. They are never affected by model.setOpacity() calls.

  private buildTileEdges(key: string | number, mesh: THREE.Mesh): void {
    try {
      const geo = mesh.geometry

      // Skip LOD/LINE tiles — LODGeometry is InstancedBufferGeometry
      if ((geo as THREE.InstancedBufferGeometry).isInstancedBufferGeometry) {
        return
      }

      if (!geo.index || !geo.index.array) {
        return
      }

      // Build EdgesGeometry from CPU arrays while they are still alive.
      // EdgesGeometry produces its own Float32 position buffer that is never deleted.
      const edges    = new THREE.EdgesGeometry(geo)
      const segments = new THREE.LineSegments(edges, this.wireframeMaterial)

      // Match tile transform.
      segments.matrix.copy(mesh.matrix)
      segments.matrixAutoUpdate = false

      // Hidden by default; shown when wireframe is activated.
      segments.visible = this.wireframeEnabled

      // Add as a sibling of model.object so LineSegments are unaffected by
      // model.setOpacity() calls and always render independently.
      this.world.scene.three.add(segments)
      this.wireframeLines.set(key, segments)

    } catch (err) {
      console.warn('[ViewerEngine] wireframe: buildTileEdges failed for tile', key, err)
    }
  }

  // ── Wireframe: dispose edges for one tile ─────────────────

  private disposeTileEdges(key: string | number): void {
    const segments = this.wireframeLines.get(key)
    if (segments) {
      try {
        this.world.scene.three.remove(segments)
        segments.geometry.dispose()
      } catch { /* suppress */ }
      this.wireframeLines.delete(key)
    }
  }

  // ── Wireframe toggle (public API) ─────────────────────────
  //
  // ON:
  //   • Show all edge LineSegments
  //   • Call model.setOpacity(undefined, 0) → all items transparent (GPU-level)
  //   • mesh.visible stays true — shaders keep running
  //
  // OFF:
  //   • Hide all edge LineSegments
  //   • Call model.resetOpacity(undefined) → all items restore original opacity
  //   • Clear revealedLocalIds

  setWireframe(enabled: boolean): void {
    if (this.wireframeEnabled === enabled) return
    this.wireframeEnabled = enabled

    // Toggle edge overlays
    for (const segments of this.wireframeLines.values()) {
      segments.visible = enabled
    }

    // Apply / remove opacity mask on all items across all models
    for (const model of this.loadedModels) {
      const internal = model as unknown as FragmentsModelInternal
      if (enabled) {
        // Make all items transparent — they become invisible at GPU level
        // while the tile mesh stays visible so shaders can still run per-item
        internal.setOpacity(undefined, 0).catch(err =>
          console.warn('[ViewerEngine] setWireframe: setOpacity failed', err)
        )
      } else {
        // Restore all items to their original opacity
        internal.resetOpacity(undefined).catch(err =>
          console.warn('[ViewerEngine] setWireframe: resetOpacity failed', err)
        )
      }
    }

    // Clear revealed set on any mode change
    this.revealedLocalIds.clear()

    console.log(
      `[ViewerEngine] setWireframe — ${enabled ? 'ON (edges only)' : 'OFF (shaded)'},`,
      `models: ${this.loadedModels.length}, edge overlays: ${this.wireframeLines.size}`
    )
  }

  // ── Wireframe selection reveal — called from handleClick (primary path) ──
  //
  // Applies opacity reveal to a set of localIds within the engine's own GPU
  // buffer system. Called synchronously from handleClick before onObjectPicked,
  // where the localId is already available from the raycast result.
  //
  // Steps:
  //   1. Re-hide previously revealed localIds (set opacity back to 0)
  //   2. Reveal newly selected localIds (resetOpacity restores original)
  //   3. Update revealedLocalIds tracking set
  //
  // ColorManager.setColor() (Effect 2 in IFCViewer) applies #FF8C00 highlight
  // independently — it operates on the same items but different GPU buffer.
  //
  // Does NOT affect:
  //   • setVisible/resetVisible (Zone/Isolate — different GPU buffer)
  //   • LineSegments visibility
  //   • mesh.visible (never touched)

  private applyWireframeReveal(nextLocalIds: Set<number>): void {
    if (!this.wireframeEnabled) return

    for (const model of this.loadedModels) {
      const internal = model as unknown as FragmentsModelInternal

      // Step 1: re-hide the previously revealed items (if any changed)
      const toHide = [...this.revealedLocalIds].filter(id => !nextLocalIds.has(id))
      if (toHide.length > 0) {
        console.log(`[ViewerEngine] Hiding previous mesh — localIds: [${toHide.join(', ')}]`)
        internal.setOpacity(toHide, 0).catch(err =>
          console.warn('[ViewerEngine] applyWireframeReveal: re-hide failed', err)
        )
      }

      // Step 2: reveal the newly selected items
      if (nextLocalIds.size > 0) {
        const toReveal = Array.from(nextLocalIds)
        console.log(`[ViewerEngine] Showing shaded mesh — localIds: [${toReveal.join(', ')}]`)
        // resetOpacity restores original opacity for these specific items
        internal.resetOpacity(toReveal).catch(err =>
          console.warn('[ViewerEngine] applyWireframeReveal: reveal failed', err)
        )
      }
    }

    // Step 3: update tracking
    this.revealedLocalIds = new Set(nextLocalIds)
    console.log(
      `[ViewerEngine] Renderer invalidated — revealed localIds: ${nextLocalIds.size},`,
      `wireframeEnabled: ${this.wireframeEnabled}`
    )
  }

  // ── Wireframe selection reveal — public API for programmatic selection ────
  //
  // Called by IFCViewer Effect 4 for selection changes from Gantt, Object Tree,
  // or any source other than a direct 3D click.
  //
  // Resolves GlobalIds → localIds (async), then delegates to applyWireframeReveal().

  async updateWireframeSelection(globalIds: string[]): Promise<void> {
    console.log(
      '[ViewerEngine] updateWireframeSelection —',
      `wireframeEnabled: ${this.wireframeEnabled},`,
      `globalIds: [${globalIds.slice(0, 3).join(', ')}${globalIds.length > 3 ? '…' : ''}]`
    )

    if (!this.wireframeEnabled) {
      console.log('[ViewerEngine] updateWireframeSelection: wireframe OFF — no-op')
      return
    }

    if (globalIds.length === 0) {
      console.log('[ViewerEngine] updateWireframeSelection: empty — clearing reveal')
      this.applyWireframeReveal(new Set())
      return
    }

    const allLocalIds = new Set<number>()
    await Promise.all(
      this.loadedModels.map(async (model) => {
        const internal = model as unknown as FragmentsModelInternal
        try {
          const resolved = await internal.getLocalIdsByGuids(globalIds)
          for (const id of resolved) {
            if (id !== null && id !== undefined) allLocalIds.add(id)
          }
        } catch (err) {
          console.warn('[ViewerEngine] updateWireframeSelection: resolution failed', err)
        }
      })
    )

    console.log(
      '[ViewerEngine] updateWireframeSelection — resolved',
      allLocalIds.size, 'localIds, applying reveal'
    )
    this.applyWireframeReveal(allLocalIds)
  }

  // ── Public getter for IFCViewer Effect 4 ──────────────────
  isWireframeEnabled(): boolean { return this.wireframeEnabled }

  // ── Unload ────────────────────────────────────────────────

  async unloadAll(): Promise<void> {
    this.isIsolated       = false
    this.wireframeEnabled = false
    this.revealedLocalIds.clear()

    for (const key of this.wireframeLines.keys()) {
      this.disposeTileEdges(key)
    }
    this.wireframeLines.clear()

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

      let localIds: (number | null)[] = []
      try {
        localIds = await internal.getLocalIdsByGuids([globalId])
      } catch (err) {
        console.warn('[ViewerEngine] zoomToObject: getLocalIdsByGuids failed', err)
        continue
      }

      const localId = localIds[0]
      if (localId === null || localId === undefined) {
        console.warn('[ViewerEngine] zoomToObject: GlobalId not found in model')
        continue
      }

      let box: THREE.Box3
      try {
        box = await internal.getMergedBox([localId])
      } catch {
        box = new THREE.Box3().setFromObject(model.object)
      }

      if (box.isEmpty()) {
        console.warn('[ViewerEngine] zoomToObject: bounding box is empty')
        return
      }

      try {
        await this.world.camera.controls.fitToBox(box, true, {
          paddingLeft:   0.5,
          paddingRight:  0.5,
          paddingTop:    0.5,
          paddingBottom: 0.5,
        })
      } catch (err) {
        console.warn('[ViewerEngine] zoomToObject: fitToBox failed', err)
      }

      return
    }
  }

  // ── Phase 3+: Isolate objects ─────────────────────────────

  async isolateObjects(globalIds: string[]): Promise<void> {
    console.log('[ViewerEngine] isolateObjects —', globalIds.length, 'GlobalIds')

    if (!this.fragmentsManager?.initialized) return
    if (this.loadedModels.length === 0) return

    if (globalIds.length === 0) {
      await this.restoreVisibility()
      return
    }

    this.isIsolated = true

    await Promise.all(
      this.loadedModels.map(async (model) => {
        const internal = model as unknown as FragmentsModelInternal
        let targetLocalIds: (number | null)[] = []
        try {
          targetLocalIds = await internal.getLocalIdsByGuids(globalIds)
        } catch { return }

        const targetSet = new Set<number>(
          targetLocalIds.filter((id): id is number => id !== null && id !== undefined)
        )
        if (targetSet.size === 0) return

        try {
          await internal.setVisible(undefined, false)
          await internal.setVisible(Array.from(targetSet), true)
        } catch (err) {
          console.warn('[ViewerEngine] isolateObjects: setVisible failed', err)
        }
      })
    )
  }

  // ── Phase 3: Layer-filter visibility ─────────────────────

  async hideObjects(globalIds: string[]): Promise<void> {
    if (globalIds.length === 0 || !this.fragmentsManager?.initialized) return
    await Promise.all(
      this.loadedModels.map(async (model) => {
        const internal = model as unknown as FragmentsModelInternal
        try {
          const localIds = await internal.getLocalIdsByGuids(globalIds)
          const valid    = localIds.filter((id): id is number => id !== null && id !== undefined)
          if (valid.length > 0) await internal.setVisible(valid, false)
        } catch { /* suppress */ }
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
          if (valid.length > 0) await internal.setVisible(valid, true)
        } catch { /* suppress */ }
      })
    )
  }

  async restoreVisibility(): Promise<void> {
    if (!this.fragmentsManager?.initialized) return
    await Promise.all(
      this.loadedModels.map(async (model) => {
        const internal = model as unknown as FragmentsModelInternal
        try {
          await internal.resetVisible()
        } catch { /* suppress */ }
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
      const box = new THREE.Box3().setFromObject(model.object)
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
        .filter((c): c is THREE.DirectionalLight => c instanceof THREE.DirectionalLight && c.castShadow)
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
        paddingLeft: 0.1, paddingRight: 0.1, paddingTop: 0.1, paddingBottom: 0.1,
      })
    } catch (err) {
      console.warn('[ViewerEngine] fitCameraToModel failed:', err)
    }
  }

  // ── Camera view switching ─────────────────────────────────

  private getSceneBoundingBox(): THREE.Box3 {
    const box = new THREE.Box3()
    for (const model of this.loadedModels) {
      const modelBox = new THREE.Box3().setFromObject(model.object)
      if (!modelBox.isEmpty()) box.union(modelBox)
    }
    if (box.isEmpty()) box.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 5, 5))
    return box
  }

  async setCameraPerspective(): Promise<void> {
    try {
      const box    = this.getSceneBoundingBox()
      const center = new THREE.Vector3()
      const size   = new THREE.Vector3()
      box.getCenter(center)
      box.getSize(size)
      const offset = Math.max(size.x, size.y, size.z) * 1.2
      await this.world.camera.controls.setLookAt(
        center.x + offset, center.y + offset, center.z + offset,
        center.x, center.y, center.z, true
      )
    } catch (err) { console.warn('[ViewerEngine] setCameraPerspective failed:', err) }
  }

  async setCameraTop(): Promise<void> {
    try {
      const box    = this.getSceneBoundingBox()
      const center = new THREE.Vector3()
      const size   = new THREE.Vector3()
      box.getCenter(center)
      box.getSize(size)
      const height = center.y + Math.max(size.x, size.z) * 1.5 + size.y
      await this.world.camera.controls.setLookAt(
        center.x, height, center.z + 0.001,
        center.x, center.y, center.z, true
      )
      await this.world.camera.controls.fitToBox(box, true, {
        paddingLeft: 0.1, paddingRight: 0.1, paddingTop: 0.1, paddingBottom: 0.1,
      })
    } catch (err) { console.warn('[ViewerEngine] setCameraTop failed:', err) }
  }

  async setCameraFront(): Promise<void> {
    try {
      const box    = this.getSceneBoundingBox()
      const center = new THREE.Vector3()
      const size   = new THREE.Vector3()
      box.getCenter(center)
      box.getSize(size)
      const distance = Math.max(size.x, size.y, size.z) * 1.5 + size.z * 0.5
      await this.world.camera.controls.setLookAt(
        center.x, center.y, center.z + distance,
        center.x, center.y, center.z, true
      )
      await this.world.camera.controls.fitToBox(box, true, {
        paddingLeft: 0.1, paddingRight: 0.1, paddingTop: 0.1, paddingBottom: 0.1,
      })
    } catch (err) { console.warn('[ViewerEngine] setCameraFront failed:', err) }
  }

  // ── Click handler ─────────────────────────────────────────
  //
  // PRIMARY PATH for wireframe selection reveal.
  //
  // The raycast result contains the clicked localId directly. We call
  // applyWireframeReveal() synchronously here — before onObjectPicked fires
  // the React store update — so the mesh reveal happens in the same microtask.
  //
  // This bypasses all React scheduling, store reads, and Effect timing.

  private handleClick = async (e: MouseEvent): Promise<void> => {
    if (!this.world || !this.fragmentsManager?.initialized) return
    if (this.loadedModels.length === 0) return

    const isMulti    = e.ctrlKey || e.metaKey
    const domElement = this.world.renderer?.three?.domElement
    if (!domElement) return

    const mouse = new THREE.Vector2(e.clientX, e.clientY)

    try {
      const candidates: Array<{ globalId: string; distance: number; localId: number }> = []

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

          candidates.push({ globalId, distance: result.distance ?? Infinity, localId: result.localId })
        })
      )

      if (candidates.length === 0) {
        // Click on empty space
        if (this.wireframeEnabled) {
          console.log('[ViewerEngine] Wireframe selection update — clearing (no hit)')
          this.applyWireframeReveal(new Set())
        }
        this.config.onObjectPicked(null, false)
        return
      }

      candidates.sort((a, b) => a.distance - b.distance)
      const winner = candidates[0]

      if (this.wireframeEnabled) {
        // Build the next revealed set
        let nextIds: Set<number>
        if (isMulti) {
          nextIds = new Set(this.revealedLocalIds)
          if (nextIds.has(winner.localId)) nextIds.delete(winner.localId)
          else                              nextIds.add(winner.localId)
        } else {
          nextIds = new Set([winner.localId])
        }

        console.log(
          '[ViewerEngine] Wireframe selection update',
          `\n  Current selected GlobalId: ${winner.globalId}`,
          `\n  Current localId: ${winner.localId}`,
          `\n  Previous revealed localIds: [${[...this.revealedLocalIds].join(', ')}]`,
          `\n  Next revealed localIds: [${[...nextIds].join(', ')}]`,
          `\n  Wireframe enabled: ${this.wireframeEnabled}`
        )

        this.applyWireframeReveal(nextIds)
      }

      this.config.onObjectPicked(winner.globalId, isMulti)

    } catch {
      this.config.onObjectPicked(null, false)
    }
  }

  // ── Selection label support ───────────────────────────────

  async getObjectWorldTop(globalId: string): Promise<THREE.Vector3 | null> {
    if (!this.fragmentsManager?.initialized) return null
    if (this.loadedModels.length === 0) return null

    for (const model of this.loadedModels) {
      const internal = model as unknown as FragmentsModelInternal
      let localIds: (number | null)[] = []
      try {
        localIds = await internal.getLocalIdsByGuids([globalId])
      } catch { continue }

      const localId = localIds[0]
      if (localId === null || localId === undefined) continue

      let box: THREE.Box3
      try {
        box = await internal.getMergedBox([localId])
      } catch {
        box = new THREE.Box3().setFromObject(model.object)
      }

      if (box.isEmpty()) return null

      const center = new THREE.Vector3()
      box.getCenter(center)
      return new THREE.Vector3(center.x, box.max.y, center.z)
    }

    return null
  }

  getCamera(): THREE.PerspectiveCamera | null {
    if (!this.world?.camera?.three) return null
    return this.world.camera.three as THREE.PerspectiveCamera
  }

  getContainerElement(): HTMLDivElement { return this.config.container }

  // ── Getters ───────────────────────────────────────────────

  getScene(): THREE.Scene     { return this.world.scene.three }
  getFragmentsManager()       { return this.fragmentsManager }
  getLoadedModels()           { return this.loadedModels }

  // ── Dispose ───────────────────────────────────────────────

  dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    try {
      for (const key of this.wireframeLines.keys()) {
        this.disposeTileEdges(key)
      }
      this.wireframeLines.clear()
      this.wireframeMaterial.dispose()
      this.ro?.disconnect()
      this.config.container.removeEventListener('click', this.handleClick)
      this.components.dispose()
    } catch { /* suppress */ }
  }
}