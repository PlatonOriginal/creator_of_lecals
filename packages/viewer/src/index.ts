import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export interface BodyViewer {
  /** Sets a new mesh. Positions are in metres, y up. */
  setMesh(positions: Float32Array, indices: Uint32Array | Uint16Array): void
  /** Replaces vertex positions of the current mesh (same vertex count). */
  updatePositions(positions: Float32Array): void
  /** Average frame time over the last second, ms. */
  frameTime(): number
  dispose(): void
}

export function createBodyViewer(canvas: HTMLCanvasElement): BodyViewer {
  const renderer = new WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
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

  /** Puts the feet on the floor and frames the whole body. */
  function frame(first: boolean) {
    geometry.computeBoundingBox()
    const box = geometry.boundingBox!
    mesh.position.y = -box.min.y
    if (!first) return
    const h = box.max.y - box.min.y
    controls.target.set(0, h * 0.52, 0)
    const dist = (h * 0.62) / Math.tan(((camera.fov / 2) * Math.PI) / 180)
    camera.position.set(0, h * 0.55, dist)
    controls.update()
  }

  const geometry = new BufferGeometry()
  const material = new MeshStandardMaterial({ color: 0xd9b8a0, roughness: 0.7, metalness: 0 })
  const mesh = new Mesh(geometry, material)
  scene.add(mesh)

  let frames = 0
  let frameStart = performance.now()
  let lastFrameTime = 0
  let raf = 0

  function resize() {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false)
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop)
    resize()
    controls.update()
    renderer.render(scene, camera)
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
    frameTime: () => lastFrameTime,
    dispose() {
      cancelAnimationFrame(raf)
      controls.dispose()
      geometry.dispose()
      material.dispose()
      renderer.dispose()
    },
  }
}
