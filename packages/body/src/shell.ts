/**
 * The translucent «чехол»: a rough shell of the garment on the mannequin,
 * built from the girths of the pattern without any physics (stage M4).
 *
 * - Below the underarms the shell is a stack of rings. Each ring is the
 *   tape line of the body at that height (the convex hull of the cut; under
 *   a skirt the hull of both legs), blown up round its centre until its
 *   length is the girth of the garment there. Where the garment is not
 *   bigger than the body, the ring lies on the body.
 * - Above the underarms (shoulders of a dress) it is the body surface
 *   pushed out a few millimetres, without the arms and the head.
 * - A sleeve is a stack of rings across the arm, from the shoulder point
 *   down the arm.
 * Every vertex is coloured by the ease at its ring, so the shell is also
 * the ease map; the bands mark the main levels.
 *
 * Heights of the pattern («dy», mm below the waist) are mapped onto the
 * mannequin by its waist and hip lines; above the waist and below the hips
 * one millimetre of pattern is one millimetre of body.
 */
import type { Landmarks } from './landmarks'
import { centralPiece, indexMesh, type MeshLike, slicePieces } from './measure'
import { type V3, add3, convexHull, cross3, dot3, mul3, nearestPiece, norm3, polygonPerimeter, slicePlane, sub3 } from './plane'

/** What the shell needs of the garment (the GarmentProfile of @lecals/core fits). */
export interface GarmentShape {
  garment: 'skirt' | 'dress' | 'trousers'
  top: number
  hem: number
  levels: { bust?: number; chest?: number; waist: number; hip?: number; crotch?: number; knee?: number }
  girthAt: (dy: number) => number
  /** Skirts and trousers: the waist seam, used for the top ring. */
  waistSeam?: number
  legGirthAt?: (dy: number) => number
  sleeve?: { underarm: number; length: number; girthAt: (d: number) => number }
}

export type Rgb = [number, number, number]

export interface ShellBand {
  id: string
  /** Closed loop on the shell. */
  points: V3[]
  /** Where to put the label (the front of the band). */
  labelAt: V3
}

export interface Shell {
  positions: Float32Array
  colors: Float32Array
  indices: Uint32Array
  bands: ShellBand[]
  /** The hem line (and the ends of the sleeves), for drawing. */
  edges: V3[][]
}

const RING = 64
const SLEEVE_RING = 32
/** The shell sits this far off the skin where the garment is tight, m. */
const GAP = 0.003

/** Body height (m, mesh) of a pattern height dy (mm below the waist). */
export function makeHeightMap(L: Landmarks, hipDy: number | undefined): (dy: number) => number {
  const W = L.levels.waist
  const Hb = L.levels.hips
  return (dy) => {
    if (dy <= 0 || hipDy === undefined || hipDy <= 0) return W - dy / 1000
    if (dy <= hipDy) return W - (dy / hipDy) * (W - Hb)
    return Hb - (dy - hipDy) / 1000
  }
}

/** Points where rays from the centre at N even angles leave a convex polygon of [a, b] pairs. */
function resample(hull: Float64Array, n: number): { c: [number, number]; pts: Float64Array } {
  const m = hull.length / 2
  let ca = 0
  let cb = 0
  for (let k = 0; k < m; k++) {
    ca += hull[2 * k]! / m
    cb += hull[2 * k + 1]! / m
  }
  const pts = new Float64Array(2 * n)
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n
    const da = Math.cos(t)
    const db = Math.sin(t)
    let best = 0
    for (let k = 0; k < m; k++) {
      const pa = hull[2 * k]! - ca
      const pb = hull[2 * k + 1]! - cb
      const qa = hull[2 * ((k + 1) % m)]! - ca
      const qb = hull[2 * ((k + 1) % m) + 1]! - cb
      // Ray s·d meets segment p + u·(q − p).
      const ea = qa - pa
      const eb = qb - pb
      const den = da * eb - db * ea
      if (Math.abs(den) < 1e-12) continue
      const s = (pa * eb - pb * ea) / den
      const u = (pa * db - pb * da) / den
      if (u >= -1e-9 && u <= 1 + 1e-9 && s > best) best = s
    }
    pts[2 * i] = ca + best * da
    pts[2 * i + 1] = cb + best * db
  }
  return { c: [ca, cb], pts }
}

