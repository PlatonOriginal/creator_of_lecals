/**
 * Tape-measure style measurements on a body mesh (metres, y up, x across the
 * body, z towards the front), the way a sewist would take them:
 * a girth is the length of a tape around the horizontal cross-section of the
 * torso, i.e. the perimeter of its convex hull (the tape bridges hollows).
 */

export interface MeshLike {
  vertices: Float32Array
  faces: Uint16Array | Uint32Array
  /** Faces sorted into height bands, for quick horizontal cuts (see indexMesh). */
  yIndex?: YIndex
}

export interface YIndex {
  y0: number
  step: number
  /** Face numbers (triangle index, not ×3) of the faces that reach into each band. */
  bands: Uint32Array[]
}

/**
 * The same mesh with its faces sorted into 1 cm height bands, so a
 * horizontal cut looks at a few hundred faces instead of all of them.
 * Valid only while the vertices stay as they are.
 */
export function indexMesh(mesh: MeshLike, step = 0.01): MeshLike {
  const { vertices: v, faces: f } = mesh
  const { minY, maxY } = verticalExtent(v)
  const n = Math.max(1, Math.ceil((maxY - minY) / step) + 1)
  const lists: number[][] = Array.from({ length: n }, () => [])
  for (let t = 0; t < f.length / 3; t++) {
    const ya = v[f[3 * t]! * 3 + 1]!
    const yb = v[f[3 * t + 1]! * 3 + 1]!
    const yc = v[f[3 * t + 2]! * 3 + 1]!
    const lo = Math.floor((Math.min(ya, yb, yc) - minY) / step)
    const hi = Math.floor((Math.max(ya, yb, yc) - minY) / step)
    for (let b = lo; b <= hi; b++) lists[b]!.push(t)
  }
  return { vertices: v, faces: f, yIndex: { y0: minY, step, bands: lists.map((l) => Uint32Array.from(l)) } }
}

/** Lowest and highest point of the body. */
export function verticalExtent(vertices: Float32Array): { minY: number; maxY: number } {
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 1; i < vertices.length; i += 3) {
    const y = vertices[i]!
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minY, maxY }
}

/**
 * Cross-section of the mesh by the horizontal plane at height y, split into
 * connected pieces (torso, arms, legs…). Each piece is a list of [x, z] points.
 */
export function slicePieces({ vertices: v, faces: f, yIndex }: MeshLike, y: number): Float64Array[] {
  // Each crossed mesh edge gives one point; a triangle links its two points.
  const pointOf = new Map<number, number>()
  const xs: number[] = []
  const zs: number[] = []
  const parent: number[] = []
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!
    return i
  }
  const nV = v.length / 3
  const point = (p: number, q: number): number | undefined => {
    const yp = v[p * 3 + 1]! - y
    const yq = v[q * 3 + 1]! - y
    if (yp > 0 === yq > 0) return undefined
    const key = p < q ? p * nV + q : q * nV + p
    let id = pointOf.get(key)
    if (id === undefined) {
      const s = yp / (yp - yq)
      id = xs.length
      xs.push(v[p * 3]! + s * (v[q * 3]! - v[p * 3]!))
      zs.push(v[p * 3 + 2]! + s * (v[q * 3 + 2]! - v[p * 3 + 2]!))
      parent.push(id)
      pointOf.set(key, id)
    }
    return id
  }
  const cut = (t: number) => {
    const a = f[t]!
    const b = f[t + 1]!
    const c = f[t + 2]!
    const ya = v[a * 3 + 1]! > y
    if (ya === v[b * 3 + 1]! > y && ya === v[c * 3 + 1]! > y) return
    const ids = [point(a, b), point(b, c), point(c, a)].filter((i): i is number => i !== undefined)
    for (let k = 1; k < ids.length; k++) parent[find(ids[k]!)] = find(ids[0]!)
  }
  if (yIndex) {
    const band = yIndex.bands[Math.floor((y - yIndex.y0) / yIndex.step)]
    if (band) for (const t of band) cut(t * 3)
  } else for (let t = 0; t < f.length; t += 3) cut(t)
  const groups = new Map<number, number[]>()
  for (let i = 0; i < xs.length; i++) {
    const r = find(i)
    const g = groups.get(r)
    if (g) g.push(i)
    else groups.set(r, [i])
  }
  return [...groups.values()].map((ids) => {
    const out = new Float64Array(ids.length * 2)
    ids.forEach((i, k) => {
      out[2 * k] = xs[i]!
      out[2 * k + 1] = zs[i]!
    })
    return out
  })
}

/** The piece of a slice that the body's centre line (x = 0) passes through, with the longest outline. */
export function centralPiece(pieces: Float64Array[]): Float64Array {
  let best: Float64Array = new Float64Array()
  let bestP = 0
  for (const piece of pieces) {
    let lo = Infinity
    let hi = -Infinity
    for (let k = 0; k < piece.length; k += 2) {
      lo = Math.min(lo, piece[k]!)
      hi = Math.max(hi, piece[k]!)
    }
    if (lo > 0 || hi < 0) continue
    const p = hullPerimeter(piece)
    if (p > bestP) {
      bestP = p
      best = piece
    }
  }
  return best
}

/** Perimeter of the convex hull of [x, z] points (monotone chain). */
export function hullPerimeter(points: Float64Array): number {
  const n = points.length / 2
  if (n < 3) return 0
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
  let p = 0
  for (let k = 0; k < hull.length; k++) {
    const a = hull[k]!
    const b = hull[(k + 1) % hull.length]!
    p += Math.hypot(points[2 * b]! - points[2 * a]!, points[2 * b + 1]! - points[2 * a + 1]!)
  }
  return p
}

