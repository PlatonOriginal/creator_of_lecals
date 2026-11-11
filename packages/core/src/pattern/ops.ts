import {
  Line,
  add,
  angleBetween,
  dist,
  lineX,
  lerp,
  mid,
  mul,
  norm,
  pointInPolygon,
  rotate,
  sub,
  through,
  v,
  type Vec,
} from '../draft/geom'
import { clonePanel, outlineOf, type Edge, type FishDart, type Panel } from './panel'

/**
 * Modelling steps (приёмы моделирования) of stage M3. Each takes a panel and
 * returns a new one; the input is never changed. They find what they need by
 * the shared edge and dart names, so they work on blocks of any method.
 */

// ---------------------------------------------------------------------------
// Loop helpers

const near = (a: Vec, b: Vec, eps = 0.01) => dist(a, b) < eps

/** Index of the edge at position k of a loop of n edges. */
const at = (k: number, n: number) => ((k % n) + n) % n

/** Edges from index a forward to b, inclusive (cyclic). */
function chain(edges: Edge[], a: number, b: number): Edge[] {
  const out: Edge[] = []
  const n = edges.length
  for (let k = a; ; k++) {
    out.push(edges[at(k, n)]!)
    if (at(k, n) === at(b, n)) break
    if (out.length > n) break
  }
  return out
}

const mapEdge = (e: Edge, f: (p: Vec) => Vec): Edge => ({ ...e, line: e.line.map(f) })

/** Split edge i at arc length s; returns the new loop and the index of the second part. */
function splitEdge(edges: Edge[], i: number, s: number): { edges: Edge[]; second: number } {
  const e = edges[i]!
  const len = e.line.length()
  if (s <= 0.01) return { edges, second: i }
  if (s >= len - 0.01) return { edges, second: at(i + 1, edges.length) }
  const [h, t] = e.line.splitAtLength(s)
  const out = [...edges.slice(0, i), { ...e, line: h }, { ...e, line: t }, ...edges.slice(i + 1)]
  return { edges: out, second: i + 1 }
}

/** Join two lines that meet (up to a tiny gap) without a tiny bridging segment. */
function join(a: Line, b: Line): Line {
  const l = new Line(a.start)
  l.segs.push(...a.segs, ...b.segs)
  return l
}

/** Merge neighbouring seam edges with the same name into one edge. */
function mergeSame(edges: Edge[]): Edge[] {
  const out: Edge[] = []
  for (const e of edges) {
    const prev = out[out.length - 1]
    if (prev && prev.kind !== 'dart' && e.kind !== 'dart' && prev.id === e.id && prev.kind === e.kind && near(prev.line.end, e.line.start, 0.5)) {
      out[out.length - 1] = { ...prev, line: join(prev.line, e.line) }
    } else out.push(e)
  }
  // The loop may start in the middle of an edge.
  if (out.length > 1) {
    const f = out[0]!
    const l = out[out.length - 1]!
    if (f.kind !== 'dart' && l.kind !== 'dart' && f.id === l.id && f.kind === l.kind) {
      out[0] = { ...l, line: near(l.line.end, f.line.start, 0.5) ? join(l.line, f.line) : new Line(l.line.start).append(l.line).append(f.line) }
      out.pop()
    }
  }
  return out
}

/**
 * Bring the end of a line to p: a small gap moves the last point (a tiny
 * bridging piece would give the allowance a spike), a real gap gets a
 * straight piece.
 */
function bridge(l: Line, p: Vec) {
  const segs = l.segs
  const ls = segs[segs.length - 1]
  if (ls && near(l.end, p, 3) && dist(segs.length > 1 ? segs[segs.length - 2]!.to : l.start, p) > 1e-3) {
    const d = sub(p, ls.to)
    segs[segs.length - 1] = ls.kind === 'L' ? { kind: 'L', to: p } : { ...ls, c2: add(ls.c2, d), to: p }
  } else l.to(p)
}

/** Close tiny gaps between consecutive edges by snapping starts. */
function stitch(edges: Edge[]): Edge[] {
  const out: Edge[] = []
  for (let k = 0; k < edges.length; k++) {
    const e = edges[k]!
    const prev = out[out.length - 1]
    if (prev && !near(prev.line.end, e.line.start, 1e-6)) {
      if (near(prev.line.end, e.line.start, 0.5)) {
        const l = new Line(prev.line.end)
        const shifted = e.line.map((p) => p)
        l.segs.push(...shifted.segs)
        out.push({ ...e, line: l })
        continue
      }
      bridge(prev.line, e.line.start)
    }
    out.push(e)
  }
  const last = out[out.length - 1]
  if (last && out[0] && !near(last.line.end, out[0].line.start, 1e-6)) bridge(last.line, out[0].line.start)
  return out.filter((e) => e.line.segs.length > 0 && e.line.length() > 1e-3)
}

/** Panel geometry (points, marks…) rotated where it lies inside `region`. */
function moveInside(p: Panel, region: Vec[], f: (q: Vec) => Vec): void {
  const g = (q: Vec) => (pointInPolygon(q, region) ? f(q) : q)
  p.marks = p.marks.map((m) => ({ role: m.role, line: m.line.map(g) }))
  p.notes = p.notes.map((n) => ({ ...n, at: g(n.at) }))
  p.fish = p.fish.map((d) => ({ ...d, top: g(d.top), left: g(d.left), bottom: g(d.bottom), right: g(d.right) }))
  p.notches = p.notches.map((n) => ({ ...n, at: g(n.at) }))
}

function loopPoints(edges: Edge[]): Vec[] {
  return outlineOf({ edges }).points(12)
}

const hasCentre = (es: Edge[]) => es.some((e) => e.kind === 'fold' || e.id === 'cf' || e.id === 'cb' || e.id === 'crotch')

// ---------------------------------------------------------------------------
// Positions on the outline

/**
 * A point on the edges named `id`, at distance `d` (mm, or a fraction of the
 * whole length when 0 < d ≤ 1 and `frac`) from the end that touches an edge
 * named `from`. Returns the edge index and the arc length within that edge.
 */