/** Blow a ring up round its centre to a girth (m); returns the new points and the body girth. */
function inflate(ring: { c: [number, number]; pts: Float64Array }, girth: number): { pts: Float64Array; body: number } {
  const body = polygonPerimeter(ring.pts)
  const n = ring.pts.length / 2
  const k = body > 0 ? Math.max(1, girth / body) : 1
  const out = new Float64Array(ring.pts.length)
  for (let i = 0; i < n; i++) {
    const da = ring.pts[2 * i]! - ring.c[0]
    const db = ring.pts[2 * i + 1]! - ring.c[1]
    const r = Math.hypot(da, db) || 1
    const s = k + GAP / r
    out[2 * i] = ring.c[0] + da * s
    out[2 * i + 1] = ring.c[1] + db * s
  }
  return { pts: out, body }
}

class Builder {
  pos: number[] = []
  col: number[] = []
  idx: number[] = []
  add(p: V3, c: Rgb): number {
    this.pos.push(p[0], p[1], p[2])
    this.col.push(c[0], c[1], c[2])
    return this.pos.length / 3 - 1
  }
  /** Quads between consecutive closed rings (same number of points). */
  loft(rings: number[][]) {
    for (let r = 0; r + 1 < rings.length; r++) {
      const a = rings[r]!
      const b = rings[r + 1]!
      const n = a.length
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n
        this.idx.push(a[i]!, b[i]!, a[j]!, a[j]!, b[i]!, b[j]!)
      }
    }
  }
}

export interface ShellOptions {
  /** Colour of a ring by its ease (mm). */
  color: (easeMm: number) => Rgb
  /** Step between rings, m. */
  step?: number
}