/** Torso girth at height y, metres (0 if the plane misses the torso). */
export function torsoGirth(mesh: MeshLike, y: number): number {
  return hullPerimeter(centralPiece(slicePieces(mesh, y)))
}

/** Torso girth and width across (x) at height y, metres. */
export function torsoSlice(mesh: MeshLike, y: number): { g: number; w: number } {
  const piece = centralPiece(slicePieces(mesh, y))
  let lo = 0
  let hi = 0
  for (let k = 0; k < piece.length; k += 2) {
    lo = Math.min(lo, piece[k]!)
    hi = Math.max(hi, piece[k]!)
  }
  return { g: hullPerimeter(piece), w: hi - lo }
}

export interface BodyLevels {
  /** Heights of the girth lines, metres in mesh coordinates. */
  bust: number
  waist: number
  hips: number
  /** Where the arms join the cross-section (the armpits). */
  armpit?: number
  /** Lowest height where the cut is one torso piece (the crotch). */
  crotch?: number
}

export interface BodyMeasures {
  /** All in millimetres. */
  height: number
  bust: number
  waist: number
  hips: number
}

/**
 * Finds the girth lines by scanning the torso from the crotch up, in steps
 * of 1 % of body height, then refining each line to 0.2 %:
 * - hips: the fullest girth in the lower part of the torso;
 * - waist: the narrowest girth above it;
 * - bust: the fullest girth above the waist, below the armpits (where the
 *   arms join the cross-section and the girth jumps).
 */
export function findLevels(input: MeshLike): BodyLevels {
  const mesh = input.yIndex ? input : indexMesh(input)
  const { minY, maxY } = verticalExtent(mesh.vertices)
  const H = maxY - minY
  const profile: { y: number; g: number; w: number }[] = []
  for (let y = minY + 0.4 * H; y <= minY + 0.82 * H; y += 0.01 * H) profile.push({ y, ...torsoSlice(mesh, y) })

  const crotch = profile.findIndex((p) => p.g > 0)
  if (crotch < 0) throw new Error('Не найдено туловище на сетке')
  let armpit = profile.length
  for (let i = crotch + 1; i < profile.length; i++)
    // The arms join the cut: it suddenly gets much wider (a fuller bust makes it deeper, not wider).
    if (profile[i]!.w > profile[i - 1]!.w * 1.25 && profile[i]!.y > minY + 0.6 * H) {
      armpit = i
      break
    }

  const argBest = (from: number, to: number, better: (a: number, b: number) => boolean) => {
    let best = from
    for (let i = from; i < to; i++) if (better(profile[i]!.g, profile[best]!.g)) best = i
    return best
  }
  // Skip the first slices: right above the crotch the cut is not a full girth yet.
  const lowTop = profile.findIndex((p) => p.y > minY + 0.58 * H)
  const hips = argBest(crotch + 2, lowTop, (a, b) => a > b)
  const waist = argBest(hips + 1, armpit, (a, b) => a < b)
  const bust = argBest(waist + 1, armpit, (a, b) => a > b)
  // Refine each line around the coarse 1 % step, staying below the armpits.
  const top = armpit < profile.length ? profile[armpit]!.y : maxY
  const refine = (i: number, better: (a: number, b: number) => boolean) => {
    let bestY = profile[i]!.y
    let bestG = profile[i]!.g
    for (let y = bestY - 0.01 * H; y <= bestY + 0.01 * H; y += 0.002 * H) {
      if (y >= top - 0.002 * H) break
      const { g, w } = torsoSlice(mesh, y)
      // A jump in width means the cut has reached the armpits and caught the arms.
      if (w > profile[i]!.w * 1.2) break
      if (g > 0 && better(g, bestG)) {
        bestG = g
        bestY = y
      }
    }
    return bestY
  }
  const waistY = refine(waist, (a, b) => a < b)
  return {
    hips: refine(hips, (a, b) => a > b),
    waist: waistY,
    bust: bustLine(mesh, profile[bust]!.y, waistY, top),
    armpit: top,
    crotch: profile[crotch]!.y,
  }
}

/**
 * Ог3 goes through the bust points: the most forward point of the chest.
 * On a slim figure the fullest girth is up under the arms (the back is
 * wide there), so the fullest girth is only the fallback.
 */
function bustLine(mesh: MeshLike, fullest: number, waistY: number, armpitY: number): number {
  const lo = waistY + 0.6 * (armpitY - waistY) - 0.1 * (armpitY - waistY)
  let best = fullest
  let bestZ = -Infinity
  for (let y = lo; y < armpitY - 0.01; y += 0.0025) {
    const p = centralPiece(slicePieces(mesh, y))
    let z = -Infinity
    for (let k = 1; k < p.length; k += 2) z = Math.max(z, p[k]!)
    if (z > bestZ + 1e-4) {
      bestZ = z
      best = y
    }
  }
  return best
}

export function measureBody(mesh: MeshLike, levels: BodyLevels = findLevels(mesh)): BodyMeasures {
  const { minY, maxY } = verticalExtent(mesh.vertices)
  return {
    height: (maxY - minY) * 1000,
    bust: torsoGirth(mesh, levels.bust) * 1000,
    waist: torsoGirth(mesh, levels.waist) * 1000,
    hips: torsoGirth(mesh, levels.hips) * 1000,
  }
}
