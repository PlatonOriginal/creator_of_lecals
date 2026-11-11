/**
 * Landmarks and the full set of measurements on the mannequin (stage M4).
 *
 * Anny's local changes carry names of measurements, and each one moves a
 * fixed set of vertices: the ring of the neck, of the upper arm, of the
 * thigh. These vertex sets mark the same place on every body, so they are
 * the landmarks. Girths are taken like a tape: the convex hull of the cut
 * by the plane that best fits the ring (across the arm, across the neck).
 * All positions in metres in mesh coordinates (y up, x to the body's left,
 * z to the front); measurements in millimetres.
 */
import type { AnnyBody } from './anny'
import { type BodyLevels, type MeshLike, centralPiece, findLevels, indexMesh, slicePieces, torsoGirth, verticalExtent } from './measure'
import {
  type V3,
  add3,
  convexHull,
  len3,
  mul3,
  nearestPiece,
  norm3,
  polygonPerimeter,
  slicePlane,
  sub3,
} from './plane'

/** Vertex sets of the landmarks, found once per body model. */
export interface BodyRegions {
  neck: number[]
  /** Left side only (x > 0): the mannequin is symmetric. */
  upperArm: number[]
  thigh: number[]
  underbust: number[]
}

export function bodyRegions(body: AnnyBody): BodyRegions {
  const left = (ids: number[]) => ids.filter((i) => body.template[i * 3]! > 0)
  return {
    neck: body.localRegion('measure-neck-circ-incr', 0.5),
    upperArm: left(body.localRegion('measure-upperarm-circ-incr', 0.5)),
    thigh: left(body.localRegion('measure-thigh-circ-incr', 0.5)),
    underbust: body.localRegion('measure-underbust-circ-incr', 0.5),
  }
}

/** A girth line on the body: a closed loop of 3D points and its length. */
export interface Ring {
  points: V3[]
  /** mm */
  length: number
  centre: V3
  normal: V3
}

export interface FullMeasures {
  height: number
  bust: number
  waist: number
  hips: number
  underbust: number
  neck: number
  upperArm: number
  thigh: number
  /** Шп: from the neck point to the shoulder point. */
  shoulderLength: number
  /** Дтс: from the nape (7th vertebra) down the back to the waist line. */
  backLength: number
  /** Дтб: from the waist line down to the hip line, at the side. */
  waistToHips: number
}

export interface Landmarks {
  levels: Required<BodyLevels>
  floor: number
  rings: Record<'bust' | 'waist' | 'hips' | 'underbust' | 'neck' | 'upperArm' | 'thigh', Ring>
  /** Left side; mirror x for the right. */
  neckPoint: V3
  shoulderPoint: V3
  armpitPoint: V3
  nape: V3
  /** Unit vector down the left arm, from the shoulder point. */
  armAxis: V3
  /** Unit vector down the left leg, through the thigh ring. */
  legAxis: V3
  measures: FullMeasures
}

const ringFromPiece = (piece: Float64Array, origin: V3, u: V3, w: V3, normal: V3): Ring => {
  const hull = convexHull(piece)
  const points: V3[] = []
  for (let k = 0; k < hull.length; k += 2) points.push(add3(origin, add3(mul3(u, hull[k]!), mul3(w, hull[k + 1]!))))
  const centre: V3 = [0, 0, 0]
  for (const p of points) for (let i = 0; i < 3; i++) centre[i]! += p[i]! / points.length
  return { points, length: polygonPerimeter(hull) * 1000, centre, normal }
}

/** Girth of the arm across the arm, through the middle of the local change's region. */
export function limbRing(mesh: MeshLike, ids: number[], axis: V3): Ring {
  const centre = centroidOf(mesh.vertices, () => false, ids)
  const s = slicePlane(mesh, centre, axis)
  return ringFromPiece(nearestPiece(s.pieces), centre, s.u, s.w, s.normal)
}

