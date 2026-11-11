import {
  Line,
  add,
  along,
  angleBetween,
  dist,
  mid,
  mul,
  norm,
  poly,
  reflect,
  rotate,
  signedArea,
  sub,
  v,
  type Vec,
} from '../draft/geom'
import type { BBox, PieceLabel, PiecePath, Piece } from '../geometry'
import { edgeLengths, fishLine, outlineOf, type Edge, type Panel } from './panel'

/**
 * Seam and hem allowances, mm. `byEdge` overrides by edge name (neck, cap…).
 * Fold edges never get an allowance.
 */
export interface Allowances {
  seam: number
  hem: number
  byEdge?: Record<string, number>
}

export const DEFAULT_ALLOWANCES: Allowances = { seam: 10, hem: 30, byEdge: { neck: 7 } }

export function allowanceOf(e: Edge, a: Allowances): number {
  if (e.kind === 'fold') return 0
  const own = a.byEdge?.[e.id]
  if (own !== undefined) return own
  return e.kind === 'hem' ? a.hem : a.seam
}

/** Edge names that get a notch where a construction level (waist, hip…) crosses them. */
const LEVEL_NOTCH_EDGES = new Set(['side', 'princess', 'cb', 'inseam'])
const LEVEL_NOTCH_LEVELS = ['waist', 'hip', 'knee'] as const

interface OffSeg {
  p: Vec
  q: Vec
  /** A line given by two points only (dart caps, mirrored corners): no miter limit. */
  free?: boolean
}

const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x

function intersect(s: OffSeg, t: OffSeg): Vec | undefined {
  const r = sub(s.q, s.p)
  const u = sub(t.q, t.p)
  const d = cross(r, u)
  if (Math.abs(d) < 1e-9 * Math.hypot(r.x, r.y) * Math.hypot(u.x, u.y)) return undefined
  const k = cross(sub(t.p, s.p), u) / d
  return add(s.p, mul(r, k))
}

function dedupe(pts: Vec[]): Vec[] {
  const out: Vec[] = []
  for (const p of pts) if (!out.length || dist(out[out.length - 1]!, p) > 0.05) out.push(p)
  return out
}

/** Outward normal of direction d for a loop of the given orientation. */
const outward = (d: Vec, ccw: boolean): Vec => {
  const n = norm(d)
  return ccw ? v(n.y, -n.x) : v(-n.y, n.x)
}

function edgeOffsets(e: Edge, a: number, ccw: boolean): OffSeg[] {
  const pts = dedupe(e.line.points(16))
  const out: OffSeg[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const u = pts[i]!
    const w = pts[i + 1]!
    const n = mul(outward(sub(w, u), ccw), a)
    out.push({ p: add(u, n), q: add(w, n) })
  }
  return out
}

const reflectSeg = (s: OffSeg, a: Vec, b: Vec): OffSeg => ({ p: reflect(s.p, a, b), q: reflect(s.q, a, b), free: true })
const rotateSeg = (s: OffSeg, deg: number, c: Vec): OffSeg => ({ p: rotate(s.p, deg, c), q: rotate(s.q, deg, c), free: true })

/** Dart apex where the stitching stops (shortened along the bisector). */
export function dartTip(leg1: Edge, leg2: Edge): Vec {
  const T = leg1.line.end
  const s = leg1.dart?.shorten ?? 0
  if (!s) return T
  const m = mid(leg1.line.start, leg2.line.end)
  return along(T, m, s)
}

/**
 * The cut line around the piece: every edge offset by its allowance, corners
 * extended until they meet, mirrored corners at the hem, and the allowance
 * over each dart shaped so that it lies flat when the dart is pressed.
 */
