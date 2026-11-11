/**
 * Small 3D helpers for measuring the body along any plane, not only
 * horizontal ones: an arm in the A-pose is measured across the arm, the
 * neck across the neck.
 */
import type { MeshLike } from './measure'

export type V3 = [number, number, number]

export const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const mul3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
export const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const len3 = (a: V3): number => Math.hypot(a[0], a[1], a[2])
export const norm3 = (a: V3): V3 => {
  const l = len3(a)
  return l === 0 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l]
}
export const vert = (v: Float32Array, i: number): V3 => [v[i * 3]!, v[i * 3 + 1]!, v[i * 3 + 2]!]

/** Two unit vectors that span the plane with normal n (u is as horizontal as possible). */
export function planeBasis(n: V3): { u: V3; w: V3 } {
  const ref: V3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1]
  const u = norm3(cross3(ref, n))
  return { u, w: cross3(n, u) }
}

export interface PlaneSlice {
  origin: V3
  normal: V3
  u: V3
  w: V3
  /** Connected pieces of the cut, each as [u, w] pairs in metres from the origin. */
  pieces: Float64Array[]
}

/** Cross-section of the mesh by a plane, split into connected pieces. */
export function slicePlane({ vertices: v, faces: f }: MeshLike, origin: V3, normal: V3): PlaneSlice {
  const n = norm3(normal)
  const { u, w } = planeBasis(n)
  const nV = v.length / 3
  const sd = new Float64Array(nV)
  for (let i = 0; i < nV; i++)
    sd[i] = (v[i * 3]! - origin[0]) * n[0] + (v[i * 3 + 1]! - origin[1]) * n[1] + (v[i * 3 + 2]! - origin[2]) * n[2]
  const pointOf = new Map<number, number>()
  const us: number[] = []
  const ws: number[] = []
  const parent: number[] = []
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!
    return i
  }
  const point = (p: number, q: number): number | undefined => {
    const a = sd[p]!
    const b = sd[q]!
    if (a > 0 === b > 0) return undefined
    const key = p < q ? p * nV + q : q * nV + p
    let id = pointOf.get(key)
    if (id === undefined) {
      const s = a / (a - b)
      const x = v[p * 3]! + s * (v[q * 3]! - v[p * 3]!) - origin[0]
      const y = v[p * 3 + 1]! + s * (v[q * 3 + 1]! - v[p * 3 + 1]!) - origin[1]
      const z = v[p * 3 + 2]! + s * (v[q * 3 + 2]! - v[p * 3 + 2]!) - origin[2]
      id = us.length
      us.push(x * u[0] + y * u[1] + z * u[2])
      ws.push(x * w[0] + y * w[1] + z * w[2])
      parent.push(id)
      pointOf.set(key, id)
    }
    return id
  }
  for (let t = 0; t < f.length; t += 3) {
    const a = f[t]!
    const b = f[t + 1]!
    const c = f[t + 2]!
    const pa = sd[a]! > 0
    if (pa === sd[b]! > 0 && pa === sd[c]! > 0) continue
    const ids = [point(a, b), point(b, c), point(c, a)].filter((i): i is number => i !== undefined)
    for (let k = 1; k < ids.length; k++) parent[find(ids[k]!)] = find(ids[0]!)
  }
  const groups = new Map<number, number[]>()
  for (let i = 0; i < us.length; i++) {
    const r = find(i)
    const g = groups.get(r)
    if (g) g.push(i)
    else groups.set(r, [i])
  }
  const pieces = [...groups.values()].map((ids) => {
    const out = new Float64Array(ids.length * 2)
    ids.forEach((i, k) => {
      out[2 * k] = us[i]!
      out[2 * k + 1] = ws[i]!
    })
    return out
  })
  return { origin, normal: n, u, w, pieces }
}

