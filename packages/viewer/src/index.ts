import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  DoubleSide,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'

export type ViewName = 'front' | 'side' | 'back' | 'top' | 'bottom'

export interface ViewerBand {
  /** Closed loop, metres in body coordinates (same as the mesh). */
  points: [number, number, number][]
  color: string
  label?: string
  labelAt?: [number, number, number]
}

export interface ViewerShell {
  positions: Float32Array
  /** RGB 0…1 per vertex. */
  colors: Float32Array
  indices: Uint32Array
  /** Open lines (the hem, ends of sleeves). */
  edges?: [number, number, number][][]
}

export interface BodyViewer {
  /** Sets a new mesh. Positions are in metres, y up. */
  setMesh(positions: Float32Array, indices: Uint32Array | Uint16Array): void
  /** Replaces vertex positions of the current mesh (same vertex count). */
  updatePositions(positions: Float32Array): void
  /** The translucent garment shell, or null to remove it. */
  setShell(shell: ViewerShell | null): void
  /** New positions for the current shell (same vertices), e.g. from a cloth simulation; the hem lines show only on the original shape. */
  updateShell(positions: Float32Array, original?: boolean): void
  setShellVisible(visible: boolean): void
  /** Lines round the body (girth lines, the bands of the ease map) with labels. */
  setBands(bands: ViewerBand[]): void
  setLabelsVisible(visible: boolean): void
  /**
   * Camera to a standard view: the whole figure, or zoomed on the upper
   * ('top') or lower ('bottom') half, seen from the front.
   */
  setView(view: ViewName): void
  /** Average frame time over the last second, ms. */
  frameTime(): number
  dispose(): void
}

