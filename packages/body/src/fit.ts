import type { AnnyBody, LocalChanges, Phenotypes } from './anny'
import { type BodyMeasures, findLevels, measureBody, verticalExtent } from './measure'

/** What the mannequin is fitted to, millimetres. Missing girths are left as the model has them. */
export interface FitTarget {
  height: number
  bust?: number
  waist?: number
  hips?: number
}

export interface FitResult {
  phenotypes: Phenotypes
  local: LocalChanges
  /** Uniform scale applied after the shape so the height matches exactly. */
  scale: number
  /** Measured on the fitted mannequin (after scaling), mm. */
  measured: BodyMeasures
  /** Number of shape evaluations and time spent, for the stats panel. */
  evaluations: number
  ms: number
}

export const FEMALE_BASE: Phenotypes = {
  gender: 1,
  age: 0.72,
  height: 0.45,
  weight: 0.5,
  muscle: 0.45,
  proportions: 0.5,
  cupsize: 0.5,
  firmness: 0.5,
}

const GIRTHS = ['bust', 'waist', 'hips'] as const
const LOCAL: Record<(typeof GIRTHS)[number], string> = {
  bust: 'measure-bust-circ-incr',
  waist: 'measure-waist-circ-incr',
  hips: 'measure-hips-circ-incr',
}

/**
 * Simple fit of the Anny body to the leading measurements (stage M1 link,
 * M4 will refine it with more measurements):
 * 1. the height phenotype by bisection, so the body is about the right height;
 * 2. the weight phenotype by bisection, so the girths are about right on average;
 * 3. the local bust, waist and hip girth changes, a few rounds of secant steps;
 * 4. a uniform scale that makes the height exact.
 * Girths are measured like a tape: convex hull of the torso cross-section.
 */
export function fitBody(body: AnnyBody, target: FitTarget, base: Phenotypes = FEMALE_BASE): FitResult {
  const t0 = performance.now()
  const buf = new Float32Array(body.vertexCount * 3)
  let evaluations = 0
  const phen: Phenotypes = { ...base }
  const local: LocalChanges = {}
  const shape = () => {
    evaluations++
    body.restVertices(phen, local, buf)
    return { vertices: buf, faces: body.faces }
  }
  const heightNow = () => {
    const { minY, maxY } = verticalExtent(shape().vertices)
    return (maxY - minY) * 1000
  }
  const measure = () => {
    const mesh = shape()
    return measureBody(mesh, findLevels(mesh))
  }

  // 1. Height phenotype (girths below are compared at the target height).
  phen.height = bisect((h) => ((phen.height = h), heightNow() - target.height), 0, 1, 14)

  const girths = GIRTHS.filter((k) => target[k] !== undefined)
  const scaleNow = () => target.height / heightNow()

  // 2. Weight: mean relative girth error to zero.
  if (girths.length) {
    phen.weight = bisect(
      (w) => {
        phen.weight = w
        const m = measure()
        const s = target.height / m.height
        return girths.reduce((acc, k) => acc + (m[k] * s) / target[k]! - 1, 0)
      },
      0,
      1,
      10,
    )
  }

  // 3. Local girth changes, coordinate secant steps.
  for (let round = 0; round < 3; round++) {
    for (const k of girths) {
      const key = LOCAL[k]
      const err = (x: number) => {
        local[key] = x
        const m = measure()
        return (m[k] * target.height) / m.height - target[k]!
      }
      let x0 = local[key] ?? 0
      let e0 = err(x0)
      let best = { x: x0, e: e0 }
      if (Math.abs(e0) < 2) continue
      let x1 = clamp(x0 - Math.sign(e0) * 0.1)
      let e1 = err(x1)
      for (let i = 0; i < 5 && Math.abs(e1) >= 2 && e1 !== e0; i++) {
        if (Math.abs(e1) < Math.abs(best.e)) best = { x: x1, e: e1 }
        // Secant step, at most 0.5 at a time: the response is far from linear.
        const step = Math.max(-0.5, Math.min(0.5, (-e1 * (x1 - x0)) / (e1 - e0)))
        x0 = x1
        e0 = e1
        x1 = clamp(x1 + step)
        e1 = err(x1)
      }
      if (Math.abs(e1) < Math.abs(best.e)) best = { x: x1, e: e1 }
      local[key] = best.x
    }
  }

  // 4. Exact height by scaling.
  const scale = scaleNow()
  const m = measure()
  const measured: BodyMeasures = {
    height: m.height * scale,
    bust: m.bust * scale,
    waist: m.waist * scale,
    hips: m.hips * scale,
  }
  return { phenotypes: { ...phen }, local: { ...local }, scale, measured, evaluations, ms: performance.now() - t0 }
}

// Local changes are extrapolated past 1 for large figures: the weight phenotype tops out first.
const clamp = (x: number) => Math.min(2.5, Math.max(-1, x))

/** Root of an increasing function on [lo, hi]; returns the nearest end if there is none. */
function bisect(f: (x: number) => number, lo: number, hi: number, steps: number): number {
  if (f(lo) >= 0) return lo
  if (f(hi) <= 0) return hi
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) < 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}
