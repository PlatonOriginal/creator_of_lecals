import type { BBox, PathRole, Piece, PieceLabel, PiecePath } from '../geometry'

/**
 * A small drafting kit for the base blocks (stage M2).
 *
 * Textbook constructions are rulers, perpendiculars, arcs and smooth curves
 * through given points, so a block is easiest to check against a hand
 * calculation when it is written in exactly those terms. Everything is in mm,
 * y points down (as in SVG and on a drafting table with the waist at the top).
 */
export interface Vec {
  x: number
  y: number
}

export const v = (x: number, y: number): Vec => ({ x, y })
export const add = (a: Vec, b: Vec): Vec => v(a.x + b.x, a.y + b.y)
export const sub = (a: Vec, b: Vec): Vec => v(a.x - b.x, a.y - b.y)
export const mul = (a: Vec, k: number): Vec => v(a.x * k, a.y * k)
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y)
export const lerp = (a: Vec, b: Vec, t: number): Vec => v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
export const mid = (a: Vec, b: Vec): Vec => lerp(a, b, 0.5)
export const norm = (a: Vec): Vec => {
  const l = Math.hypot(a.x, a.y)
  return l === 0 ? v(0, 0) : v(a.x / l, a.y / l)
}
/** Point at distance `d` from `a` towards `b` (beyond `b` if d > |ab|). */
export const along = (a: Vec, b: Vec, d: number): Vec => add(a, mul(norm(sub(b, a)), d))
/** Rotate around the origin by `deg` degrees (clockwise on screen, since y points down). */
export const rotate = (p: Vec, deg: number, c: Vec = v(0, 0)): Vec => {
  const r = (deg * Math.PI) / 180
  const d = sub(p, c)
  return v(c.x + d.x * Math.cos(r) - d.y * Math.sin(r), c.y + d.x * Math.sin(r) + d.y * Math.cos(r))
}

/** Intersection of the infinite lines a1a2 and b1b2. */
export function lineX(a1: Vec, a2: Vec, b1: Vec, b2: Vec): Vec {
  const d = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x)
  if (Math.abs(d) < 1e-12) throw new Error('lines are parallel')
  const t = ((a1.x - b1.x) * (b1.y - b2.y) - (a1.y - b1.y) * (b1.x - b2.x)) / d
  return lerp(a1, a2, t)
}

/** Point of line ab at the given x (or y). */
export const atX = (a: Vec, b: Vec, x: number): Vec => lineX(a, b, v(x, 0), v(x, 1))
export const atY = (a: Vec, b: Vec, y: number): Vec => lineX(a, b, v(0, y), v(1, y))

/**
 * Intersection of two circles (the compass step «засечка из A радиусом r1 и из
 * B радиусом r2»). Of the two solutions returns the one on the side picked by
 * `pick` (it receives both and returns the wanted one).
 */
export function circlesX(a: Vec, r1: number, b: Vec, r2: number, pick: (p: Vec, q: Vec) => Vec): Vec {
  const d = dist(a, b)
  if (d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9 || d === 0) throw new Error('circles do not meet')
  const k = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, r1 * r1 - k * k))
  const m = along(a, b, k)
  const n = norm(sub(b, a))
  return pick(v(m.x - n.y * h, m.y + n.x * h), v(m.x + n.y * h, m.y - n.x * h))
}

// ---------------------------------------------------------------------------
// Paths

export type Seg = { kind: 'L'; to: Vec } | { kind: 'C'; c1: Vec; c2: Vec; to: Vec }