/** The piece of a slice nearest to the origin of the plane (by its closest point). */
export function nearestPiece(pieces: Float64Array[], at: [number, number] = [0, 0]): Float64Array {
  let best: Float64Array = new Float64Array()
  let bestD = Infinity
  for (const p of pieces) {
    if (p.length < 6) continue
    let d = Infinity
    for (let k = 0; k < p.length; k += 2) d = Math.min(d, Math.hypot(p[k]! - at[0], p[k + 1]! - at[1]))
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

/** Convex hull of [a, b] points, counter-clockwise, as [a, b] pairs (monotone chain). */
export function convexHull(points: Float64Array): Float64Array {
  const n = points.length / 2
  if (n < 3) return points.slice()
  const idx = Array.from({ length: n }, (_, i) => i).sort(
    (i, j) => points[2 * i]! - points[2 * j]! || points[2 * i + 1]! - points[2 * j + 1]!,
  )
  const cross = (o: number, a: number, b: number) =>
    (points[2 * a]! - points[2 * o]!) * (points[2 * b + 1]! - points[2 * o + 1]!) -
    (points[2 * a + 1]! - points[2 * o + 1]!) * (points[2 * b]! - points[2 * o]!)
  const lower: number[] = []
  for (const i of idx) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, i) <= 0) lower.pop()
    lower.push(i)
  }
  const upper: number[] = []
  for (let k = idx.length - 1; k >= 0; k--) {
    const i = idx[k]!
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, i) <= 0) upper.pop()
    upper.push(i)
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)]
  const out = new Float64Array(hull.length * 2)
  hull.forEach((i, k) => {
    out[2 * k] = points[2 * i]!
    out[2 * k + 1] = points[2 * i + 1]!
  })
  return out
}

export function polygonPerimeter(p: Float64Array): number {
  const n = p.length / 2
  let s = 0
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n
    s += Math.hypot(p[2 * j]! - p[2 * k]!, p[2 * j + 1]! - p[2 * k + 1]!)
  }
  return n < 2 ? 0 : s
}

/** Mean and the normal of the best-fit plane of a set of points (smallest principal axis). */
export function fitPlane(pts: V3[]): { centre: V3; normal: V3; axis: V3 } {
  const c: V3 = [0, 0, 0]
  for (const p of pts) for (let i = 0; i < 3; i++) c[i]! += p[i]! / pts.length
  const C = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (const p of pts) {
    const d = sub3(p, c)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j]! += d[i]! * d[j]!
  }
  const { vectors } = eigenSym3(C)
  // Sorted by eigenvalue, largest first: the last one is the normal.
  return { centre: c, normal: vectors[2]!, axis: vectors[0]! }
}

/** Eigen decomposition of a symmetric 3×3 matrix (Jacobi), vectors sorted by value, largest first. */
export function eigenSym3(m: number[]): { values: number[]; vectors: V3[] } {
  const a = m.slice()
  const V = [1, 0, 0, 0, 1, 0, 0, 0, 1]
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = Math.abs(a[1]!) + Math.abs(a[2]!) + Math.abs(a[5]!)
    if (off < 1e-15) break
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const) {
      const apq = a[p * 3 + q]!
      if (Math.abs(apq) < 1e-18) continue
      const app = a[p * 3 + p]!
      const aqq = a[q * 3 + q]!
      const theta = (aqq - app) / (2 * apq)
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const c = 1 / Math.sqrt(t * t + 1)
      const s = t * c
      for (let k = 0; k < 3; k++) {
        const akp = a[k * 3 + p]!
        const akq = a[k * 3 + q]!
        a[k * 3 + p] = c * akp - s * akq
        a[k * 3 + q] = s * akp + c * akq
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p * 3 + k]!
        const aqk = a[q * 3 + k]!
        a[p * 3 + k] = c * apk - s * aqk
        a[q * 3 + k] = s * apk + c * aqk
      }
      for (let k = 0; k < 3; k++) {
        const vkp = V[k * 3 + p]!
        const vkq = V[k * 3 + q]!
        V[k * 3 + p] = c * vkp - s * vkq
        V[k * 3 + q] = s * vkp + c * vkq
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[j * 3 + j]! - a[i * 3 + i]!)
  return {
    values: order.map((i) => a[i * 3 + i]!),
    vectors: order.map((i) => [V[i]!, V[3 + i]!, V[6 + i]!] as V3),
  }
}