export function cutLine(panel: Panel, allow: Allowances): Vec[] {
  const ccw = signedArea(outlineOf(panel).points(8)) > 0
  const edges = panel.edges
  const n = edges.length
  const groups: OffSeg[][] = []
  for (let i = 0; i < n; i++) {
    const e = edges[i]!
    if (e.kind === 'dart') {
      if (e.dart?.leg !== 1) continue
      const leg2 = edges[(i + 1) % n]!
      const A = edges[(i - 1 + n) % n]!
      const B = edges[(i + 2) % n]!
      const M1 = e.line.start
      const T = e.line.end
      const M2 = leg2.line.end
      const theta = angleBetween(sub(M1, T), sub(M2, T))
      const press = e.dart.press
      if (Math.abs(theta) < 0.3) {
        continue
      }
      if (press === 'b') {
        const aB = allowanceOf(B, allow)
        const t = B.line.tangentAt(0, 0)
        const nB = mul(outward(t, ccw), aB)
        const LB: OffSeg = { p: add(M2, nB), q: add(add(M2, nB), mul(t, 10)) }
        groups.push([rotateSeg(LB, -theta, T), reflectSeg(LB, T, M2)])
      } else {
        const aA = allowanceOf(A, allow)
        const last = A.line.segs.length - 1
        const t = A.line.tangentAt(last, 1)
        const nA = mul(outward(t, ccw), aA)
        const LA: OffSeg = { p: add(add(M1, nA), mul(t, -10)), q: add(M1, nA) }
        groups.push([reflectSeg(LA, T, M1), rotateSeg(LA, theta, T)])
      }
      continue
    }
    groups.push(edgeOffsets(e, allowanceOf(e, allow), ccw))
    // Mirrored corner where a seam meets the hem: the folded-up hem allowance
    // must follow the seam allowance.
    const next = edges[(i + 1) % n]!
    const prevE = edges[(i - 1 + n) % n]!
    const aE = allowanceOf(e, allow)
    const square = (d1: Vec, d2: Vec) => Math.abs(Math.abs(angleBetween(d1, d2)) - 90) < 3
    if (e.kind === 'seam' && next.kind === 'hem' && aE > 0 && allowanceOf(next, allow) > 0 &&
        !square(e.line.tangentAt(e.line.segs.length - 1, 1), next.line.tangentAt(0, 0))) {
      const last = groups[groups.length - 1]!
      const hemDir = next.line.tangentAt(0, 0)
      const H0 = next.line.start
      groups.push([reflectSeg(last[last.length - 1]!, H0, add(H0, hemDir))])
    }
    if (e.kind === 'seam' && prevE.kind === 'hem' && aE > 0 && allowanceOf(prevE, allow) > 0 &&
        !square(e.line.tangentAt(0, 0), prevE.line.tangentAt(prevE.line.segs.length - 1, 1))) {
      const first = groups[groups.length - 1]![0]!
      const ls = prevE.line.segs.length - 1
      const hemDir = prevE.line.tangentAt(ls, 1)
      const H1 = prevE.line.end
      // Insert before this edge's offsets.
      groups.splice(groups.length - 1, 0, [reflectSeg(first, H1, add(H1, hemDir))])
    }
  }

  const segs = groups.flat()
  const out: Vec[] = []
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k]!
    const t = segs[(k + 1) % segs.length]!
    const x = intersect(s, t)
    const ends = [...(s.free ? [] : [s.q]), ...(t.free ? [] : [t.p])]
    if (!x) {
      out.push(...ends)
      continue
    }
    // Miter limit: a very sharp corner is cut off instead of a long spike.
    const ref = ends.length ? ends : [x]
    const d = Math.min(...ref.map((r) => dist(x, r)))
    const limit = s.free || t.free ? 150 : Math.max(25, 3 * Math.max(dist(s.p, s.q), dist(t.p, t.q)))
    if (d > limit) out.push(...ends)
    else out.push(x)
  }
  return removeLoops(dedupe(out))
}

/** Proper intersection of segments ab and cd, if any. */
function segX(a: Vec, b: Vec, c: Vec, d: Vec): Vec | undefined {
  const r = sub(b, a)
  const u = sub(d, c)
  const den = cross(r, u)
  if (Math.abs(den) < 1e-12) return undefined
  const t = cross(sub(c, a), u) / den
  const w = cross(sub(c, a), r) / den
  if (t <= 1e-9 || t >= 1 - 1e-9 || w <= 1e-9 || w >= 1 - 1e-9) return undefined
  return add(a, mul(r, t))
}