/** An open polyline of lines and cubic Bézier curves. */
export class Line {
  readonly start: Vec
  readonly segs: Seg[] = []
  constructor(start: Vec) {
    this.start = start
  }
  get end(): Vec {
    return this.segs.length ? this.segs[this.segs.length - 1]!.to : this.start
  }
  to(p: Vec): this {
    this.segs.push({ kind: 'L', to: p })
    return this
  }
  curve(c1: Vec, c2: Vec, p: Vec): this {
    this.segs.push({ kind: 'C', c1, c2, to: p })
    return this
  }
  /**
   * Smooth curve to `p` leaving the current end in direction `dirA` and
   * arriving at `p` in direction `dirB` (directions need not be unit).
   * Control arms are a third of the chord, the usual "lekalo" curve.
   */
  smooth(dirA: Vec, dirB: Vec, p: Vec, k = 1 / 3): this {
    const a = this.end
    const c = dist(a, p) * k
    return this.curve(add(a, mul(norm(dirA), c)), sub(p, mul(norm(dirB), c)), p)
  }
  append(other: Line): this {
    if (dist(this.end, other.start) > 1e-6) this.to(other.start)
    this.segs.push(...other.segs)
    return this
  }
  /** Samples along the path, including both ends. */
  points(perCurve = 32): Vec[] {
    const out = [this.start]
    let a = this.start
    for (const s of this.segs) {
      if (s.kind === 'L') out.push(s.to)
      else for (let i = 1; i <= perCurve; i++) out.push(bezier(a, s.c1, s.c2, s.to, i / perCurve))
      a = s.to
    }
    return out
  }
  length(): number {
    let a = this.start
    let len = 0
    for (const s of this.segs) {
      len += s.kind === 'L' ? dist(a, s.to) : bezierLength(a, s.c1, s.c2, s.to)
      a = s.to
    }
    return len
  }
  reversed(): Line {
    const pts: Vec[] = [this.start, ...this.segs.map((s) => s.to)]
    const r = new Line(this.end)
    for (let i = this.segs.length - 1; i >= 0; i--) {
      const s = this.segs[i]!
      const to = pts[i]!
      if (s.kind === 'L') r.to(to)
      else r.curve(s.c2, s.c1, to)
    }
    return r
  }
  map(f: (p: Vec) => Vec): Line {
    const r = new Line(f(this.start))
    for (const s of this.segs) {
      if (s.kind === 'L') r.to(f(s.to))
      else r.curve(f(s.c1), f(s.c2), f(s.to))
    }
    return r
  }
  /** Start point of segment i. */
  segStart(i: number): Vec {
    return i === 0 ? this.start : this.segs[i - 1]!.to
  }
  /** Lengths of the segments. */
  segLengths(): number[] {
    return this.segs.map((s, i) => {
      const a = this.segStart(i)
      return s.kind === 'L' ? dist(a, s.to) : bezierLength(a, s.c1, s.c2, s.to, 64)
    })
  }
  /** Location (segment index and parameter) at arc length d from the start. */
  locate(d: number): { i: number; t: number } {
    const lens = this.segLengths()
    let acc = 0
    for (let i = 0; i < lens.length; i++) {
      const l = lens[i]!
      if (d <= acc + l || i === lens.length - 1) {
        const s = this.segs[i]!
        const local = Math.min(Math.max(d - acc, 0), l)
        if (s.kind === 'L' || l === 0) return { i, t: l === 0 ? 0 : local / l }
        return { i, t: bezierTAtLength(this.segStart(i), s.c1, s.c2, s.to, local) }
      }
      acc += l
    }
    return { i: 0, t: 0 }
  }
  pointAt(i: number, t: number): Vec {
    const s = this.segs[i]
    if (!s) return this.start
    const a = this.segStart(i)
    return s.kind === 'L' ? lerp(a, s.to, t) : bezier(a, s.c1, s.c2, s.to, t)
  }
  /** Unit tangent at segment i, parameter t. */
  tangentAt(i: number, t: number): Vec {
    const s = this.segs[i]
    if (!s) return v(1, 0)
    const a = this.segStart(i)
    if (s.kind === 'L') return norm(sub(s.to, a))
    const d = bezierDeriv(a, s.c1, s.c2, s.to, t)
    if (Math.hypot(d.x, d.y) > 1e-9) return norm(d)
    return norm(sub(s.to, a))
  }
  pointAtLength(d: number): Vec {
    const { i, t } = this.locate(d)
    return this.pointAt(i, t)
  }
  /** Split at segment i, parameter t: [head, tail]. */
  splitAt(i: number, t: number): [Line, Line] {
    const head = new Line(this.start)
    head.segs.push(...this.segs.slice(0, i))
    const s = this.segs[i]
    if (!s) return [head, new Line(this.end)]
    const a = this.segStart(i)
    let tail: Line
    if (s.kind === 'L') {
      const m = lerp(a, s.to, t)
      if (t > 0) head.to(m)
      tail = new Line(m)
      if (t < 1) tail.to(s.to)
    } else {
      const [h, k] = splitBezier(a, s.c1, s.c2, s.to, t)
      if (t > 0) head.curve(h[1], h[2], h[3])
      tail = new Line(k[0])
      if (t < 1) tail.curve(k[1], k[2], k[3])
    }
    tail.segs.push(...this.segs.slice(i + 1))
    return [head, tail]
  }
  splitAtLength(d: number): [Line, Line] {
    const { i, t } = this.locate(d)
    return this.splitAt(i, t)
  }
  /** Part between arc lengths d0 < d1. */
  slice(d0: number, d1: number): Line {
    const [, tail] = this.splitAtLength(d0)
    return tail.splitAtLength(d1 - d0)[0]
  }
  /** Nearest point of the line to p: arc length from the start and the distance. */
  project(p: Vec, samples = 48): { s: number; q: Vec; d: number } {
    let best = { s: 0, q: this.start, d: dist(p, this.start) }
    let acc = 0
    const lens = this.segLengths()
    this.segs.forEach((seg, i) => {
      const a = this.segStart(i)
      const n = seg.kind === 'L' ? 1 : samples
      // Coarse search, then refine around the best sample.
      let bt = 0
      let bd = Infinity
      for (let k = 0; k <= n; k++) {
        const q = this.pointAt(i, k / n)
        const dd = dist(p, q)
        if (dd < bd) {
          bd = dd
          bt = k / n
        }
      }
      if (seg.kind === 'L') {
        const ab = sub(seg.to, a)
        const l2 = ab.x * ab.x + ab.y * ab.y
        bt = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2))
      } else {
        let lo = Math.max(0, bt - 1 / n)
        let hi = Math.min(1, bt + 1 / n)
        for (let k = 0; k < 30; k++) {
          const m1 = lo + (hi - lo) / 3
          const m2 = hi - (hi - lo) / 3
          if (dist(p, this.pointAt(i, m1)) < dist(p, this.pointAt(i, m2))) hi = m2
          else lo = m1
        }
        bt = (lo + hi) / 2
      }
      const q = this.pointAt(i, bt)
      const dd = dist(p, q)
      if (dd < best.d) {
        const sAt = seg.kind === 'L' ? bt * lens[i]! : bezierLength(a, seg.c1, seg.c2, seg.to, 64, bt)
        best = { s: acc + sAt, q, d: dd }
      }
      acc += lens[i]!
    })
    return best
  }
  /**
   * Where the line crosses the infinite line through `p` with direction `dir`:
   * locations sorted along this line.
   */
  crossings(p: Vec, dir: Vec): { i: number; t: number; at: Vec }[] {
    const n = v(-dir.y, dir.x)
    const side = (q: Vec) => (q.x - p.x) * n.x + (q.y - p.y) * n.y
    const out: { i: number; t: number; at: Vec }[] = []
    this.segs.forEach((seg, i) => {
      const steps = seg.kind === 'L' ? 1 : 32
      let t0 = 0
      let f0 = side(this.pointAt(i, 0))
      for (let k = 1; k <= steps; k++) {
        const t1 = k / steps
        const f1 = side(this.pointAt(i, t1))
        if ((f0 < 0 && f1 >= 0) || (f0 > 0 && f1 <= 0) || (f0 === 0 && k === 1 && i === 0)) {
          let lo = t0
          let hi = t1
          let flo = f0
          for (let it = 0; it < 40 && f0 !== 0; it++) {
            const m = (lo + hi) / 2
            const fm = side(this.pointAt(i, m))
            if ((flo < 0) === (fm < 0)) {
              lo = m
              flo = fm
            } else hi = m
          }
          const t = f0 === 0 ? t0 : (lo + hi) / 2
          if (!out.some((o) => o.i === i && Math.abs(o.t - t) < 1e-6)) out.push({ i, t, at: this.pointAt(i, t) })
        }
        t0 = t1
        f0 = f1
      }
    })
    return out
  }
  d(close = false): string {
    const f = (p: Vec) => `${round(p.x)},${round(p.y)}`
    let s = `M ${f(this.start)}`
    for (const g of this.segs) s += g.kind === 'L' ? ` L ${f(g.to)}` : ` C ${f(g.c1)} ${f(g.c2)} ${f(g.to)}`
    return close ? `${s} Z` : s
  }
}