export function createBodyViewer(canvas: HTMLCanvasElement): BodyViewer {
  const renderer = new WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  // Labels are HTML on top of the canvas (the parent is position: relative).
  const labels = new CSS2DRenderer()
  labels.domElement.className = 'labels'
  canvas.parentElement?.appendChild(labels.domElement)

  const scene = new Scene()
  scene.background = new Color(0xf3f1ee)
  const camera = new PerspectiveCamera(35, 1, 0.05, 50)
  camera.position.set(0, 1.0, 3.6)
  const controls = new OrbitControls(camera, canvas)
  controls.target.set(0, 0.9, 0)
  controls.enableDamping = true
  controls.update()

  scene.add(new AmbientLight(0xffffff, 0.9))
  const key = new DirectionalLight(0xffffff, 1.6)
  key.position.set(2, 3, 2)
  scene.add(key)
  const back = new DirectionalLight(0xffffff, 0.6)
  back.position.set(-2, 2, -2)
  scene.add(back)
  const grid = new GridHelper(2, 20, 0xbbbbbb, 0xdddddd)
  scene.add(grid)

  const geometry = new BufferGeometry()
  const material = new MeshStandardMaterial({ color: 0xd9b8a0, roughness: 0.7, metalness: 0 })
  const mesh = new Mesh(geometry, material)
  scene.add(mesh)
  // Shell and bands hang on the body, so they move with it onto the floor.
  const extras = new Group()
  mesh.add(extras)
  const shellGroup = new Group()
  const bandGroup = new Group()
  extras.add(shellGroup, bandGroup)
  let bodyHeight = 1.7

  /** Puts the feet on the floor and frames the whole body. */
  function frame(first: boolean) {
    geometry.computeBoundingBox()
    const box = geometry.boundingBox!
    mesh.position.y = -box.min.y
    bodyHeight = box.max.y - box.min.y
    if (first) setView('front')
  }

  function setView(view: ViewName) {
    const h = bodyHeight
    const fov = (camera.fov / 2) * (Math.PI / 180)
    const full = (h * 0.62) / Math.tan(fov)
    const half = (h * 0.34) / Math.tan(fov)
    const dir: Record<ViewName, [number, number]> = {
      front: [0, 1],
      side: [1, 0],
      back: [0, -1],
      top: [0, 1],
      bottom: [0, 1],
    }
    const [dx, dz] = dir[view]
    const ty = view === 'top' ? h * 0.75 : view === 'bottom' ? h * 0.3 : h * 0.52
    const d = view === 'top' || view === 'bottom' ? half : full
    controls.target.set(0, ty, 0)
    camera.position.set(dx * d, ty + h * 0.03, dz * d)
    controls.update()
  }

  function clear(g: Group) {
    for (const c of [...g.children]) {
      g.remove(c)
      c.traverse((o) => {
        if (o instanceof Mesh || o instanceof Line) {
          o.geometry.dispose()
          ;(o.material as { dispose(): void }).dispose()
        }
        if (o instanceof CSS2DObject) o.element.remove()
      })
    }
  }

  let frames = 0
  let frameStart = performance.now()
  let lastFrameTime = 0
  let raf = 0

  // Own record of the size: the canvas may come already sized from an
  // earlier viewer (React mounts effects twice in development).
  let lastW = -1
  let lastH = -1
  function resize() {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w !== lastW || h !== lastH) {
      lastW = w
      lastH = h
      renderer.setSize(w, h, false)
      labels.setSize(w, h)
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop)
    resize()
    controls.update()
    renderer.render(scene, camera)
    labels.render(scene, camera)
    frames++
    const now = performance.now()
    if (now - frameStart >= 1000) {
      lastFrameTime = (now - frameStart) / frames
      frames = 0
      frameStart = now
    }
  }
  loop()

  return {
    setMesh(positions, indices) {
      geometry.setAttribute('position', new BufferAttribute(positions, 3))
      geometry.setIndex(new BufferAttribute(indices, 1))
      geometry.computeVertexNormals()
      geometry.computeBoundingSphere()
      frame(true)
    },
    updatePositions(positions) {
      const attr = geometry.getAttribute('position') as BufferAttribute
      ;(attr.array as Float32Array).set(positions)
      attr.needsUpdate = true
      geometry.computeVertexNormals()
      geometry.computeBoundingSphere()
      frame(false)
    },
    setShell(shell) {
      clear(shellGroup)
      if (!shell) return
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(shell.positions.slice(), 3))
      g.setAttribute('color', new BufferAttribute(shell.colors, 3))
      g.setIndex(new BufferAttribute(shell.indices, 1))
      g.computeVertexNormals()
      const m = new MeshStandardMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.45,
        side: DoubleSide,
        depthWrite: false,
        roughness: 0.9,
      })
      const sm = new Mesh(g, m)
      // Drawn after the body, so the body shows through.
      sm.renderOrder = 1
      shellGroup.add(sm)
      for (const e of shell.edges ?? []) {
        if (e.length < 2) continue
        const lg = new BufferGeometry().setFromPoints([...e, e[0]!].map((p) => new Vector3(...p)))
        shellGroup.add(new Line(lg, new LineBasicMaterial({ color: 0x333333 })))
      }
    },
    updateShell(positions, original = false) {
      const sm = shellGroup.children.find((c): c is Mesh => c instanceof Mesh)
      if (!sm) return
      for (const c of shellGroup.children) if (c instanceof Line) c.visible = original
      const attr = sm.geometry.getAttribute('position') as BufferAttribute
      ;(attr.array as Float32Array).set(positions)
      attr.needsUpdate = true
      sm.geometry.computeVertexNormals()
      sm.geometry.computeBoundingSphere()
    },
    setShellVisible(visible) {
      shellGroup.visible = visible
    },
    setBands(bands) {
      clear(bandGroup)
      for (const b of bands) {
        if (b.points.length < 3) continue
        const curve = new CatmullRomCurve3(
          b.points.map((p) => new Vector3(...p)),
          true,
        )
        const tube = new Mesh(
          new TubeGeometry(curve, Math.max(32, b.points.length * 2), 0.0035, 6, true),
          new MeshBasicMaterial({ color: new Color(b.color) }),
        )
        tube.renderOrder = 2
        bandGroup.add(tube)
        if (b.label) {
          const el = document.createElement('div')
          el.className = 'band-label'
          el.textContent = b.label
          el.style.borderColor = b.color
          const obj = new CSS2DObject(el)
          const at = b.labelAt ?? b.points[0]!
          obj.position.set(at[0], at[1], at[2] + 0.02)
          bandGroup.add(obj)
        }
      }
    },
    setLabelsVisible(visible) {
      labels.domElement.style.display = visible ? '' : 'none'
    },
    setView,
    frameTime: () => lastFrameTime,
    dispose() {
      cancelAnimationFrame(raf)
      controls.dispose()
      clear(shellGroup)
      clear(bandGroup)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      labels.domElement.remove()
    },
  }
}
