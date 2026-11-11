import { Line, toPiece, v, type Vec } from '../draft/geom'
import type { PathRole, Piece } from '../geometry'

/**
 * A pattern piece as the modelling steps of stage M3 see it.
 *
 * The outline is a closed loop of named edges (срезы). Names are shared by
 * all methods, so a modelling step written once works on every block:
 *
 *   neck, shoulder, armhole, side, hem, cb, cf, waist (skirts, trousers),
 *   princess (рельеф), cap, seamFront, seamBack (sleeve), inseam, crotch.
 *
 * Darts that open on the outline are two edges of kind `dart` (legs into and
 * out of the apex). Darts inside the piece (waist «fish» darts of a dress)
 * are `fish` entries. All in mm, y down, as in the drafting kit.
 */
export type EdgeKind = 'seam' | 'hem' | 'fold' | 'dart'

export interface DartLeg {
  /** Dart name: bust, shoulder, waist, waist2, elbow… */
  id: string
  /** 1: from the mouth into the apex; 2: from the apex out to the mouth. */
  leg: 1 | 2
  /**
   * Which way the dart intake is pressed: towards the edge before the dart
   * ('a') or after it ('b'). Sets the shape of the allowance over the dart.
   */
  press: 'a' | 'b'
  /** How far the stitching stops short of the apex, mm (bust darts: 1,5–2,5 cm). */
  shorten?: number
}

export interface Edge {
  id: string
  kind: EdgeKind
  line: Line
  dart?: DartLeg
}

/** A closed dart inside the piece: top, the two waist points and the bottom. */
export interface FishDart {
  id: string
  top: Vec
  left: Vec
  bottom: Vec
  right: Vec
}

export type PanelRole =
  | 'back' | 'front' | 'sleeve' | 'cuff'
  | 'skirtBack' | 'skirtFront'
  | 'trousersBack' | 'trousersFront'

export interface Notch {
  edge: string
  at: Vec
  double?: boolean
}

export interface Panel {
  id: string
  title: string
  role: PanelRole
  /** Method name for the label, e.g. «ЕМКО СЭВ». */
  method: string
  edges: Edge[]
  fish: FishDart[]
  marks: { role: PathRole; line: Line }[]
  grain: [Vec, Vec]
  /** How many to cut, as printed: «Крой 2 (шов посередине)». */
  cut: string
  labelAt: Vec
  /** Small labels on the piece (линия талии…). */
  notes: { at: Vec; text: string; size?: number }[]
  /** Horizontal construction levels, y in mm. */
  levels: Partial<Record<'chest' | 'waist' | 'hip' | 'elbow' | 'knee', number>>
  /** Extra notches on the seam line (matching marks). */
  notches: Notch[]
  /** Seam lengths reported by the block (for its checks). */
  seams?: Record<string, number>
}

const DEFAULT_KIND: Record<string, EdgeKind> = { hem: 'hem' }

/**
 * Builds a closed outline edge by edge, in the same style as `Line`:
 *
 *   new Outline(P91, 'cb').to(P51).to(P41)
 *     .edge('waist').append(w1).dart('waist', tip, right).append(w2)
 *     .edge('side').to(P54).to(P94)
 *     .edge('hem').close()
 */
export class Outline {
  readonly edges: Edge[] = []
  private cur: Edge
  constructor(start: Vec, id: string, kind?: EdgeKind) {
    this.cur = { id, kind: kind ?? DEFAULT_KIND[id] ?? 'seam', line: new Line(start) }
    this.edges.push(this.cur)
  }
  get end(): Vec {
    return this.cur.line.end
  }
  /** Start a new edge at the current end. */
  edge(id: string, kind?: EdgeKind): this {
    if (this.cur.line.segs.length === 0) this.edges.pop()
    this.cur = { id, kind: kind ?? DEFAULT_KIND[id] ?? 'seam', line: new Line(this.end) }
    this.edges.push(this.cur)
    return this
  }
  to(p: Vec): this {
    this.cur.line.to(p)
    return this
  }
  append(l: Line): this {
    this.cur.line.append(l)
    return this
  }
  /** Dart legs end → tip → right, then the edge before the dart goes on. */
  dart(id: string, tip: Vec, right: Vec, press: 'a' | 'b' = 'a', shorten?: number): this {
    const resume = this.cur
    const extra = shorten === undefined ? {} : { shorten }
    this.edge(id, 'dart')
    this.cur.dart = { id, leg: 1, press, ...extra }
    this.to(tip)
    this.edge(id, 'dart')
    this.cur.dart = { id, leg: 2, press, ...extra }
    this.to(right)
    return this.edge(resume.id, resume.kind)
  }
  /** Close the loop back to the start with a straight line (as the current edge). */
  close(): Edge[] {
    const start = this.edges[0]!.line.start
    const e = this.end
    if (Math.hypot(e.x - start.x, e.y - start.y) > 1e-6) this.to(start)
    if (this.cur.line.segs.length === 0) this.edges.pop()
    return this.edges
  }
}

/** The whole outline as one closed line. */
export function outlineOf(p: Pick<Panel, 'edges'>): Line {
  const l = new Line(p.edges[0]!.line.start)
  for (const e of p.edges) l.append(e.line)
  return l
}

export function fishLine(f: FishDart): Line {
  return new Line(f.top).to(f.left).to(f.bottom).to(f.right).to(f.top)
}

/** Seam lengths by edge name (dart legs left out). */
export function edgeLengths(p: Pick<Panel, 'edges'>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of p.edges) if (e.kind !== 'dart') out[e.id] = (out[e.id] ?? 0) + e.line.length()
  return out
}

export function edgesById(p: Pick<Panel, 'edges'>, id: string): Edge[] {
  return p.edges.filter((e) => e.id === id && e.kind !== 'dart')
}

/** The base block as printed in M2: the net outline, without allowances. */
export function netPiece(p: Panel): Piece {
  const fold = p.edges.find((e) => e.kind === 'fold')
  return toPiece({
    id: p.id,
    title: p.title,
    outline: outlineOf(p),
    extra: [...p.fish.map((f) => ({ role: 'mark' as const, line: fishLine(f) })), ...p.marks],
    ...(fold ? { fold: [fold.line.start, fold.line.end] as [Vec, Vec] } : {}),
    grain: p.grain,
    labels: [
      { at: p.labelAt, text: p.title, size: 7 },
      { at: v(p.labelAt.x, p.labelAt.y + 12), text: p.cut },
      { at: v(p.labelAt.x, p.labelAt.y + 22), text: `${p.method} · без припусков` },
      ...p.notes,
    ],
    seams: p.seams ?? edgeLengths(p),
  })
}

export function clonePanel(p: Panel): Panel {
  return {
    ...p,
    edges: p.edges.map((e) => ({ ...e, line: e.line.map((q) => q), ...(e.dart ? { dart: { ...e.dart } } : {}) })),
    fish: p.fish.map((f) => ({ ...f })),
    marks: p.marks.map((m) => ({ role: m.role, line: m.line.map((q) => q) })),
    notes: p.notes.map((n) => ({ ...n })),
    levels: { ...p.levels },
    notches: p.notches.map((n) => ({ ...n })),
    grain: [p.grain[0], p.grain[1]],
    ...(p.seams ? { seams: { ...p.seams } } : {}),
  }
}