const round = (n: number) => Math.round(n * 100) / 100

export function bezier(a: Vec, c1: Vec, c2: Vec, b: Vec, t: number): Vec {
  const u = 1 - t
  return v(
    u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
    u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
  )
}

export function bezierDeriv(a: Vec, c1: Vec, c2: Vec, b: Vec, t: number): Vec {
  const u = 1 - t
  return v(
    3 * u * u * (c1.x - a.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (b.x - c2.x),
    3 * u * u * (c1.y - a.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (b.y - c2.y),
  )
}

/** De Casteljau split of a cubic at t. */
export function splitBezier(a: Vec, c1: Vec, c2: Vec, b: Vec, t: number): [[Vec, Vec, Vec, Vec], [Vec, Vec, Vec, Vec]] {
  const p01 = lerp(a, c1, t)
  const p12 = lerp(c1, c2, t)
  const p23 = lerp(c2, b, t)
  const p012 = lerp(p01, p12, t)
  const p123 = lerp(p12, p23, t)
  const m = lerp(p012, p123, t)
  return [
    [a, p01, p012, m],
    [m, p123, p23, b],
  ]
}

/** Parameter t at which the cubic has arc length `len` from its start. */
export function bezierTAtLength(a: Vec, c1: Vec, c2: Vec, b: Vec, len: number, n = 128): number {
  let acc = 0
  let p = a
  for (let i = 1; i <= n; i++) {
    const q = bezier(a, c1, c2, b, i / n)
    const d = dist(p, q)
    if (acc + d >= len) return (i - 1 + (d === 0 ? 0 : (len - acc) / d)) / n
    acc += d
    p = q
  }
  return 1
}

export function bezierLength(a: Vec, c1: Vec, c2: Vec, b: Vec, n = 200, upTo = 1): number {
  let len = 0
  let p = a
  for (let i = 1; i <= n; i++) {
    const q = bezier(a, c1, c2, b, (i / n) * upTo)
    len += dist(p, q)
    p = q
  }
  return len
}

/**
 * Smooth curve through all given points (Catmull-Rom converted to cubic
 * Béziers), optionally with fixed directions at the ends. This is how a
 * textbook "плавная кривая через точки" is drawn with a French curve.
 */
export function through(pts: Vec[], startDir?: Vec, endDir?: Vec): Line {
  const line = new Line(pts[0]!)
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1]
    const p1 = pts[i]!
    const p2 = pts[i + 1]!
    const p3 = pts[i + 2]
    const c = dist(p1, p2) / 3
    const t1 = i === 0 && startDir ? norm(startDir) : norm(sub(p2, p0 ?? p1))
    const t2 = i === pts.length - 2 && endDir ? norm(endDir) : norm(sub(p3 ?? p2, p1))
    line.curve(add(p1, mul(t1, c)), sub(p2, mul(t2, c)), p2)
  }
  return line
}

