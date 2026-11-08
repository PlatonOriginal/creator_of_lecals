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

export function bezierLength(a: Vec, c1: Vec, c2: Vec, b: Vec, n = 200): number {
  let len = 0
  let p = a
  for (let i = 1; i <= n; i++) {
    const q = bezier(a, c1, c2, b, i / n)
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