/** Обед: horizontal, round the top of the left thigh, under the buttock (3 cm under the crotch). */
export function thighRing(mesh: MeshLike, ids: number[], crotchY: number): Ring {
  const c = centroidOf(mesh.vertices, () => false, ids)
  c[1] = crotchY - 0.03
  const pieces = slicePieces(mesh, c[1]).filter((p) => p.length >= 6)
  let best = pieces[0] ?? new Float64Array()
  let bestD = Infinity
  for (const p of pieces) {
    let sx = 0
    let sz = 0
    for (let k = 0; k < p.length; k += 2) {
      sx += p[k]!
      sz += p[k + 1]!
    }
    const d = Math.hypot((2 * sx) / p.length - c[0], (2 * sz) / p.length - c[2])
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return ringFromPiece(best, [0, c[1], 0], [1, 0, 0], [0, 0, 1], [0, 1, 0])
}

/** Centroid of the given vertices, or of all vertices that pass the test. */
export function centroidOf(v: Float32Array, test: (x: number, y: number, z: number) => boolean, ids?: number[]): V3 {
  const c: V3 = [0, 0, 0]
  let n = 0
  const take = (i: number) => {
    c[0] += v[i * 3]!
    c[1] += v[i * 3 + 1]!
    c[2] += v[i * 3 + 2]!
    n++
  }
  if (ids) ids.forEach(take)
  else for (let i = 0; i < v.length / 3; i++) if (test(v[i * 3]!, v[i * 3 + 1]!, v[i * 3 + 2]!)) take(i)
  return n ? [c[0] / n, c[1] / n, c[2] / n] : c
}

export function maxX(v: Float32Array): number {
  let m = -Infinity
  for (let i = 0; i < v.length; i += 3) m = Math.max(m, v[i]!)
  return m
}

/**
 * Ош is taken at the base of the neck. Going down from the narrowest part
 * of the neck, the base is where the girth has grown by 12 % (there the neck
 * turns into the shoulders and the girth starts to grow fast).
 */
export function neckBaseRing(mesh: MeshLike, ids: number[], armpitY: number): Ring {
  const ys = ids.map((i) => mesh.vertices[i * 3 + 1]!)
  const lo = Math.max(armpitY, Math.min(...ys) - 0.05)
  const hi = Math.max(...ys)
  let minY = lo
  let minG = Infinity
  for (let y = lo; y <= hi; y += 0.0025) {
    const g = torsoGirth(mesh, y)
    if (g > 0 && g < minG) {
      minG = g
      minY = y
    }
  }
  let y = minY
  while (y > lo && torsoGirth(mesh, y) < minG * 1.12) y -= 0.0025
  return horizontalRing(mesh, y)
}

/**
 * Under the bust: the breast fold, where the front of the body stops moving
 * back going down from the bust line (the top of the flat ribcage).
 */
export function underbustY(mesh: MeshLike, levels: { bust: number; waist: number }): number {
  const front = (y: number) => {
    const p = centralPiece(slicePieces(mesh, y))
    let z = -Infinity
    for (let k = 1; k < p.length; k += 2) z = Math.max(z, p[k]!)
    return z
  }
  // From 4,5 cm under the bust line down (the fold is never closer to the
  // bust points): the first place where the front drops less than 3 mm over
  // the next centimetre.
  const bottom = Math.max(levels.waist + 0.02, levels.bust - 0.14)
  for (let y = levels.bust - 0.045; y >= bottom; y -= 0.0025) if (front(y) - front(y - 0.01) < 0.003) return y - 0.003
  return bottom
}

/** Horizontal girth of the torso at height y as a ring. */
export function horizontalRing(mesh: MeshLike, y: number): Ring {
  const piece = centralPiece(slicePieces(mesh, y))
  // slicePieces gives [x, z]; the plane basis u = x, w = z at height y.
  return ringFromPiece(piece, [0, y, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0])
}

export function bodyLandmarks(input: MeshLike, regions: BodyRegions): Landmarks {
  const mesh = input.yIndex ? input : indexMesh(input)
  const v = mesh.vertices
  const { minY } = verticalExtent(v)
  const lv = findLevels(mesh)
  const levels = { ...lv, armpit: lv.armpit ?? lv.bust + 0.08, crotch: lv.crotch ?? lv.hips - 0.1 }

  const neck = neckBaseRing(mesh, regions.neck, levels.armpit)

  const underbust = horizontalRing(mesh, underbustY(mesh, levels))
  const thigh = thighRing(mesh, regions.thigh, levels.crotch)

  // Neck point: the side of the neck ring; nape: its back point.
  let neckPoint = neck.points[0]!
  let nape = neck.points[0]!
  for (const p of neck.points) {
    if (p[0] > neckPoint[0]) neckPoint = p
    if (p[2] < nape[2]) nape = p
  }

  // Armpit point: the side of the torso just under the armpits (one scan
  // step under the level where the arms join the cut).
  const H = verticalExtent(v).maxY - minY
  const below = centralPiece(slicePieces(mesh, levels.armpit - 0.012 * H))
  let ax = 0
  let az = 0
  for (let k = 0; k < below.length; k += 2)
    if (below[k]! > ax) {
      ax = below[k]!
      az = below[k + 1]!
    }
  const armpitPoint: V3 = [ax, levels.armpit - 0.012 * H, az]

  // Shoulder point: on the outline of the body seen from the front (cut at
  // the depth of the shoulders), the place where the gentle slope of the
  // shoulder turns into the steep line of the arm.
  const shoulderPoint = findShoulderPoint(mesh, neckPoint, levels.armpit, armpitPoint[0])

  // Arm axis: from the shoulder point to the hand (the outermost part of the left side).
  const handX = maxX(v) - 0.06
  const hand = centroidOf(v, (x) => x > handX)
  const armAxis = norm3(sub3(hand, shoulderPoint))
  const upperArm = limbRing(mesh, regions.upperArm, armAxis)
  // Leg axis: from the thigh to the ankle (left side, 4–10 cm above the floor).
  const ankle = centroidOf(v, (x, y) => x > 0.01 && y > minY + 0.04 && y < minY + 0.1)
  const legAxis = norm3(sub3(ankle, thigh.centre))

  const backLength = backLengthAlongSpine(mesh, nape, levels.waist)

  const ring = (y: number) => horizontalRing(mesh, y)
  const rings = {
    bust: ring(levels.bust),
    waist: ring(levels.waist),
    hips: ring(levels.hips),
    underbust,
    neck,
    upperArm,
    thigh,
  }
  const measures: FullMeasures = {
    height: (verticalExtent(v).maxY - minY) * 1000,
    bust: rings.bust.length,
    waist: rings.waist.length,
    hips: rings.hips.length,
    underbust: underbust.length,
    neck: neck.length,
    upperArm: upperArm.length,
    thigh: thigh.length,
    shoulderLength: len3(sub3(shoulderPoint, neckPoint)) * 1000,
    backLength,
    waistToHips: (levels.waist - levels.hips) * 1000,
  }
  return { levels, floor: minY, rings, neckPoint, shoulderPoint, armpitPoint, nape, armAxis: norm3(armAxis), legAxis: norm3(legAxis), measures }
}

const STEEP_DEG = 35

export function findShoulderPoint(mesh: MeshLike, neckPoint: V3, armpitY: number, sideX: number): V3 {
  const s = slicePlane(mesh, [0, 0, neckPoint[2]], [0, 0, 1])
  // u = x across the body (planeBasis keeps u horizontal), w = y up.
  const sign = s.u[0] > 0 ? 1 : -1
  const pts: [number, number][] = []
  for (const piece of s.pieces)
    for (let k = 0; k < piece.length; k += 2) {
      const x = piece[k]! * sign
      const y = piece[k + 1]! * (s.w[1] > 0 ? 1 : -1)
      if (x > neckPoint[0] && y > armpitY) pts.push([x, y])
    }
  if (!pts.length) return [neckPoint[0] + 0.12, neckPoint[1] - 0.04, neckPoint[2]]
  // Top of the outline in 5 mm columns.
  const step = 0.005
  const cols = new Map<number, number>()
  for (const [x, y] of pts) {
    const c = Math.floor(x / step)
    cols.set(c, Math.max(cols.get(c) ?? -Infinity, y))
  }
  const keys = [...cols.keys()].sort((a, b) => a - b)
  const top = keys.map((c) => [(c + 0.5) * step, cols.get(c)!] as [number, number])
  // Walk out from the side of the torso: the shoulder point is where the
  // outline gets steeper than 35° (looked for no further than 7 cm out).
  const steep = Math.tan((STEEP_DEG * Math.PI) / 180)
  const from = Math.max(neckPoint[0] + 0.05, sideX - 0.01)
  for (let i = 2; i < top.length - 2; i++) {
    const x = top[i]![0]
    if (x < from) continue
    if (x > sideX + 0.07) break
    const [x0, y0] = top[i - 2]!
    const [x1, y1] = top[i + 2]!
    if ((y0 - y1) / (x1 - x0) > steep) return [x, top[i]![1], neckPoint[2]]
  }
  const near = top.reduce((b, q) => (Math.abs(q[0] - (sideX + 0.03)) < Math.abs(b[0] - (sideX + 0.03)) ? q : b), top[0]!)
  return [near[0], near[1], neckPoint[2]]
}

/** Дтс: along the back in the middle (x = 0) from the nape down to the waist line, like a tape. */
export function backLengthAlongSpine(mesh: MeshLike, nape: V3, waistY: number): number {
  // Just off the middle: vertices lying exactly on the plane would drop out of the cut.
  const s = slicePlane(mesh, [1e-4, 0, 0], [1, 0, 0])
  // Basis for normal +x: u = cross(y, x) = −z, w = cross(x, u) = y.
  const pts: [number, number][] = []
  for (const piece of s.pieces)
    for (let k = 0; k < piece.length; k += 2) {
      const p = add3(s.origin, add3(mul3(s.u, piece[k]!), mul3(s.w, piece[k + 1]!)))
      // Back half only: the front of the body is well forward of the nape.
      if (p[1] <= nape[1] && p[1] >= waistY && p[2] < nape[2] + 0.04) pts.push([p[1], p[2]])
    }
  // The back outline: the rearmost point in each 5 mm band of height.
  const step = 0.005
  const bands = new Map<number, number>()
  for (const [y, z] of pts) {
    const b = Math.floor(y / step)
    bands.set(b, Math.min(bands.get(b) ?? Infinity, z))
  }
  const keys = [...bands.keys()].sort((a, b) => b - a)
  let len = 0
  let prev: [number, number] = [nape[1], nape[2]]
  for (const b of keys) {
    const cur: [number, number] = [(b + 0.5) * step, bands.get(b)!]
    len += Math.hypot(cur[0] - prev[0], cur[1] - prev[1])
    prev = cur
  }
  len += Math.abs(prev[0] - waistY)
  return len * 1000
}

export { torsoGirth }
