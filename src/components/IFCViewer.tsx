import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useBIMStore } from '../state/bimStore'

const STATUS_COLORS = {
  future:    0xB0B0B0,
  active:    0x2F6BFF,
  completed: 0x2ECC71,
  selected:  0xFFD700,
}

type GeomSpec = { w: number; h: number; d: number }

function geomForType(type: string): GeomSpec {
  switch (type) {
    case 'IfcWall':         return { w: 0.2,  h: 3.0, d: 4.0 }
    case 'IfcSlab':         return { w: 4.0,  h: 0.2, d: 4.0 }
    case 'IfcColumn':       return { w: 0.4,  h: 4.0, d: 0.4 }
    case 'IfcBeam':         return { w: 4.0,  h: 0.35, d: 0.35 }
    case 'IfcStair':        return { w: 1.8,  h: 2.0, d: 2.0 }
    case 'IfcFlowSegment':  return { w: 0.25, h: 0.25, d: 3.0 }
    case 'IfcCurtainWall':  return { w: 0.15, h: 3.5, d: 5.0 }
    case 'IfcCovering':     return { w: 3.5,  h: 0.1, d: 3.5 }
    default:                return { w: 1.0,  h: 1.0, d: 1.0 }
  }
}

const POSITIONS: [number, number, number][] = [
  [-6, 0, -4], [0, 0, -4], [6, 0, -4],
  [-6, 0,  0], [0, 0,  0], [6, 0,  0],
  [-6, 0,  4], [0, 0,  4], [6, 0,  4],
  [-3, 0,  8], [3, 0,  8], [0, 0, -9],
]

export default function IFCViewer() {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef     = useRef<THREE.Scene | null>(null)
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef  = useRef<OrbitControls | null>(null)
  const meshMapRef   = useRef<Map<string, THREE.Mesh>>(new Map())
  const frameRef     = useRef<number>(0)

  const elements         = useBIMStore(s => s.ifcElements)
  const selectedIFCId    = useBIMStore(s => s.selectedIFCId)
  const timelineProgress = useBIMStore(s => s.timelineProgress)
  const getElementStatus = useBIMStore(s => s.getElementStatus)
  const setSelectedIFCId = useBIMStore(s => s.setSelectedIFCId)

  // ── init scene ──────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const W = container.clientWidth
    const H = container.clientHeight

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.setClearColor(0x070B0F)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Scene
    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x070B0F, 40, 80)
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 200)
    camera.position.set(12, 14, 18)
    cameraRef.current = camera

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.07
    controls.minDistance = 5
    controls.maxDistance = 60
    controlsRef.current = controls

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambient)

    const sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.position.set(10, 20, 10)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 0.5
    sun.shadow.camera.far = 100
    sun.shadow.camera.left = -20
    sun.shadow.camera.right = 20
    sun.shadow.camera.top = 20
    sun.shadow.camera.bottom = -20
    scene.add(sun)

    const fill = new THREE.DirectionalLight(0x4466ff, 0.3)
    fill.position.set(-10, 5, -10)
    scene.add(fill)

    // Grid
    const grid = new THREE.GridHelper(50, 50, 0x1C2128, 0x1C2128)
    scene.add(grid)

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(50, 50)
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x0D1117 })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.01
    ground.receiveShadow = true
    scene.add(ground)

    // Build meshes for each IFC element
    elements.forEach((el, idx) => {
      const { w, h, d } = geomForType(el.type)
      const geo = new THREE.BoxGeometry(w, h, d)
      const mat = new THREE.MeshLambertMaterial({ color: STATUS_COLORS.future })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.castShadow = true
      mesh.receiveShadow = true

      const pos = POSITIONS[idx] ?? [idx * 3 - 6, 0, 0]
      mesh.position.set(pos[0], h / 2, pos[2])
      mesh.userData.globalId = el.globalId

      scene.add(mesh)
      meshMapRef.current.set(el.globalId, mesh)
    })

    // Edge outlines
    meshMapRef.current.forEach((mesh) => {
      const edges = new THREE.EdgesGeometry(mesh.geometry)
      const lineMat = new THREE.LineBasicMaterial({ color: 0x30363D, transparent: true, opacity: 0.6 })
      const lines = new THREE.LineSegments(edges, lineMat)
      mesh.add(lines)
    })

    // Resize observer
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    })
    ro.observe(container)

    // Render loop
    function animate() {
      frameRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frameRef.current)
      ro.disconnect()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── update colors on progress / selection change ────────
  useEffect(() => {
    meshMapRef.current.forEach((mesh, globalId) => {
      const mat = mesh.material as THREE.MeshLambertMaterial
      if (globalId === selectedIFCId) {
        mat.color.setHex(STATUS_COLORS.selected)
        mat.emissive.setHex(0x443300)
      } else {
        const status = getElementStatus(globalId)
        mat.color.setHex(STATUS_COLORS[status])
        mat.emissive.setHex(0x000000)
      }
      mat.needsUpdate = true
    })
  }, [selectedIFCId, timelineProgress, getElementStatus])

  // ── click handler ────────────────────────────────────────
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current
    const renderer  = rendererRef.current
    const camera    = cameraRef.current
    const scene     = sceneRef.current
    if (!container || !renderer || !camera || !scene) return

    const rect   = container.getBoundingClientRect()
    const mouse  = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, camera)

    const meshes = Array.from(meshMapRef.current.values())
    const hits   = raycaster.intersectObjects(meshes, false)

    if (hits.length > 0) {
      const globalId = hits[0].object.userData.globalId as string
      setSelectedIFCId(globalId)
    } else {
      setSelectedIFCId(null)
    }
  }, [setSelectedIFCId])

  // ── status counts for stats overlay ─────────────────────
  const counts = { completed: 0, active: 0, future: 0 }
  elements.forEach(el => { counts[getElementStatus(el.globalId)]++ })

  return (
    <div className="viewer-container" ref={containerRef} onClick={handleClick}>
      {/* Stats overlay */}
      <div className="viewer-stats">
        <div className="viewer-stats__row">
          <span>Total Elements</span>
          <span className="viewer-stats__val">{elements.length}</span>
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

      {/* Legend overlay */}
      <div className="viewer-legend">
        <div className="viewer-legend__title">Element Status</div>
        <div className="legend-item">
          <div className="legend-swatch" style={{ background: '#2ECC71' }} />
          Completed
        </div>
        <div className="legend-item">
          <div className="legend-swatch" style={{ background: '#2F6BFF' }} />
          Active / In-Progress
        </div>
        <div className="legend-item">
          <div className="legend-swatch" style={{ background: '#B0B0B0' }} />
          Upcoming
        </div>
        <div className="legend-item">
          <div className="legend-swatch" style={{ background: '#FFD700' }} />
          Selected
        </div>
      </div>
    </div>
  )
}
