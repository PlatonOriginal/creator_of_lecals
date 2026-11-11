/**
 * Spike of stage M4: a simple cloth simulation (position-based dynamics)
 * of the skirt part of the shell, to see whether a phone can drape a
 * garment at an interactive rate. Not a feature yet.
 *
 * The particles are the vertices of the shell's skirt rings: the shell is
 * already cut to the size of the garment, so the rest lengths are the
 * lengths of the pattern. Rows down to the hip line hang on the body
 * (pinned); the rest fall under gravity and fold, kept outside the body by
 * the body's tape line at each row (a radius at each angle).
 */
import type { ClothGrid } from './shell'

export interface ClothStats {
  particles: number
  constraints: number
  /** Mean time of one step (all iterations), ms. */
  stepMs: number
  steps: number
}

interface Constraint {
  a: number
  b: number
  rest: number
  /** 1: stretch (stiff); less for bending; 2: a tether (only pulls, never pushes). */
  k: number
}

export class SkirtCloth {
  readonly grid: ClothGrid
  readonly pos: Float32Array
  private readonly prev: Float32Array
  private readonly cons: Constraint[] = []
  private readonly n: number
  private totalMs = 0
  private stepCount = 0
  iterations: number

  /** `positions`: the shell's positions (the grid is at its start); they are moved in place. */
  constructor(positions: Float32Array, grid: ClothGrid, iterations = 8) {
    this.grid = grid
    this.iterations = iterations
    this.n = grid.rows * grid.cols
    this.pos = positions
    this.prev = positions.slice(0, this.n * 3)
    const { rows, cols } = grid
    const id = (r: number, c: number) => r * cols + ((c + cols) % cols)
    const add = (a: number, b: number, k: number) => {
      const d = Math.hypot(this.pos[a * 3]! - this.pos[b * 3]!, this.pos[a * 3 + 1]! - this.pos[b * 3 + 1]!, this.pos[a * 3 + 2]! - this.pos[b * 3 + 2]!)
      this.cons.push({ a, b, rest: d, k })
    }
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        add(id(r, c), id(r, c + 1), 1)
        if (r + 1 < rows) {
          add(id(r, c), id(r + 1, c), 1)
          add(id(r, c), id(r + 1, c + 1), 0.5)
          add(id(r, c + 1), id(r + 1, c), 0.5)
        }
        // Bending: every second particle, soft.
        if (r + 2 < rows) add(id(r, c), id(r + 2, c), 0.1)
        add(id(r, c), id(r, c + 2), 0.05)
      }
    // Tethers: no particle gets further from the hip line (straight down its
    // column) than it is now. They stop the cloth stretching under gravity,
    // which a few iterations of the short constraints cannot.
    for (let r = grid.pinned; r < rows; r++) for (let c = 0; c < cols; c++) add(id(grid.pinned - 1, c), id(r, c), 2)
    // A tiny nudge so the folds can start (a perfect cone stays a cone).
    for (let r = grid.pinned; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const i = id(r, c) * 3
        const s = 0.002 * Math.sin(c * 2.399 + r)
        this.pos[i]! += s
        this.pos[i + 2]! += s
      }
  }

  step(dt = 1 / 60) {
    const t0 = performance.now()
    const { rows, cols, pinned } = this.grid
    const p = this.pos
    const q = this.prev
    const g = -9.81 * dt * dt
    const damping = 0.985
    const first = pinned * cols
    // Verlet: move by the velocity and gravity.
    for (let i = first; i < this.n; i++) {
      for (let a = 0; a < 3; a++) {
        const j = i * 3 + a
        const v = (p[j]! - q[j]!) * damping
        q[j] = p[j]!
        p[j]! += v + (a === 1 ? g : 0)
      }
    }
    for (let it = 0; it < this.iterations; it++) {
      for (const c of this.cons) {
        const a = c.a * 3
        const b = c.b * 3
        const dx = p[b]! - p[a]!
        const dy = p[b + 1]! - p[a + 1]!
        const dz = p[b + 2]! - p[a + 2]!
        const d = Math.hypot(dx, dy, dz)
        if (d < 1e-9) continue
        // Cloth does not resist being squeezed much: bending only pushes apart softly.
        let diff = (d - c.rest) / d
        if (c.k === 2) {
          if (diff <= 0) continue
        } else if (c.k < 1 && diff < 0) diff *= 0.3
        const wa = c.a < first ? 0 : 1
        const wb = c.b < first ? 0 : 1
        if (wa + wb === 0) continue
        const s = (Math.min(1, c.k) * diff) / (wa + wb)
        p[a]! += dx * s * wa
        p[a + 1]! += dy * s * wa
        p[a + 2]! += dz * s * wa
        p[b]! -= dx * s * wb
        p[b + 1]! -= dy * s * wb
        p[b + 2]! -= dz * s * wb
      }
      this.collide(first)
    }
    this.totalMs += performance.now() - t0
    this.stepCount++
    void rows
  }

  /** Keeps the particles outside the body: the tape line of the nearest row, by angle. */
  private collide(first: number) {
    const { body, cols } = this.grid
    const p = this.pos
    const y0 = body[0]!.y
    const dy = body.length > 1 ? (body[body.length - 1]!.y - y0) / (body.length - 1) : -1
    for (let i = first; i < this.n; i++) {
      const y = p[i * 3 + 1]!
      const row = body[Math.min(body.length - 1, Math.max(0, Math.round((y - y0) / dy)))]!
      const x = p[i * 3]! - row.c[0]
      const z = p[i * 3 + 2]! - row.c[1]
      const r = Math.hypot(x, z)
      let t = Math.atan2(z, x)
      if (t < 0) t += 2 * Math.PI
      const k = Math.round((t / (2 * Math.PI)) * cols) % cols
      const min = row.r[k]! + 0.004
      if (r < min && r > 1e-6) {
        p[i * 3] = row.c[0] + (x / r) * min
        p[i * 3 + 2] = row.c[1] + (z / r) * min
      }
    }
  }

  stats(): ClothStats {
    return {
      particles: this.n - this.grid.pinned * this.grid.cols,
      constraints: this.cons.length,
      stepMs: this.stepCount ? this.totalMs / this.stepCount : 0,
      steps: this.stepCount,
    }
  }
}