// ---------------------------------------------------------------------------
// Pieces

export interface PieceDraft {
  id: string
  title: string
  /** Closed outline along the seam line (net, without allowances). */
  outline: Line
  /** Extra lines: darts, grain, fold, construction lines. */
  extra?: { role: PathRole; line: Line }[]
  /** Fold edge, if the piece is cut on the fold. */
  fold?: [Vec, Vec]
  grain: [Vec, Vec]
  labels: { at: Vec; text: string; size?: number }[]
  seams: Record<string, number>
}

function arrow(a: Vec, b: Vec): Line {
  const s = 6
  const u = norm(sub(b, a))
  const n = v(-u.y, u.x)
  const head = (p: Vec, dir: Vec) =>
    new Line(add(p, add(mul(dir, s), mul(n, s / 2)))).to(p).to(add(p, sub(mul(dir, s), mul(n, s / 2))))
  return new Line(a).to(b).append(head(b, mul(u, -1))).append(new Line(b).to(a)).append(head(a, u))
}

export function toPiece(p: PieceDraft): Piece {
  const paths: PiecePath[] = [{ role: 'net', d: p.outline.d(true) }]
  for (const e of p.extra ?? []) paths.push({ role: e.role, d: e.line.d() })
  if (p.fold) paths.push({ role: 'fold', d: new Line(p.fold[0]).to(p.fold[1]).d() })
  paths.push({ role: 'grain', d: arrow(p.grain[0], p.grain[1]).d() })
  const labels: PieceLabel[] = p.labels.map((l) => ({ x: l.at.x, y: l.at.y, text: l.text, size: l.size ?? 5 }))
  const all = [p.outline, ...(p.extra ?? []).map((e) => e.line)].flatMap((l) => l.points(16))
  const bbox: BBox = {
    minX: Math.min(...all.map((q) => q.x)),
    minY: Math.min(...all.map((q) => q.y)),
    maxX: Math.max(...all.map((q) => q.x)),
    maxY: Math.max(...all.map((q) => q.y)),
  }
  // Leave room for labels that stick out of the outline.
  for (const l of labels) {
    bbox.maxX = Math.max(bbox.maxX, l.x + l.text.length * l.size * 0.55)
    bbox.minY = Math.min(bbox.minY, l.y - l.size)
  }
  return { id: p.id, title: p.title, paths, labels, bbox, seams: p.seams }
}

/** Mirror p about the line through a and b. */
export function reflect(p: Vec, a: Vec, b: Vec): Vec {
  const u = norm(sub(b, a))
  const d = sub(p, a)
  const t = d.x * u.x + d.y * u.y
  return sub(mul(add(a, mul(u, t)), 2), p)
}

/** Polyline through the points. */
export function poly(pts: Vec[]): Line {
  const l = new Line(pts[0]!)
  for (const p of pts.slice(1)) l.to(p)
  return l
}

/** Signed area of a closed polygon (positive when counter-clockwise in a y-up frame). */
export function signedArea(pts: Vec[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % pts.length]!
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

export function pointInPolygon(p: Vec, pts: Vec[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!
    const b = pts[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Signed angle from vector a to vector b, degrees (positive = clockwise on screen). */
export function angleBetween(a: Vec, b: Vec): number {
  return (Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y) * 180) / Math.PI
}