export function positionOn(
  p: Panel,
  id: string,
  from: string,
  d: number,
  frac = false,
): { i: number; s: number; at: Vec } | undefined {
  const n = p.edges.length
  // Pieces of the named edge in loop order (dart legs between them allowed).
  const idx = p.edges.map((e, i) => (e.id === id && e.kind !== 'dart' ? i : -1)).filter((i) => i >= 0)
  if (!idx.length) return undefined
  // Order the pieces into one run: start at the piece whose previous
  // non-dart neighbour has another name.
  const prevNamed = (i: number) => {
    let k = at(i - 1, n)
    while (p.edges[k]!.kind === 'dart') k = at(k - 1, n)
    return p.edges[k]!
  }
  const first = idx.find((i) => prevNamed(i).id !== id) ?? idx[0]!
  const run: number[] = []
  for (let k = first; run.length < idx.length; k++) if (idx.includes(at(k, n))) run.push(at(k, n))
  const lens = run.map((i) => p.edges[i]!.line.length())
  const total = lens.reduce((a, b) => a + b, 0)
  const startTouches = prevNamed(run[0]!).id === from
  let s = frac ? d * total : d
  if (!startTouches) s = total - s
  s = Math.min(Math.max(s, 0.5), total - 0.5)
  for (let k = 0; k < run.length; k++) {
    if (s <= lens[k]! || k === run.length - 1) {
      const i = run[k]!
      const ss = Math.min(s, lens[k]!)
      return { i, s: ss, at: p.edges[i]!.line.pointAtLength(ss) }
    }
    s -= lens[k]!
  }
  return undefined
}

