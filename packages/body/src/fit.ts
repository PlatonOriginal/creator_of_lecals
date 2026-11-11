import type { AnnyBody, LocalChanges, Phenotypes } from './anny'
import {
  type BodyRegions,
  type FullMeasures,
  backLengthAlongSpine,
  bodyLandmarks,
  bodyRegions,
  findShoulderPoint,
  horizontalRing,
  limbRing,
  thighRing,
} from './landmarks'
import { type BodyLevels, type MeshLike, findLevels, indexMesh, torsoGirth, verticalExtent } from './measure'
import { len3, sub3 } from './plane'

/** What the mannequin is fitted to, millimetres. Missing values are left as the model has them. */
export interface FitTarget {
  height: number
  bust?: number
  waist?: number
  hips?: number
  underbust?: number
  neck?: number
  upperArm?: number
  thigh?: number
  shoulderLength?: number
  backLength?: number
  waistToHips?: number
}

export type FitKey = Exclude<keyof FitTarget, 'height'>

export interface FitResult {
  phenotypes: Phenotypes
  local: LocalChanges
  /** Uniform scale applied after the shape so the height matches exactly. */
  scale: number
  /** Measured on the fitted mannequin (after scaling), mm. */
  measured: FullMeasures
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

/** Which local change of Anny moves each measurement, in the order they are fitted. */
export const FIT_LOCAL: Record<FitKey, string> = {
  underbust: 'measure-underbust-circ-incr',
  neck: 'measure-neck-circ-incr',
  upperArm: 'measure-upperarm-circ-incr',
  thigh: 'measure-thigh-circ-incr',
  backLength: 'measure-napetowaist-dist-incr',
  waistToHips: 'measure-waisttohip-dist-incr',
  shoulderLength: 'measure-shoulder-dist-incr',
  // The main girths go last in each round, so they end up the most exact.
  bust: 'measure-bust-circ-incr',
  waist: 'measure-waist-circ-incr',
  hips: 'measure-hips-circ-incr',
}

/** How close is close enough, mm. */
const TOLERANCE = 2

/**
 * Fit of the Anny body to the measurements:
 * 1. the height phenotype by bisection, so the body is about the right height;
 * 2. the weight phenotype by bisection, so the bust, waist and hip girths are about right on average;
 * 3. the cup size phenotype (bust minus under the bust) and Anny's local
 *    changes named after measurements, one per measurement, a few rounds of
 *    secant steps (each step starts from fresh landmarks). Local changes go
 *    past 1 for large figures: the weight phenotype tops out first;
 * 4. a uniform scale that makes the height exact.
 * Girths are measured like a tape: convex hull of the cross-section.
 */
export function fitBody(body: AnnyBody, target: FitTarget, base: Phenotypes = FEMALE_BASE): FitResult {
  const t0 = performance.now()
  const regions = bodyRegions(body)
  const buf = new Float32Array(body.vertexCount * 3)
  const phenBuf = new Float32Array(body.vertexCount * 3)
  let evaluations = 0
  const phen: Phenotypes = { ...base }
  const local: LocalChanges = {}
  const mesh: MeshLike = { vertices: buf, faces: body.faces }
  /** Full rebuild (phenotypes changed). */
  const shape = () => {
    evaluations++
    body.phenotypeVertices(phen, phenBuf)
    buf.set(phenBuf)
    body.addLocalChanges(buf, local)
    return mesh
  }
  /** Only the local changes changed: reuse the phenotype body. */
  const reshape = () => {
    evaluations++
    buf.set(phenBuf)
    body.addLocalChanges(buf, local)
    return mesh
  }
  const heightOf = (m: MeshLike) => {
    const { minY, maxY } = verticalExtent(m.vertices)
    return (maxY - minY) * 1000
  }

  // 1. Height phenotype (everything below is compared at the target height).
  phen.height = bisect((h) => ((phen.height = h), heightOf(shape()) - target.height), 0, 1, 14)

  // 2. Weight: mean relative girth error to zero.
  const girths = GIRTHS.filter((k) => target[k] !== undefined)
  if (girths.length) {
    phen.weight = bisect(
      (w) => {
        phen.weight = w
        const m = shape()
        const lv = findLevels(m)
        const s = target.height / heightOf(m)
        return girths.reduce((acc, k) => acc + (torsoGirth(m, lv[k]) * 1000 * s) / target[k]! - 1, 0)
      },
      0,
      1,
      10,
    )
  }
  shape()

  // 3. Coordinate secant steps, a few rounds. The cup size phenotype sets
  // the difference between the bust and under the bust; every other value
  // has its own local change.
  type Param = { key: FitKey | 'cup'; get: () => number; set: (x: number) => void; rebuild: boolean; lo: number; hi: number }
  const params: Param[] = []
  if (target.bust !== undefined && target.underbust !== undefined)
    params.push({ key: 'cup', get: () => phen.cupsize ?? 0.5, set: (x) => (phen.cupsize = x), rebuild: true, lo: 0.15, hi: 0.95 })
  for (const k of Object.keys(FIT_LOCAL) as FitKey[])
    if (target[k] !== undefined) {
      const label = FIT_LOCAL[k]
      params.push({ key: k, get: () => local[label] ?? 0, set: (x) => (local[label] = x), rebuild: false, lo: -1, hi: 3 })
    }
  const goal = (k: FitKey | 'cup') => (k === 'cup' ? target.bust! - target.underbust! : target[k]!)
  for (let round = 0; round < 4; round++) {
    let worst = 0
    for (const p of params) {
      const probe = p.key === 'cup' ? cupProbe(indexMesh(reshape()), regions) : makeProbe(p.key, indexMesh(reshape()), regions)
      const err = (x: number) => {
        p.set(x)
        const m = indexMesh(p.rebuild ? shape() : reshape())
        return probe(m) * (target.height / heightOf(m)) - goal(p.key)
      }
      const clampP = (x: number) => Math.min(p.hi, Math.max(p.lo, x))
      let x0 = p.get()
      let e0 = err(x0)
      let best = { x: x0, e: e0 }
      if (Math.abs(e0) >= TOLERANCE) {
        let x1 = clampP(x0 - Math.sign(e0) * 0.1)
        let e1 = err(x1)
        for (let i = 0; i < 5 && Math.abs(e1) >= TOLERANCE && e1 !== e0; i++) {
          if (Math.abs(e1) < Math.abs(best.e)) best = { x: x1, e: e1 }
          // Secant step, at most 0.5 at a time: the response is far from linear.
          const step = Math.max(-0.5, Math.min(0.5, (-e1 * (x1 - x0)) / (e1 - e0)))
          // Pinned at a bound and still pushing past it: nothing more to gain.
          if (clampP(x1 + step) === x1) break
          x0 = x1
          e0 = e1
          x1 = clampP(x1 + step)
          e1 = err(x1)
        }
        if (Math.abs(e1) < Math.abs(best.e)) best = { x: x1, e: e1 }
      }
      p.set(best.x)
      if (p.rebuild) shape()
      worst = Math.max(worst, Math.abs(best.e))
    }
    if (worst < TOLERANCE) break
  }

  // 4. Exact height by scaling.
  const m = reshape()
  const scale = target.height / heightOf(m)
  for (let i = 0; i < buf.length; i++) buf[i]! *= scale
  const measured = bodyLandmarks(mesh, regions).measures
  return { phenotypes: { ...phen }, local: { ...local }, scale, measured, evaluations, ms: performance.now() - t0 }
}

/** Bust minus under the bust, at the lines found at the start of the step. */
function cupProbe(mesh: MeshLike, regions: BodyRegions): (m: MeshLike) => number {
  const y = bodyLandmarks(mesh, regions).rings.underbust.centre[1]
  return (m) => (torsoGirth(m, findLevels(m).bust) - torsoGirth(m, y)) * 1000
}

/**
 * A quick measurement of one value for the secant steps. Landmarks that a
 * local change barely moves (the levels of the cuts) are found once per round.
 */
function makeProbe(k: FitKey, mesh: MeshLike, regions: BodyRegions): (m: MeshLike) => number {
  const lv = findLevels(mesh)
  const levels: Required<BodyLevels> = { ...lv, armpit: lv.armpit ?? lv.bust + 0.08, crotch: lv.crotch ?? lv.hips - 0.1 }
  switch (k) {
    case 'bust':
    case 'waist':
    case 'hips': {
      // The line found at the start of the step: a local change hardly moves it.
      const y = levels[k]
      return (m) => torsoGirth(m, y) * 1000
    }
    case 'underbust': {
      const L = bodyLandmarks(mesh, regions)
      const y = L.rings.underbust.centre[1]
      return (m) => torsoGirth(m, y) * 1000
    }
    case 'neck': {
      const y = bodyLandmarks(mesh, regions).rings.neck.centre[1]
      return (m) => torsoGirth(m, y) * 1000
    }
    case 'upperArm': {
      const axis = bodyLandmarks(mesh, regions).armAxis
      return (m) => limbRing(m, regions.upperArm, axis).length
    }
    case 'thigh':
      return (m) => thighRing(m, regions.thigh, levels.crotch).length
    case 'shoulderLength': {
      const L = bodyLandmarks(mesh, regions)
      const y = L.rings.neck.centre[1]
      return (m) => {
        const ring = horizontalRing(m, y)
        let neckPoint = ring.points[0]!
        for (const p of ring.points) if (p[0] > neckPoint[0]) neckPoint = p
        const sp = findShoulderPoint(m, neckPoint, levels.armpit, L.armpitPoint[0])
        return len3(sub3(sp, neckPoint)) * 1000
      }
    }
    case 'backLength':
      return (m) => {
        const L = bodyLandmarks(m, regions)
        return backLengthAlongSpine(m, L.nape, L.levels.waist)
      }
    case 'waistToHips':
      return (m) => {
        const l = findLevels(m)
        return (l.waist - l.hips) * 1000
      }
  }
}

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