/**
 * Small self-intersection loops appear where an allowance is offset around a
 * tight concave bend or a cusp of the seam line; cut them out.
 */
function removeLoops(pts: Vec[], window = 40): Vec[] {
  const out = [...pts]
  for (let i = 0; i < out.length - 1; i++) {
    for (let j = Math.min(out.length - 2, i + window); j >= i + 2; j--) {
      const x = segX(out[i]!, out[i + 1]!, out[j]!, out[j + 1]!)
      if (x) {
        out.splice(i + 1, j - i, x)
        break
      }
    }
  }
  return out
}

/** Normal and allowance at a point of an edge, for notches. */
function edgeFrame(e: Edge, at: Vec, ccw: boolean): { p: Vec; n: Vec } {
  const pr = e.line.project(at)
  const { i, t } = e.line.locate(pr.s)
  return { p: pr.q, n: outward(e.line.tangentAt(i, t), ccw) }
}

export interface CutInfo {
  /** Model name for the label. */
  model?: string
  /** One line about the figure: «Рост 164, Ог 88, Об 96». */
  figure?: string
}

const cmText = (mm: number) => `${(Math.round(mm) / 10).toLocaleString('ru-RU')} см`

/** All notch positions of a panel: explicit ones, level crossings and dart mouths. */
export function notchesOf(panel: Panel): { edge: Edge; at: Vec; double?: boolean }[] {
  const out: { edge: Edge; at: Vec; double?: boolean }[] = []
  for (const nt of panel.notches) {
    const e = panel.edges
      .filter((x) => x.id === nt.edge && x.kind !== 'dart')
      .sort((a, b) => a.line.project(nt.at).d - b.line.project(nt.at).d)[0]
    if (e) out.push({ edge: e, at: nt.at, ...(nt.double ? { double: true } : {}) })
  }
  for (const lv of LEVEL_NOTCH_LEVELS) {
    const y = panel.levels[lv]
    if (y === undefined) continue
    for (const e of panel.edges) {
      if (e.kind !== 'seam' || !LEVEL_NOTCH_EDGES.has(e.id)) continue
      for (const c of e.line.crossings(v(0, y), v(1, 0))) {
        // Not at the very ends of the edge (corners need no notch).
        if (dist(c.at, e.line.start) > 15 && dist(c.at, e.line.end) > 15) out.push({ edge: e, at: c.at })
      }
    }
  }
  return out
}

/**
 * The piece ready to print: cut line with allowances, seam line dashed,
 * darts stitched to their shortened tips, notches, grain and labels.
 */