/** Where a vertical line x crosses the edges named `id`. */
export function crossingOn(p: Panel, id: string, x: number): { i: number; s: number; at: Vec } | undefined {
  for (let i = 0; i < p.edges.length; i++) {
    const e = p.edges[i]!
    if (e.id !== id || e.kind === 'dart') continue
    const c = e.line.crossings(v(x, 0), v(0, 1))[0]
    if (c) return { i, s: e.line.project(c.at).s, at: c.at }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Dart transfer (перевод вытачки)

/**
 * Moves the outline dart `dartId` (all of it, or `share` of it) to the point
 * `to` of the outline: the outline between the old and the new place turns
 * about the dart apex, closing the old dart and opening the new one.
 * The part that turns is the one without the centre front/back line.
 */
export function transferDart(panel: Panel, dartId: string, to: { i: number; s: number }, share = 1, newId?: string): Panel {
  const p = clonePanel(panel)
  let { edges } = p
  const i0 = edges.findIndex((e) => e.kind === 'dart' && e.dart?.id === dartId && e.dart.leg === 1)
  if (i0 < 0) return p
  const leg0 = edges[i0]!
  const T = leg0.line.end
  const split = splitEdge(edges, to.i, to.s)
  edges = split.edges
  const Q = edges[split.second]!.line.start
  const i = edges.findIndex((e) => e.kind === 'dart' && e.dart?.id === dartId && e.dart.leg === 1)
  const n = edges.length
  const leg1 = edges[i]!
  const leg2 = edges[at(i + 1, n)]!
  const M1 = leg1.line.start
  const M2 = leg2.line.end
  const theta = angleBetween(sub(M1, T), sub(M2, T))
  // Chains: C from after the dart to Q, D from Q to before the dart.
  const qi = split.second
  const C = chain(edges, i + 2, qi - 1)
  const D = chain(edges, qi, i - 1)
  const rotC = !hasCentre(C) || (hasCentre(D) && C.length <= D.length)
  const info = { ...leg1.dart!, id: newId ?? (share >= 0.999 ? dartId : `${dartId}2`) }
  let out: Edge[]
  let region: Vec[]
  let f: (q: Vec) => Vec
  if (rotC) {
    const ang = -theta * share
    f = (q) => rotate(q, ang, T)
    region = [T, ...loopPoints(C)]
    const RC = C.map((e) => mapEdge(e, f))
    const rq = f(Q)
    const keepOld = share < 0.999 ? [leg1, { ...leg2, line: new Line(T).to(f(M2)) }] : []
    out = [
      ...keepOld,
      ...RC,
      { id: info.id, kind: 'dart', line: new Line(rq).to(T), dart: { ...info, leg: 1 } },
      { id: info.id, kind: 'dart', line: new Line(T).to(Q), dart: { ...info, leg: 2 } },
      ...D,
    ]
  } else {
    const ang = theta * share
    f = (q) => rotate(q, ang, T)
    region = [T, ...loopPoints(D)]
    const RD = D.map((e) => mapEdge(e, f))
    const rq = f(Q)
    const keepOld = share < 0.999 ? [{ ...leg1, line: new Line(f(M1)).to(T) }, leg2] : []
    out = [
      ...C,
      { id: info.id, kind: 'dart', line: new Line(Q).to(T), dart: { ...info, leg: 1 } },
      { id: info.id, kind: 'dart', line: new Line(T).to(rq), dart: { ...info, leg: 2 } },
      ...RD,
      ...keepOld,
    ]
  }
  moveInside(p, region, f)
  p.edges = mergeSame(stitch(out))
  // The grain stays parallel to the part that does not turn (the centre line).
  if (pointInPolygon(p.labelAt, region)) p.labelAt = f(p.labelAt)
  return p
}

// ---------------------------------------------------------------------------
// Princess seams (рельефы)

export interface PrincessResult {
  centre: Panel
  side: Panel
}

/**
 * Cuts the panel into a centre and a side part along a line from the mouth
 * of the outline dart `dartId` through its apex, the waist «fish» dart and
 * straight down to the hem. Each part gets one leg of each dart, so both
 * darts turn into the seam.
 */
export function princess(panel: Panel, dartId: string): PrincessResult | undefined {
  let edges = panel.edges
  const fish: FishDart | undefined = panel.fish[0]
  const i0 = edges.findIndex((e) => e.kind === 'dart' && e.dart?.id === dartId && e.dart.leg === 1)
  if (i0 < 0 || !fish) return undefined
  // Hem point under the fish dart.
  const hem = crossingOn(panel, 'hem', fish.bottom.x)
  if (!hem) return undefined
  const split = splitEdge(edges, hem.i, hem.s)
  edges = split.edges
  const H = edges[split.second]!.line.start
  const n = edges.length
  const i = edges.findIndex((e) => e.kind === 'dart' && e.dart?.id === dartId && e.dart.leg === 1)
  const M1 = edges[i]!.line.start
  const T = edges[i]!.line.end
  const M2 = edges[at(i + 1, n)]!.line.end
  const C = chain(edges, i + 2, split.second - 1) // M2 … H
  const D = chain(edges, split.second, i - 1) // H … M1
  // Which waist point belongs to D's part: test against D closed through the dart centre.
  const polyD = [...loopPoints(D), T, fish.top, fish.bottom]
  const dLeg = pointInPolygon(fish.left, polyD) ? fish.left : fish.right
  const cLeg = dLeg === fish.left ? fish.right : fish.left
  const mouthY = Math.max(M1.y, M2.y)
  // If the apex is above the mouth (a back dart moved to the armhole), the
  // seam would hook upwards: take an apex on the other side of the mouth,
  // on the dart's bisector, so both legs stay equal.
  let A = T
  if (!(T.y > mouthY + 10 && T.y < fish.top.y + 5)) {
    const mm = mid(M1, M2)
    let nn = norm(v(-(M2.y - M1.y), M2.x - M1.x))
    if (nn.x * (T.x - mm.x) + nn.y * (T.y - mm.y) < 0) nn = mul(nn, -1)
    A = add(mm, mul(nn, Math.min(dist(mm, T), Math.max(15, 0.6 * Math.abs(mm.x - fish.top.x)))))
  }
  const via = (leg: Vec) => {
    const pts: Vec[] = [A]
    if (dist(fish.top, A) > 5) pts.push(fish.top)
    pts.push(leg, fish.bottom)
    return pts
  }
  const down = v(0, 1)
  const reliefD = through([M1, ...via(dLeg)], sub(A, M1), down)
  if (dist(fish.bottom, H) > 0.5) reliefD.to(H)
  const reliefC = through([M2, ...via(cLeg)], sub(A, M2), down)
  if (dist(fish.bottom, H) > 0.5) reliefC.to(H)
  const partD: Edge[] = [...D, { id: 'princess', kind: 'seam', line: reliefD }]
  const partC: Edge[] = [...C, { id: 'princess', kind: 'seam', line: reliefC.reversed() }]
  const make = (es: Edge[], suffix: string): Panel => {
    const q = clonePanel(panel)
    q.id = `${panel.id}-${suffix}`
    q.edges = mergeSame(stitch(es))
    q.fish = panel.fish.slice(1)
    const poly = loopPoints(q.edges)
    q.marks = q.marks.filter((m) => m.line.points(4).every((pt) => pointInPolygon(pt, poly)))
    q.notes = q.notes.filter((nt) => pointInPolygon(nt.at, poly))
    q.notches = [...q.notches.filter((nt) => pointInPolygon(nt.at, poly)), { edge: 'princess', at: A }]
    const xs = poly.map((pt) => pt.x)
    const ys = poly.map((pt) => pt.y)
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2
    const top = panel.levels.waist ?? Math.min(...ys)
    const bottom = Math.max(...ys)
    q.grain = [v(cx, top + 40), v(cx, bottom - 80)]
    q.labelAt = v(Math.min(...xs) + 15, (top + bottom) / 2)
    return q
  }
  const pD = make(partD, 'd')
  const pC = make(partC, 'c')
  const dIsSide = pD.edges.some((e) => e.id === 'side')
  const side = dIsSide ? pD : pC
  const centre = dIsSide ? pC : pD
  const where = panel.role === 'front' ? 'полочки' : 'спинки'
  centre.id = `${panel.id}-centre`
  centre.title = `Центральная часть ${where}`
  side.id = `${panel.id}-side`
  side.title = `Боковая часть ${where}`
  side.cut = 'Крой 2 (зеркально)'
  return { centre, side }
}

// ---------------------------------------------------------------------------
// Necklines (горловины)

export type NeckShape = 'round' | 'v' | 'square'

/** Reverse the loop direction (dart legs swap). */
function reversePanel(p: Panel): Panel {
  const q = clonePanel(p)
  q.edges = [...p.edges].reverse().map((e) => {
    const r: Edge = { ...e, line: e.line.reversed() }
    if (e.dart) r.dart = { ...e.dart, leg: e.dart.leg === 1 ? 2 : 1, press: e.dart.press === 'a' ? 'b' : 'a' }
    return r
  })
  return q
}

/**
 * New neckline: widened along the shoulder by `widen` and deepened at the
 * centre line by `depth` (both mm, from the base neckline).
 */
export function neckline(panel: Panel, shape: NeckShape, widen: number, depth: number, warnings: string[] = []): Panel {
  let p = clonePanel(panel)
  const k0 = p.edges.findIndex((e) => e.id === 'neck')
  if (k0 < 0) return p
  if (p.edges[at(k0 - 1, p.edges.length)]!.id !== 'shoulder') p = reversePanel(p)
  const n = p.edges.length
  const k = p.edges.findIndex((e) => e.id === 'neck')
  const sh = p.edges[at(k - 1, n)]!
  const ce = p.edges[at(k + 1, n)]!
  if (sh.id !== 'shoulder' || sh.kind === 'dart') return p
  const neck = p.edges[k]!
  const shLen = sh.line.length()
  let w = widen
  if (w > shLen - 10) {
    w = Math.max(0, shLen - 10)
    warnings.push(`Горловина: расширение ограничено ${(w / 10).toLocaleString('ru-RU')} см, дальше на плече вытачка или край плеча. Переведите вытачку.`)
  }
  const ceLen = ce.line.length()
  const dpt = Math.min(depth, ceLen - 50)
  const shHead = w > 0.5 ? sh.line.splitAtLength(shLen - w)[0] : sh.line
  const ceTail = dpt > 0.5 ? ce.line.splitAtLength(dpt)[1] : ce.line
  const A = shHead.end
  const B = ceTail.start
  const t0 = neck.line.tangentAt(0, 0)
  const t1 = neck.line.tangentAt(neck.line.segs.length - 1, 1)
  let line: Line
  if (shape === 'v') line = new Line(A).to(B)
  else if (shape === 'square') {
    const cDir = ce.line.tangentAt(0, 0)
    const corner = lineX(A, add(A, cDir), B, add(B, v(-cDir.y, cDir.x)))
    line = new Line(A).to(corner).to(B)
  } else line = new Line(A).smooth(t0, t1, B, 0.55)
  const edges = [...p.edges]
  edges[at(k - 1, n)] = { ...sh, line: shHead }
  edges[k] = { ...neck, line }
  edges[at(k + 1, n)] = { ...ce, line: ceTail }
  p.edges = stitch(edges)
  return p
}

// ---------------------------------------------------------------------------
// Length (изменение длины)

/** Map of a point when the panel is cut at y and the lower part moves by d. */
function lengthMap(y: number, d: number): (q: Vec) => Vec {
  return (q) => (q.y > y ? v(q.x, Math.max(y, q.y + d)) : q)
}

/**
 * Lengthen (d > 0) or shorten (d < 0) the panel along the horizontal line y:
 * the part below moves down or up, side lines stay continuous.
 */
export function changeLength(panel: Panel, y: number, d: number): Panel {
  const p = clonePanel(panel)
  if (Math.abs(d) < 0.5) return p
  const cuts = d > 0 ? [y] : [y, y - d]
  const f = lengthMap(y, d)
  const edges: Edge[] = []
  for (const e of p.edges) {
    // Split the edge at every crossing of the cut lines.
    let pieces = [e.line]
    for (const cy of cuts) {
      const next: Line[] = []
      for (const l of pieces) {
        const xs = l.crossings(v(0, cy), v(1, 0)).map((c) => l.project(c.at).s).sort((a, b) => a - b)
        let rest = l
        let consumed = 0
        for (const s of xs) {
          if (s - consumed < 0.05 || rest.length() - (s - consumed) < 0.05) continue
          const [h, t] = rest.splitAtLength(s - consumed)
          next.push(h)
          rest = t
          consumed = s
        }
        next.push(rest)
      }
      pieces = next
    }
    const kept = pieces.filter((l) => {
      const m = l.pointAtLength(l.length() / 2)
      return !(d < 0 && m.y > y && m.y < y - d) // inside the removed band
    })
    if (!kept.length) continue
    const line = new Line(f(kept[0]!.start))
    for (const l of kept) line.append(l.map(f))
    edges.push({ ...e, line })
  }
  p.edges = stitch(edges)
  p.marks = p.marks.map((m) => ({ role: m.role, line: m.line.map(f) }))
  p.notes = p.notes.map((nt) => ({ ...nt, at: f(nt.at) }))
  p.fish = p.fish.map((fd) => ({ ...fd, top: f(fd.top), left: f(fd.left), bottom: f(fd.bottom), right: f(fd.right) }))
  p.notches = p.notches.map((nt) => ({ ...nt, at: f(nt.at) }))
  p.grain = [f(p.grain[0]), f(p.grain[1])]
  p.labelAt = f(p.labelAt)
  for (const key of Object.keys(p.levels) as (keyof Panel['levels'])[]) {
    const lv = p.levels[key]
    if (lv !== undefined && lv > y) p.levels[key] = Math.max(y, lv + d)
  }
  return p
}

/** Lowest y of the hem. */
export function hemY(p: Panel): number {
  const hem = p.edges.filter((e) => e.id === 'hem')
  const pts = hem.flatMap((e) => e.line.points(8))
  return pts.length ? Math.max(...pts.map((q) => q.y)) : Math.max(...loopPoints(p.edges).map((q) => q.y))
}

/** Remove everything below y; the cut becomes the new hem. */
export function trimBelow(panel: Panel, y: number): Panel {
  // Darts that reach below the cut are dropped (a short sleeve needs no elbow dart).
  const p = clonePanel(panel)
  for (;;) {
    const i = p.edges.findIndex((e) => e.kind === 'dart' && e.dart?.leg === 1 && e.line.points(2).some((q) => q.y > y - 10))
    if (i < 0) break
    const n = p.edges.length
    const l1 = p.edges[i]!
    const l2 = p.edges[at(i + 1, n)]!
    const prev = p.edges[at(i - 1, n)]!
    const edges = [...p.edges]
    edges[i] = { ...prev, line: new Line(l1.line.start).to(l2.line.end) }
    edges.splice(at(i + 1, n), 1)
    p.edges = mergeSame(edges)
  }
  const kept: Edge[] = []
  for (const e of p.edges) {
    const xs = e.line.crossings(v(0, y), v(1, 0)).map((c) => e.line.project(c.at).s).sort((a, b) => a - b)
    let rest = e.line
    let consumed = 0
    const pieces: Line[] = []
    for (const s of xs) {
      if (s - consumed < 0.05 || rest.length() - (s - consumed) < 0.05) continue
      const [h, t] = rest.splitAtLength(s - consumed)
      pieces.push(h)
      rest = t
      consumed = s
    }
    pieces.push(rest)
    for (const l of pieces) if (l.pointAtLength(l.length() / 2).y < y) kept.push({ ...e, line: l })
  }
  // Bridge the gaps (where the cut went) with the new hem.
  const out: Edge[] = []
  let hasHem = false
  for (let k = 0; k < kept.length; k++) {
    const e = kept[k]!
    const next = kept[(k + 1) % kept.length]!
    out.push(e)
    if (!near(e.line.end, next.line.start, 0.5)) {
      out.push({ id: 'hem', kind: 'hem', line: new Line(e.line.end).to(next.line.start) })
      hasHem = true
    }
  }
  p.edges = mergeSame(out)
  void hasHem
  const g = (q: Vec) => (q.y > y ? v(q.x, y) : q)
  p.marks = p.marks.filter((mk) => mk.line.points(2).some((q) => q.y < y - 5)).map((mk) => ({ role: mk.role, line: mk.line.map(g) }))
  p.notes = p.notes.filter((nt) => nt.at.y < y - 5)
  p.notches = p.notches.filter((nt) => nt.at.y < y - 5)
  const ys = loopPoints(p.edges).map((q) => q.y)
  const top = Math.min(...ys)
  p.grain = [v(p.grain[0].x, top + (y - top) * 0.35), v(p.grain[1].x, y - 25)]
  if (p.labelAt.y > y - 40) p.labelAt = v(p.labelAt.x, top + (y - top) * 0.45)
  for (const key of Object.keys(p.levels) as (keyof Panel['levels'])[]) if ((p.levels[key] ?? 0) > y) delete p.levels[key]
  return p
}

// ---------------------------------------------------------------------------
// Flare (трапеция, клёш)

/**
 * The hem drawn again as one smooth curve through its vertices, square to the
 * seams at both ends. Openings of darts that reach the hem become flare.
 */
export function smoothHem(panel: Panel): Panel {
  const p = clonePanel(panel)
  // Dissolve darts whose mouth is on the hem.
  for (;;) {
    const n = p.edges.length
    const i = p.edges.findIndex(
      (e, k) => e.kind === 'dart' && e.dart?.leg === 1 && p.edges[at(k - 1, n)]!.id === 'hem' && p.edges[at(k + 2, n)]!.id === 'hem',
    )
    if (i < 0) break
    const l1 = p.edges[i]!
    const l2 = p.edges[at(i + 1, n)]!
    const edges = [...p.edges]
    edges[i] = { id: 'hem', kind: 'hem', line: new Line(l1.line.start).to(l2.line.end) }
    edges.splice(at(i + 1, n), 1)
    p.edges = mergeSame(edges)
  }
  const n = p.edges.length
  p.edges = p.edges.map((e, k) => {
    if (e.id !== 'hem' || e.kind !== 'hem') return e
    const prev = p.edges[at(k - 1, n)]!
    const next = p.edges[at(k + 1, n)]!
    const pts = [e.line.start, ...e.line.segs.map((s) => s.to)]
    const clean = pts.filter((q, j) => j === 0 || dist(q, pts[j - 1]!) > 2)
    const chord = sub(e.line.end, e.line.start)
    const sq = (t: Vec) => {
      const nn = v(-t.y, t.x)
      return nn.x * chord.x + nn.y * chord.y >= 0 ? nn : mul(nn, -1)
    }
    const d0 = sq(prev.line.tangentAt(prev.line.segs.length - 1, 1))
    const d1 = sq(next.line.tangentAt(0, 0))
    if (clean.length < 2) return e
    return { ...e, line: through(clean, d0, d1) }
  })
  return p
}

/**
 * Flare at a seam: below `pivotY` the seam named `id` turns outwards so that
 * the hem gets `amount` mm wider at this seam.
 */
export function flareSeam(panel: Panel, id: string, amount: number, pivotY: number): Panel {
  let p = clonePanel(panel)
  if (amount <= 0) return p
  const n = p.edges.length
  for (let k = 0; k < n; k++) {
    const e = p.edges[k]!
    if (e.id !== id || e.kind !== 'seam') continue
    const toHem = p.edges[at(k + 1, n)]!.id === 'hem'
    const fromHem = p.edges[at(k - 1, n)]!.id === 'hem'
    if (!toHem && !fromHem) continue
    const line = toHem ? e.line : e.line.reversed()
    const H = line.end
    const c = line.crossings(v(0, pivotY), v(1, 0))
    const s = c.length ? line.project(c[c.length - 1]!.at).s : 0
    const upper = s > 0.5 ? line.splitAtLength(s)[0] : new Line(line.start)
    const K = upper.end
    const r = dist(K, H)
    if (r < 20) continue
    const ang = (Math.asin(Math.min(0.9, amount / r)) * 180) / Math.PI
    const poly = loopPoints(p.edges)
    const cand = [rotate(H, ang, K), rotate(H, -ang, K)]
    // Test a point a little above the hem: the middle of H and a candidate
    // lies on the hem itself when the hem is straight, and the test is a toss-up.
    // Test a point a little above the hem: the middle of H and a candidate
    // lies on the hem itself when the hem is straight, and the test is a toss-up.
    const H2 = pointInPolygon(lerp(mid(H, cand[0]!), K, 0.1), poly) ? cand[1]! : cand[0]!
    const newLine = upper.segs.length ? upper.to(H2) : new Line(K).to(H2)
    const edges = [...p.edges]
    edges[k] = { ...e, line: toHem ? newLine : newLine.reversed() }
    // Move the hem end to the new corner.
    const hk = toHem ? at(k + 1, n) : at(k - 1, n)
    const hem = edges[hk]!
    const pts = [hem.line.start, ...hem.line.segs.map((sg) => sg.to)]
    if (toHem) pts[0] = H2
    else pts[pts.length - 1] = H2
    edges[hk] = { ...hem, line: through(pts) }
    p.edges = edges
  }
  p = smoothHem(p)
  return p
}

/**
 * Close waist darts of a skirt into the hem: each dart (its `share`) moves to
 * the hem straight under its tip and opens there as flare.
 */
export function dartsToHem(panel: Panel, share: number): Panel {
  let p = clonePanel(panel)
  if (share <= 0) return p
  const ids = [...new Set(p.edges.filter((e) => e.kind === 'dart' && e.dart?.leg === 1).map((e) => e.dart!.id))]
  for (const id of ids) {
    const leg = p.edges.find((e) => e.kind === 'dart' && e.dart?.id === id && e.dart.leg === 1)!
    const pos = crossingOn(p, 'hem', leg.line.end.x)
    if (!pos) continue
    p = transferDart(p, id, pos, share, `${id}-hem`)
  }
  return smoothHem(p)
}

/**
 * Extra flare by slashes from the hem up to the waist (the waist stays, the
 * hem opens): `amount` mm in total, over `count` slashes.
 */
export function slashFlare(panel: Panel, amount: number, count = 2, maxAngle = Infinity): Panel {
  return slashFlareTurn(panel, amount, count, maxAngle).panel
}

/** Slash flare that also reports the total angle the hem opened by, degrees. */
export function slashFlareTurn(panel: Panel, amount: number, count = 2, maxAngle = Infinity): { panel: Panel; angle: number } {
  let p = clonePanel(panel)
  let total = 0
  if (amount <= 0) return { panel: p, angle: 0 }
  const hem = p.edges.filter((e) => e.id === 'hem' && e.kind !== 'dart')
  const hx = hem.flatMap((e) => e.line.points(4)).map((q) => q.x)
  const x0 = Math.min(...hx)
  const x1 = Math.max(...hx)
  // The slash lines are taken on the piece as drafted. They are opened one by
  // one from the centre line outwards: each opening turns the part away from
  // the centre, so the slashes still to open are turned with it.
  const centre = p.edges.filter((e) => e.kind !== 'dart' && hasCentre([e])).flatMap((e) => e.line.points(4))
  const cx = centre.length ? centre.reduce((a, q) => a + q.x, 0) / centre.length : x0
  let slashes: { W: Vec; Q: Vec }[] = []
  // A slash that falls into a dart mouth on the waist moves just beside the dart.
  const mouths = p.edges
    .filter((e) => e.kind === 'dart' && e.dart?.leg === 1 && e.id === 'waist')
    .map((e) => {
      const l2 = p.edges.find((o) => o.kind === 'dart' && o.dart?.id === e.dart!.id && o.dart.leg === 2)!
      return [Math.min(e.line.start.x, l2.line.end.x), Math.max(e.line.start.x, l2.line.end.x)] as const
    })
  // The slashes are spread evenly over the waist and over the hem.
  const wx = p.edges.filter((e) => e.id === 'waist' && e.kind !== 'dart').flatMap((e) => e.line.points(4)).map((q) => q.x)
  const w0 = Math.min(...wx)
  const w1 = Math.max(...wx)
  // Slashes at least 20 mm apart on the waist (a narrow gore gets fewer).
  count = Math.max(1, Math.min(count, Math.floor((w1 - w0) / 20)))
  for (let j = 1; j <= count; j++) {
    let x = w0 + ((w1 - w0) * j) / (count + 1)
    const m = mouths.find(([a, b]) => x > a - 10 && x < b + 10)
    if (m) x = x - m[0] < m[1] - x ? m[0] - 10 : m[1] + 10
    const W = crossingOn(p, 'waist', x)
    const Q = crossingOn(p, 'hem', x0 + ((x1 - x0) * j) / (count + 1))
    if (W && Q && !slashes.some((o) => dist(o.W, W.at) < 15)) slashes.push({ W: W.at, Q: Q.at })
  }
  const n = slashes.length
  slashes.sort((a, b) => Math.abs(a.W.x - cx) - Math.abs(b.W.x - cx))
  for (let j = 0; j < slashes.length; j++) {
    const sl = slashes[j]!
    const W = nearestOn(p, 'waist', sl.W)
    if (!W || W.d > 1) continue
    const sw = splitEdge(p.edges, W.i, W.s)
    let edges = sw.edges
    const Wp = edges[sw.second]!.line.start
    const wi = sw.second
    const id = `flare${j + 1}`
    edges = [
      ...edges.slice(0, wi),
      { id, kind: 'dart', line: new Line(Wp).to(add(Wp, v(0, 1e-3))), dart: { id, leg: 1, press: 'a' } },
      { id, kind: 'dart', line: new Line(add(Wp, v(0, 1e-3))).to(Wp), dart: { id, leg: 2, press: 'a' } },
      ...edges.slice(wi),
    ]
    p = { ...p, edges }
    const Q = nearestOn(p, 'hem', sl.Q)
    if (!Q || Q.d > 1) continue
    const r = dist(Wp, sl.Q)
    // The hem opens by the chord 2·r·sin(ang/2) = amount / count.
    const ang = Math.min(maxAngle / n, (2 * Math.asin(Math.min(0.7, amount / n / 2 / r)) * 180) / Math.PI)
    const opened = openHinge(p, id, Q, ang, slashes[j + 1]?.W)
    total += ang
    p = opened.panel
    slashes = slashes.map((o, k) => (k > j ? { W: opened.f(o.W), Q: opened.f(o.Q) } : o))
  }
  return { panel: smoothHem(p), angle: total }
}

/** The point of edge `id` nearest to `q`. */
function nearestOn(p: Panel, id: string, q: Vec): { i: number; s: number; d: number } | undefined {
  let best: { i: number; s: number; d: number } | undefined
  p.edges.forEach((e, i) => {
    if (e.id !== id || e.kind === 'dart') return
    const pr = e.line.project(q)
    if (!best || pr.d < best.d) best = { i, s: pr.s, d: pr.d }
  })
  return best
}

/** Open a slash from the hem point `to` up to the hinge dart `id` by `ang` degrees. */
function openHinge(panel: Panel, id: string, to: { i: number; s: number }, ang: number, next?: Vec): { panel: Panel; f: (q: Vec) => Vec } {
  const p = clonePanel(panel)
  const split = splitEdge(p.edges, to.i, to.s)
  let edges = split.edges
  const Q = edges[split.second]!.line.start
  const i = edges.findIndex((e) => e.kind === 'dart' && e.dart?.id === id && e.dart.leg === 1)
  const W = edges[i]!.line.start
  const C = chain(edges, i + 2, split.second - 1)
  const D = chain(edges, split.second, i - 1)
  // The part without the centre line turns; with no centre line (a gore),
  // the part that holds the slashes still to open.
  const near = (part: Edge[], q: Vec) => Math.min(...part.map((e) => e.line.project(q).d))
  const rotC =
    !hasCentre(C) && !hasCentre(D) && next ? near(C, next) < near(D, next) : !hasCentre(C) || (hasCentre(D) && C.length <= D.length)
  // Turn so that the hem opens: the turning part moves away from the fixed one.
  const centroid = (part: Edge[]) => {
    const q = loopPoints(part)
    return mul(q.reduce((a, b) => add(a, b), v(0, 0)), 1 / q.length)
  }
  const sign = (part: Edge[], a: number) => {
    const fixed = centroid(part === C ? D : C)
    const c = centroid(part)
    return dist(rotate(c, a, W), fixed) >= dist(rotate(c, -a, W), fixed)
  }
  let f: (q: Vec) => Vec
  if (rotC) {
    const a = sign(C, ang) ? ang : -ang
    f = (q: Vec) => rotate(q, a, W)
    moveInside(p, [W, ...loopPoints(C)], f)
    edges = [
      ...C.map((e) => mapEdge(e, f)),
      { id: 'hem', kind: 'dart', line: new Line(f(Q)).to(W), dart: { id: `${id}-hem`, leg: 1, press: 'a' } },
      { id: 'hem', kind: 'dart', line: new Line(W).to(Q), dart: { id: `${id}-hem`, leg: 2, press: 'a' } },
      ...D,
    ]
  } else {
    const a = sign(D, ang) ? ang : -ang
    f = (q: Vec) => rotate(q, a, W)
    moveInside(p, [W, ...loopPoints(D)], f)
    edges = [
      ...C,
      { id: 'hem', kind: 'dart', line: new Line(Q).to(W), dart: { id: `${id}-hem`, leg: 1, press: 'a' } },
      { id: 'hem', kind: 'dart', line: new Line(W).to(f(Q)), dart: { id: `${id}-hem`, leg: 2, press: 'a' } },
      ...D.map((e) => mapEdge(e, f)),
    ]
  }
  p.edges = mergeSame(stitch(edges))
  return { panel: p, f }
}

// ---------------------------------------------------------------------------
// Sleeve (рукав)

/**
 * Puff sleeve (фонарик): the sleeve is spread in the middle by `cap` mm at
 * the cap and `hem` mm at the hem, the cap top raised by `raise` mm. The
 * outer parts with the underarm curves only move sideways, so they still
 * fit the armhole.
 */
export function puffSleeve(panel: Panel, cap: number, hem: number, raise: number): Panel {
  const p = clonePanel(panel)
  if (cap <= 0 && hem <= 0 && raise <= 0) return p
  const pts = loopPoints(p.edges)
  const yTop = Math.min(...pts.map((q) => q.y))
  const yBot = hemY(p)
  const yUnder = p.levels.chest ?? yTop + (yBot - yTop) * 0.25
  const capPts = pts.filter((q) => q.y <= yUnder + 1)
  const xL = Math.min(...capPts.map((q) => q.x))
  const xR = Math.max(...capPts.map((q) => q.x))
  const W = xR - xL
  const smooth = (t: number) => {
    const u = Math.min(1, Math.max(0, t))
    return u * u * (3 - 2 * u)
  }
  const s = (x: number) => smooth((x - xL - 0.15 * W) / (0.7 * W))
  const f = (q: Vec): Vec => {
    const t = Math.min(1, Math.max(0, (q.y - yTop) / (yBot - yTop)))
    const total = cap * (1 - t) + hem * t
    const k = s(q.x)
    const capW = Math.min(1, Math.max(0, (yUnder - q.y) / (yUnder - yTop)))
    return v(q.x + total * (k - 0.5), q.y - raise * capW * 4 * k * (1 - k))
  }
  p.edges = p.edges.map((e) => mapEdge(e, f))
  p.marks = p.marks.map((m) => ({ role: m.role, line: m.line.map(f) }))
  p.notes = p.notes.map((nt) => ({ ...nt, at: f(nt.at) }))
  p.grain = [f(p.grain[0]), f(p.grain[1])]
  p.labelAt = f(p.labelAt)
  // Notches where the gathering starts and ends on the cap and the hem.
  const marks: { edge: string; at: Vec }[] = []
  for (const x of [xL + 0.15 * W, xR - 0.15 * W]) {
    const capE = panel.edges.find((e) => e.id === 'cap')
    const c = capE?.line.crossings(v(x, 0), v(0, 1)).sort((a, b) => a.at.y - b.at.y)[0]
    if (c && cap > 0) marks.push({ edge: 'cap', at: f(c.at) })
    const hemE = panel.edges.find((e) => e.id === 'hem')
    const h = hemE?.line.crossings(v(x, 0), v(0, 1))[0]
    if (h && hem > 0) marks.push({ edge: 'hem', at: f(h.at) })
  }
  p.notches = [...p.notches.map((nt) => ({ ...nt, at: f(nt.at) })), ...marks]
  if (cap > 0) p.notes.push({ at: v((xL + xR) / 2 - 20, yTop + 40), text: 'сборка по окату', size: 4 })
  if (hem > 0) p.notes.push({ at: v((xL + xR) / 2 - 20, yBot - 15), text: 'сборка по низу', size: 4 })
  return p
}

/** Width of the hem of a panel (straight distance between its ends). */
export function hemWidth(p: Panel): number {
  const hem = p.edges.filter((e) => e.id === 'hem')
  if (!hem.length) return 0
  return hem.reduce((s, e) => s + e.line.length(), 0)
}

/** A straight cuff: `length` round the wrist (with the overlap), `height` finished, cut double with a fold. */
export function cuffPanel(id: string, method: string, length: number, height: number, origin: Vec): Panel {
  const o = origin
  const w = length
  const h = 2 * height
  const A = o
  const B = v(o.x + w, o.y)
  const C = v(o.x + w, o.y + h)
  const Dp = v(o.x, o.y + h)
  const edges: Edge[] = [
    { id: 'cuff', kind: 'seam', line: new Line(A).to(B) },
    { id: 'cuffEnd', kind: 'seam', line: new Line(B).to(C) },
    { id: 'cuffInner', kind: 'seam', line: new Line(C).to(Dp) },
    { id: 'cuffEnd', kind: 'seam', line: new Line(Dp).to(A) },
  ]
  return {
    id,
    title: 'Манжета',
    role: 'cuff',
    method,
    edges,
    fish: [],
    marks: [{ role: 'fold', line: new Line(v(o.x, o.y + height)).to(v(o.x + w, o.y + height)) }],
    grain: [v(o.x + 20, o.y + h / 2 - 15), v(o.x + w - 20, o.y + h / 2 - 15)],
    cut: 'Крой 2',
    labelAt: v(o.x + 15, o.y + h + 25),
    notes: [{ at: v(o.x + 5, o.y + height - 3), text: 'линия сгиба', size: 4 }],
    levels: {},
    notches: [
      { edge: 'cuff', at: v(o.x + 20, o.y) },
      { edge: 'cuffInner', at: v(o.x + 20, o.y + h) },
    ],
  }
}

/**
 * Cuts a skirt half into `k` gores (клинья) by straight seams from the waist
 * to the hem, spread evenly over the waist and the hem. The new seams are
 * named 'gore'. Gores are listed from the centre line to the side.
 */
export function goreSplit(panel: Panel, k: number): Panel[] {
  if (k <= 1) return [clonePanel(panel)]
  const waist = panel.edges.filter((e) => e.id === 'waist' && e.kind !== 'dart').flatMap((e) => e.line.points(4)).map((q) => q.x)
  const hem = panel.edges.filter((e) => e.id === 'hem').flatMap((e) => e.line.points(4)).map((q) => q.x)
  const [w0, w1] = [Math.min(...waist), Math.max(...waist)]
  const [h0, h1] = [Math.min(...hem), Math.max(...hem)]
  const mouths = panel.edges
    .filter((e) => e.kind === 'dart' && e.dart?.leg === 1 && e.id === 'waist')
    .map((e) => {
      const l2 = panel.edges.find((o) => o.kind === 'dart' && o.dart?.id === e.dart!.id && o.dart.leg === 2)!
      return [Math.min(e.line.start.x, l2.line.end.x), Math.max(e.line.start.x, l2.line.end.x)] as const
    })
  const centre = panel.edges.filter((e) => e.kind !== 'dart' && hasCentre([e])).flatMap((e) => e.line.points(4))
  const cx = centre.length ? centre.reduce((a, q) => a + q.x, 0) / centre.length : w0
  const fromCentre = Math.abs(cx - w0) < Math.abs(cx - w1)
  // Cut lines, from the centre outwards.
  const cuts: { W: Vec; Q: Vec }[] = []
  for (let j = 1; j < k; j++) {
    const f = fromCentre ? j / k : 1 - j / k
    let x = w0 + (w1 - w0) * f
    const m = mouths.find(([a, b]) => x > a - 10 && x < b + 10)
    if (m) x = x - m[0] < m[1] - x ? m[0] - 10 : m[1] + 10
    const W = crossingOn(panel, 'waist', x)
    const Q = crossingOn(panel, 'hem', h0 + (h1 - h0) * f)
    if (W && Q) cuts.push({ W: W.at, Q: Q.at })
  }
  const parts: Panel[] = []
  let rest = clonePanel(panel)
  const waistX = (q: Panel) => {
    const xs = q.edges.filter((e) => e.id === 'waist').flatMap((e) => [e.line.start.x, e.line.end.x])
    return xs.reduce((a, b) => a + b, 0) / xs.length
  }
  for (const c of cuts) {
    const two = cutAlong(rest, c.W, c.Q)
    // The part nearer the centre line is the next gore; the rest is cut further.
    const [inner, outer] = Math.abs(waistX(two[0]) - cx) <= Math.abs(waistX(two[1]) - cx) ? two : [two[1], two[0]]
    parts.push(inner)
    rest = outer
  }
  parts.push(rest)
  const n = parts.length
  return parts.map((q, i) => {
    q.id = `${panel.id}-${i + 1}`
    q.title = `${panel.title}, клин ${i + 1} из ${n}`
    if (!q.edges.some((e) => e.kind === 'fold')) q.cut = panel.cut.startsWith('Крой 1') ? 'Крой 2' : panel.cut
    return q
  })
}

/** Cut a panel along the straight line W (on the waist) to Q (on the hem): [part with the centre line, the other]. */
function cutAlong(panel: Panel, W: Vec, Q: Vec): [Panel, Panel] {
  const near = (p: Panel, id: string, q: Vec) => {
    let best = { i: -1, s: 0, d: Infinity }
    p.edges.forEach((e, i) => {
      if (e.id !== id || e.kind === 'dart') return
      const pr = e.line.project(q)
      if (pr.d < best.d) best = { i, s: pr.s, d: pr.d }
    })
    return best
  }
  const p = clonePanel(panel)
  const a = near(p, 'waist', W)
  let edges = splitEdge(p.edges, a.i, a.s).edges
  const b = near({ ...p, edges }, 'hem', Q)
  edges = splitEdge(edges, b.i, b.s).edges
  const iwi = edges.findIndex((e) => dist(e.line.start, W) < 0.05)
  const iq = edges.findIndex((e) => dist(e.line.start, Q) < 0.05)
  const A = chain(edges, iwi, iq - 1)
  const B = chain(edges, iq, iwi - 1)
  const partA: Edge[] = [...A, { id: 'gore', kind: 'seam', line: new Line(Q).to(W) }]
  const partB: Edge[] = [...B, { id: 'gore', kind: 'seam', line: new Line(W).to(Q) }]
  const make = (es: Edge[]): Panel => {
    const q = clonePanel(panel)
    q.edges = mergeSame(stitch(es))
    const poly = loopPoints(q.edges)
    q.fish = q.fish.filter((f) => pointInPolygon(f.top, poly))
    q.marks = q.marks.filter((m) => m.line.points(4).every((pt) => pointInPolygon(pt, poly)))
    q.notes = q.notes.filter((nt) => pointInPolygon(nt.at, poly))
    q.notches = q.notches.filter((nt) => pointInPolygon(nt.at, poly))
    goreGrain(q)
    return q
  }
  const pa = make(partA)
  const pb = make(partB)
  return hasCentre(pa.edges) ? [pa, pb] : [pb, pa]
}

/** Grain and label of a gore: along the line from the middle of its waist to the middle of its hem. */
export function goreGrain(q: Panel): void {
  const mid = (id: string) => {
    const pts = q.edges.filter((e) => e.id === id && e.kind !== 'dart').flatMap((e) => [e.line.start, e.line.end])
    return mul(pts.reduce((a, b) => add(a, b), v(0, 0)), 1 / pts.length)
  }
  const w = mid('waist')
  const h = mid('hem')
  const at = (t: number) => add(w, mul(sub(h, w), t))
  q.grain = [at(0.2), at(0.8)]
  q.labelAt = add(at(0.35), v(8, 0))
}