export function garmentShell(input: MeshLike, L: Landmarks, g: GarmentShape, opt: ShellOptions): Shell {
  const mesh = input.yIndex ? input : indexMesh(input)
  const step = opt.step ?? 0.015
  const toY = makeHeightMap(L, g.levels.hip)
  const H = L.measures.height / 1000
  const underarm = L.levels.armpit - 0.012 * H
  const b = new Builder()
  const bands: ShellBand[] = []
  const edges: V3[][] = []
  const hipHalf = Math.max(...L.rings.hips.points.map((p) => Math.abs(p[0])))

  /** Tape ring of the body at height y: torso, or both legs under a skirt. */
  const bodyRing = (y: number, legs: 'both' | 'left' | 'torso') => {
    const pieces = slicePieces(mesh, y)
    let pts: Float64Array
    if (legs === 'torso' || y > L.levels.crotch) pts = centralPiece(pieces)
    else {
      // Legs: pieces near the middle (hands hang beside the hips in the A-pose).
      const keep = pieces.filter((p) => {
        let sx = 0
        for (let k = 0; k < p.length; k += 2) sx += p[k]!
        const cx = (2 * sx) / p.length
        return Math.abs(cx) < hipHalf && (legs === 'both' || cx > 0)
      })
      const all = new Float64Array(keep.reduce((n, p) => n + p.length, 0))
      let o = 0
      for (const p of keep) {
        all.set(p, o)
        o += p.length
      }
      pts = all
    }
    if (pts.length < 6) return undefined
    return resample(convexHull(pts), RING)
  }

  const ringAt = (y: number, girthMm: number, legs: 'both' | 'left' | 'torso') => {
    const r = bodyRing(y, legs)
    if (!r) return undefined
    const { pts, body } = inflate(r, girthMm / 1000)
    return { pts, ease: girthMm - body * 1000 }
  }
  const to3 = (pts: Float64Array, y: number, mirror = false): V3[] => {
    const out: V3[] = []
    for (let i = 0; i < pts.length / 2; i++) out.push([(mirror ? -1 : 1) * pts[2 * i]!, y, pts[2 * i + 1]!])
    return out
  }

  // 1. Torso and skirt: rings from the top of the garment to the hem.
  const yTop = Math.min(toY(g.top), underarm)
  // Not into the feet: trousers to the floor stop at the ankles.
  const yHem = Math.max(toY(g.hem), L.floor + 0.07)
  const trousers = g.garment === 'trousers' && g.legGirthAt && g.levels.crotch !== undefined
  const yCrotch = trousers ? Math.min(toY(g.levels.crotch!), L.levels.crotch) : -Infinity
  const ys: number[] = []
  for (let y = yTop; y > Math.max(yHem, yCrotch) + 1e-4; y -= step) ys.push(y)
  ys.push(Math.max(yHem, yCrotch))
  // Trousers: the body part reaches a little under the crotch, to meet the legs.
  if (trousers) ys.push(yCrotch - 0.02)
  const dyOf = (y: number) => {
    // Invert the height map by bisection (it is monotonic).
    let lo = -2000
    let hi = 3000
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2
      if (toY(m) > y) lo = m
      else hi = m
    }
    return (lo + hi) / 2
  }
  // Panels end at slightly different heights (a curved hem), and the top
  // edge of a skirt is the curved waist seam: keep the lookups 1,5 cm inside.
  // Near the hem take the widest of the last 10 cm: a flared hem curves up
  // at the seams, and a cut across misses those parts.
  const girth = (dy: number) => {
    if (g.waistSeam && dy < 15) return g.waistSeam
    const d = Math.min(g.hem - 5, Math.max(g.top + 15, dy))
    let best = g.girthAt(d)
    if (d > g.hem - 100) for (let x = Math.max(g.top + 15, d - 100); x < d; x += 10) best = Math.max(best, g.girthAt(x))
    return best
  }
  const torsoRings: number[][] = []
  let lastTorso: V3[] = []
  for (const y of ys) {
    const r = ringAt(y, girth(dyOf(y)), 'both')
    if (!r) continue
    const c = opt.color(r.ease)
    lastTorso = to3(r.pts, y)
    torsoRings.push(lastTorso.map((p) => b.add(p, c)))
  }
  b.loft(torsoRings)
  if (!trousers && lastTorso.length) edges.push(lastTorso)

  // 2. Trouser legs: one leg, mirrored.
  if (trousers) {
    const legRings: V3[][] = []
    const legEase: number[] = []
    const legY: number[] = []
    for (let y = yCrotch - 0.005; y > yHem; y -= step) legY.push(y)
    legY.push(yHem)
    for (const y of legY) {
      const r = ringAt(y, g.legGirthAt!(Math.min(g.hem - 15, dyOf(y))), 'left')
      if (!r) continue
      legRings.push(to3(r.pts, y))
      legEase.push(r.ease)
    }
    for (const mirror of [false, true]) {
      const rings = legRings.map((ring, i) =>
        ring.map((p) => b.add([mirror ? -p[0] : p[0], p[1], p[2]], opt.color(legEase[i]!))),
      )
      // Keep the triangles facing out on the mirrored side.
      if (mirror) rings.forEach((r) => r.reverse())
      b.loft(rings)
      const last = legRings.at(-1)
      if (last) edges.push(last.map((p) => [mirror ? -p[0] : p[0], p[1], p[2]] as V3))
    }
  }

  // 3. Shoulders of a dress: the body surface above the top ring, pushed out.
  if (g.garment === 'dress') upperBodice(mesh, L, yTop, b, opt.color(bandEase(g, g.levels.bust ?? g.levels.chest, L.measures.bust)))

  // 4. Sleeves.
  if (g.garment === 'dress' && g.sleeve && g.sleeve.length > 20) sleeves(mesh, L, g.sleeve, b, opt, edges)

  // 5. Bands at the main levels.
  const band = (id: string, y: number, girth: number, legs: 'both' | 'left' | 'torso') => {
    const r = ringAt(y, girth, legs)
    if (!r) return
    const pts = to3(r.pts, y).map((p) => add3(p, [0, 0, 0]))
    const front = pts.reduce((a, p) => (p[2] > a[2] ? p : a), pts[0]!)
    bands.push({ id, points: pts, labelAt: front })
  }
  if (g.garment === 'dress') {
    const dy = g.levels.bust ?? g.levels.chest
    if (dy !== undefined) band('bust', L.levels.bust, g.girthAt(dy), 'torso')
  }
  band('waist', L.levels.waist, g.garment === 'dress' ? g.girthAt(0) : (g.waistSeam ?? g.girthAt(15)), 'torso')
  if (g.levels.hip !== undefined && g.levels.hip <= g.hem) band('hips', L.levels.hips, g.girthAt(g.levels.hip), 'torso')
  if (trousers) {
    const dy = g.levels.crotch! + 30
    band('thigh', L.levels.crotch - 0.03, g.legGirthAt!(dy), 'left')
    if (g.levels.knee !== undefined) band('knee', toY(g.levels.knee), g.legGirthAt!(g.levels.knee), 'left')
  }

  return {
    positions: Float32Array.from(b.pos),
    colors: Float32Array.from(b.col),
    indices: Uint32Array.from(b.idx),
    bands,
    edges,
  }
}

function bandEase(g: GarmentShape, dy: number | undefined, body: number): number {
  return dy === undefined ? 0 : g.girthAt(dy) - body
}

/** The plane between the arm and the torso (left side): through the shoulder point and the armpit, upright. */
function armholePlane(L: Landmarks): { at: V3; n: V3 } {
  const S = L.shoulderPoint
  const A = L.armpitPoint
  let n = norm3(cross3(sub3(S, A), [0, 0, 1]))
  if (n[0] < 0) n = mul3(n, -1)
  // A little inside the shoulder point, so the shoulder seam sits on the shoulder.
  return { at: A, n }
}