export function cutPiece(panel: Panel, allow: Allowances = DEFAULT_ALLOWANCES, info: CutInfo = {}): Piece {
  const ccw = signedArea(outlineOf(panel).points(8)) > 0
  const cut = cutLine(panel, allow)
  const paths: PiecePath[] = [{ role: 'cut', d: poly(cut).d(true) }]
  const marks: Line[] = []

  // Seam line, edge by edge; darts to the stitching tip.
  const seamParts: string[] = []
  const edges = panel.edges
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]!
    if (e.kind === 'fold') {
      paths.push({ role: 'fold', d: e.line.d() })
      continue
    }
    if (e.kind === 'dart') {
      if (e.dart?.leg !== 1) continue
      const leg2 = edges[(i + 1) % edges.length]!
      const tip = dartTip(e, leg2)
      seamParts.push(poly([e.line.start, tip, leg2.line.end]).d())
      // Notches at the dart mouths along the legs, a cross at the tip.
      const a = allowanceOf(edges[(i - 1 + edges.length) % edges.length]!, allow)
      for (const m of [e.line.start, leg2.line.end]) {
        const u = norm(sub(m, e.line.end))
        marks.push(new Line(add(m, mul(u, a))).to(add(m, mul(u, Math.max(0, a - 6)))))
      }
      marks.push(...crossAt(tip, 3))
      continue
    }
    seamParts.push(e.line.d())
  }
  paths.push({ role: 'seam', d: seamParts.join(' ') })
  for (const f of panel.fish) {
    paths.push({ role: 'seam', d: fishLine(f).d() })
    marks.push(...crossAt(f.top, 3), ...crossAt(f.bottom, 3))
  }

  for (const nt of notchesOf(panel)) {
    const a = allowanceOf(nt.edge, allow)
    const { p, n } = edgeFrame(nt.edge, nt.at, ccw)
    const tan = v(-n.y, n.x)
    const offs = nt.double ? [-2.5, 2.5] : [0]
    for (const o of offs) {
      const b = add(p, mul(tan, o))
      marks.push(a > 0 ? new Line(add(b, mul(n, a))).to(add(b, mul(n, Math.max(0, a - 6)))) : new Line(b).to(add(b, mul(n, -5))))
    }
  }

  for (const m of panel.marks) paths.push({ role: m.role, d: m.line.d() })
  for (const m of marks) paths.push({ role: 'mark', d: m.d() })
  paths.push({ role: 'grain', d: grainArrow(panel.grain[0], panel.grain[1]).d() })

  const L = panel.labelAt
  const lines: string[] = []
  if (info.model) lines.push(info.model)
  lines.push(panel.method)
  if (info.figure) lines.push(info.figure)
  const byEdge = Object.entries(allow.byEdge ?? {}).filter(([id]) => panel.edges.some((e) => e.id === id))
  lines.push(
    `Припуски: швы ${cmText(allow.seam)}, низ ${cmText(allow.hem)}` +
      byEdge.map(([id, mm]) => `, ${EDGE_TITLES[id] ?? id} ${cmText(mm)}`).join(''),
  )
  const labels: PieceLabel[] = [
    { x: L.x, y: L.y, text: panel.title, size: 7 },
    { x: L.x, y: L.y + 12, text: panel.cut, size: 5 },
    ...lines.map((text, k) => ({ x: L.x, y: L.y + 22 + 9 * k, text, size: 4 })),
    ...panel.notes.map((nt) => ({ x: nt.at.x, y: nt.at.y, text: nt.text, size: nt.size ?? 5 })),
  ]

  const bbox: BBox = {
    minX: Math.min(...cut.map((q) => q.x)),
    minY: Math.min(...cut.map((q) => q.y)),
    maxX: Math.max(...cut.map((q) => q.x)),
    maxY: Math.max(...cut.map((q) => q.y)),
  }
  for (const l of labels) {
    bbox.maxX = Math.max(bbox.maxX, l.x + l.text.length * l.size * 0.55)
    bbox.minY = Math.min(bbox.minY, l.y - l.size)
  }
  return { id: panel.id, title: panel.title, paths, labels, bbox, seams: edgeLengths(panel) }
}

export const EDGE_TITLES: Record<string, string> = {
  neck: 'горловина',
  shoulder: 'плечо',
  armhole: 'пройма',
  side: 'бок',
  hem: 'низ',
  cb: 'середина спинки',
  cf: 'середина переда',
  waist: 'талия',
  princess: 'рельеф',
  cap: 'окат',
  seamFront: 'шов рукава',
  seamBack: 'шов рукава',
  inseam: 'шаговый',
  crotch: 'средний шов',
}

function crossAt(p: Vec, r: number): Line[] {
  return [new Line(v(p.x - r, p.y)).to(v(p.x + r, p.y)), new Line(v(p.x, p.y - r)).to(v(p.x, p.y + r))]
}

function grainArrow(a: Vec, b: Vec): Line {
  const s = 6
  const u = norm(sub(b, a))
  const nn = v(-u.y, u.x)
  const head = (p: Vec, dir: Vec) =>
    new Line(add(p, add(mul(dir, s), mul(nn, s / 2)))).to(p).to(add(p, sub(mul(dir, s), mul(nn, s / 2))))
  return new Line(a).to(b).append(head(b, mul(u, -1))).append(new Line(b).to(a)).append(head(a, u))
}