function upperBodice(mesh: MeshLike, L: Landmarks, yTop: number, b: Builder, color: Rgb) {
  const v = mesh.vertices
  const f = mesh.faces
  const nV = v.length / 3
  const { at, n } = armholePlane(L)
  const neckY = L.rings.neck.centre[1]
  // Vertex normals.
  const nrm = new Float32Array(v.length)
  for (let t = 0; t < f.length; t += 3) {
    const a = f[t]! * 3
    const c1 = f[t + 1]! * 3
    const c2 = f[t + 2]! * 3
    const e1: V3 = [v[c1]! - v[a]!, v[c1 + 1]! - v[a + 1]!, v[c1 + 2]! - v[a + 2]!]
    const e2: V3 = [v[c2]! - v[a]!, v[c2 + 1]! - v[a + 1]!, v[c2 + 2]! - v[a + 2]!]
    const fn = cross3(e1, e2)
    for (const i of [a, c1, c2]) {
      nrm[i] += fn[0]
      nrm[i + 1] += fn[1]
      nrm[i + 2] += fn[2]
    }
  }
  const keep = new Int32Array(nV).fill(-1)
  for (let i = 0; i < nV; i++) {
    const p: V3 = [v[i * 3]!, v[i * 3 + 1]!, v[i * 3 + 2]!]
    if (p[1] < yTop - 0.01 || p[1] > neckY) continue
    const side: V3 = [Math.abs(p[0]), p[1], p[2]]
    if (dot3(sub3(side, at), n) > 0) continue
    const nn = norm3([nrm[i * 3]!, nrm[i * 3 + 1]!, nrm[i * 3 + 2]!])
    keep[i] = b.add(add3(p, mul3(nn, 0.005)), color)
  }
  for (let t = 0; t < f.length; t += 3) {
    const a = keep[f[t]!]!
    const c1 = keep[f[t + 1]!]!
    const c2 = keep[f[t + 2]!]!
    if (a >= 0 && c1 >= 0 && c2 >= 0) b.idx.push(a, c1, c2)
  }
}

function sleeves(
  mesh: MeshLike,
  L: Landmarks,
  sl: NonNullable<GarmentShape['sleeve']>,
  b: Builder,
  opt: ShellOptions,
  edges: V3[][],
) {
  const axis = L.armAxis
  const S = L.shoulderPoint
  const { at, n } = armholePlane(L)
  const rings: V3[][] = []
  const eases: number[] = []
  const ds_: number[] = []
  const len = sl.length / 1000
  const ds: number[] = []
  for (let d = Math.min(0.03, len / 2); d < len; d += 0.02) ds.push(d)
  ds.push(len)
  const armGirth = L.rings.upperArm.length / 1000
  for (const d of ds) {
    const o = add3(S, mul3(axis, d))
    const cut = slicePlane(mesh, o, axis)
    const piece = nearestPiece(cut.pieces)
    // Only the arm: drop the part of the cut on the torso side of the armhole.
    const pts: number[] = []
    for (let k = 0; k < piece.length; k += 2) {
      const p = add3(o, add3(mul3(cut.u, piece[k]!), mul3(cut.w, piece[k + 1]!)))
      if (dot3(sub3(p, at), n) >= -0.005) pts.push(piece[k]!, piece[k + 1]!)
    }
    if (pts.length < 6) continue
    const r = resample(convexHull(Float64Array.from(pts)), SLEEVE_RING)
    // Near the shoulder the cut still runs through the shoulder joint: the
    // sleeve starts where the cut is about the arm alone.
    if (!rings.length && polygonPerimeter(r.pts) > 1.35 * armGirth && d < len) continue
    const { pts: big, body } = inflate(r, sl.girthAt(d * 1000) / 1000)
    const ring: V3[] = []
    for (let i = 0; i < SLEEVE_RING; i++) ring.push(add3(o, add3(mul3(cut.u, big[2 * i]!), mul3(cut.w, big[2 * i + 1]!))))
    rings.push(ring)
    eases.push(sl.girthAt(d * 1000) - body * 1000)
    ds_.push(d)
  }
  // The cap is not round the arm (it is set into the armhole): colour it as the sleeve under the arm.
  const ua = ds_.findIndex((d) => d * 1000 >= sl.underarm)
  if (ua > 0) for (let i = 0; i < ua; i++) eases[i] = eases[ua]!
  for (const mirror of [false, true]) {
    const idx = rings.map((ring, i) => ring.map((p) => b.add([mirror ? -p[0] : p[0], p[1], p[2]], opt.color(eases[i]!))))
    if (mirror) idx.forEach((r) => r.reverse())
    b.loft(idx)
    const last = rings.at(-1)
    if (last) edges.push(last.map((p) => [mirror ? -p[0] : p[0], p[1], p[2]] as V3))
  }
}
