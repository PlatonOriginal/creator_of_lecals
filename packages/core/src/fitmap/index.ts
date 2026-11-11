/**
 * The garment as rings round the body (stage M4, «примерка» without physics).
 *
 * The model's panels give, at every height, the girth of the finished
 * garment: the widths of all panels across a horizontal line, dart intake
 * left out, times two (every panel is a half: on the fold, or cut twice).
 * Compared with the body girths this is the ease map: where the garment is
 * tight, fitted or loose, in centimetres. The same rings, lifted onto the
 * mannequin, make the translucent «чехол».
 *
 * Heights are «dy»: mm below the waist line of the pattern (negative above).
 */
import type { Vec } from '../draft/geom'
import type { GarmentKind } from '../blocks/types'
import type { Measurements } from '../measurements'
import { fishLine, outlineOf, type Panel } from '../pattern/panel'

export interface SleeveProfile {
  /** mm from the top of the cap down to the underarm line, and to the end of the sleeve (cuff included). */
  underarm: number
  length: number
  /** Girth of the sleeve d mm below the top of the cap. */
  girthAt: (d: number) => number
}

export interface GarmentProfile {
  garment: GarmentKind
  /** dy of the top of the rings: the underarm line of a dress, the waist of a skirt or trousers. */
  top: number
  /** dy of the hem (the lowest point of the hem). */
  hem: number
  /** dy of the construction levels of the pattern; bust: the bust points (apex of the bust dart). */
  levels: { chest?: number; bust?: number; waist: number; hip?: number; crotch?: number; knee?: number }
  /** Skirts and trousers: length of the waist seam (both halves, darts closed). */
  waistSeam?: number
  /** Girth round the whole body (torso, or both legs under a skirt) at dy; 0 outside the garment. */
  girthAt: (dy: number) => number
  /** Trousers: girth of one leg at dy (below the crotch). */
  legGirthAt?: (dy: number) => number
  sleeve?: SleeveProfile
}

/** Points of a closed polygon. */
type Poly = Vec[]

/** Total length of a horizontal line at y inside the polygon (even–odd). */
export function widthAt(poly: Poly, y: number): number {
  const xs: number[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    if (a.y > y === b.y > y) continue
    xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x))
  }
  xs.sort((p, q) => p - q)
  let w = 0
  for (let i = 0; i + 1 < xs.length; i += 2) w += xs[i + 1]! - xs[i]!
  return w
}

interface PanelShape {
  panel: Panel
  outline: Poly
  fish: Poly[]
  waistY: number
  minY: number
  maxY: number
}

const ys = (pts: Vec[]) => pts.map((p) => p.y)

function shapeOf(p: Panel): PanelShape {
  const outline = outlineOf(p).points(16)
  const side = p.edges.filter((e) => e.id === 'side' && e.kind !== 'dart').flatMap((e) => e.line.points(4))
  // Skirts and trousers have no waist level: their waist is the top of the side seam.
  const waistY = p.levels.waist ?? (side.length ? Math.min(...ys(side)) : Math.min(...ys(outline)))
  return {
    panel: p,
    outline,
    fish: p.fish.map((f) => fishLine(f).points(2)),
    waistY,
    minY: Math.min(...ys(outline)),
    maxY: Math.max(...ys(outline)),
  }
}

/** Width of the panel at dy below its waist, intake of fish darts left out. */
function panelWidth(s: PanelShape, dy: number): number {
  const y = s.waistY + dy
  if (y < s.minY || y > s.maxY) return 0
  let w = widthAt(s.outline, y)
  for (const f of s.fish) w -= widthAt(f, y)
  return Math.max(0, w)
}

const BODY_ROLES = new Set(['back', 'front', 'skirtBack', 'skirtFront', 'trousersBack', 'trousersFront'])

/**
 * @param base panels of the block before modelling: they still have the
 *   bust dart, whose apex marks the bust points (a princess seam hides it).
 */
export function garmentProfile(panels: Panel[], garment: GarmentKind, base: Panel[] = panels): GarmentProfile {
  const body = panels.filter((p) => BODY_ROLES.has(p.role)).map(shapeOf)
  const first = body[0]
  if (!first) throw new Error('В модели нет деталей стана')
  const rel = (s: PanelShape, y: number | undefined) => (y === undefined ? undefined : y - s.waistY)
  const levels: GarmentProfile['levels'] = { waist: 0 }
  const chest = rel(first, first.panel.levels.chest)
  const hip = rel(first, first.panel.levels.hip)
  const knee = rel(first, first.panel.levels.knee)
  if (chest !== undefined) levels.chest = chest
  if (hip !== undefined) levels.hip = hip
  if (knee !== undefined) levels.knee = knee
  const apex = base
    .flatMap((p) => p.edges.filter((e) => e.kind === 'dart' && e.dart?.id === 'bust' && e.dart.leg === 1).map((e) => e.line.end.y))
    .at(0)
  if (apex !== undefined) levels.bust = Math.max(apex - first.waistY, chest ?? -Infinity)
  const hem = Math.max(...body.map((s) => s.maxY - s.waistY))
  const top = garment === 'dress' ? (levels.chest ?? Math.min(...body.map((s) => s.minY - s.waistY))) : 0

  const girthAt = (dy: number) => 2 * body.reduce((acc, s) => acc + panelWidth(s, dy), 0)
  const profile: GarmentProfile = { garment, top, hem, levels, girthAt }
  if (garment !== 'dress') {
    const seam = body.reduce(
      (acc, s) => acc + s.panel.edges.filter((e) => e.id === 'waist' && e.kind !== 'dart').reduce((a, e) => a + e.line.length(), 0),
      0,
    )
    if (seam > 0) profile.waistSeam = 2 * seam
  }

  if (garment === 'trousers') {
    const crotchPts = body.flatMap((s) =>
      s.panel.edges.filter((e) => e.id === 'crotch').flatMap((e) => e.line.points(8).map((q) => q.y - s.waistY)),
    )
    if (crotchPts.length) levels.crotch = Math.max(...crotchPts)
    profile.legGirthAt = (dy) => body.reduce((acc, s) => acc + panelWidth(s, dy), 0)
  }

  const sleevePanel = panels.find((p) => p.role === 'sleeve')
  if (sleevePanel) {
    const s = shapeOf(sleevePanel)
    const capTop = s.minY
    const cuff = panels.find((p) => p.role === 'cuff')
    const cuffPts = cuff ? outlineOf(cuff).points(2) : []
    const cuffLength = cuffPts.length ? Math.max(...cuffPts.map((q) => q.x)) - Math.min(...cuffPts.map((q) => q.x)) : 0
    // The cuff is cut double with a fold: the finished height is half the piece.
    const cuffHeight = cuffPts.length ? (Math.max(...ys(cuffPts)) - Math.min(...ys(cuffPts))) / 2 : 0
    const sleeveLength = s.maxY - capTop
    const underarm = (sleevePanel.levels.chest ?? capTop + sleeveLength * 0.25) - capTop
    profile.sleeve = {
      underarm,
      length: sleeveLength + cuffHeight,
      girthAt: (d) => {
        if (d > sleeveLength) return d <= sleeveLength + cuffHeight ? cuffLength : 0
        let w = widthAt(s.outline, capTop + d)
        for (const f of s.fish) w -= widthAt(f, capTop + d)
        return Math.max(0, w)
      },
    }
  }
  return profile
}

export type EaseVerdict = 'tight' | 'snug' | 'fitted' | 'loose' | 'veryLoose'

export const EASE_VERDICTS: Record<EaseVerdict, { title: string; color: string }> = {
  tight: { title: 'тесно', color: '#d64541' },
  snug: { title: 'впритык', color: '#e8913a' },
  fitted: { title: 'по фигуре', color: '#3a9d5d' },
  loose: { title: 'свободно', color: '#4a90c9' },
  veryLoose: { title: 'очень свободно', color: '#5b5fc7' },
}

/** Ease in mm → verdict: < 0 tight, up to 1 cm snug, up to 6 cm fitted, up to 12 cm loose. */
export function easeVerdict(ease: number): EaseVerdict {
  if (ease < 0) return 'tight'
  if (ease < 10) return 'snug'
  if (ease <= 60) return 'fitted'
  if (ease <= 120) return 'loose'
  return 'veryLoose'
}

export type FitLevelId = 'bust' | 'waist' | 'hips' | 'thigh' | 'knee' | 'upperArm'

export interface FitLevel {
  id: FitLevelId
  title: string
  /** Girth of the garment and of the body, mm. */
  garment: number
  body: number
  ease: number
  verdict: EaseVerdict
  /** Where on the pattern: dy (torso and legs) or mm below the cap top (sleeve). */
  at: number
}

/**
 * The ease map: garment against body at the chest, waist and hip lines,
 * the thigh and knee of trousers and the upper arm of a sleeve. Levels the
 * garment does not reach (a top that stops above the hips…) are left out.
 */
export function fitLevels(profile: GarmentProfile, m: Partial<Measurements>): FitLevel[] {
  const out: FitLevel[] = []
  const add = (id: FitLevelId, title: string, garment: number, body: number | undefined, at: number) => {
    if (!body || garment <= 0) return
    const ease = garment - body
    out.push({ id, title, garment, body, ease, verdict: easeVerdict(ease), at })
  }
  const { levels } = profile
  const within = (dy: number | undefined) => dy !== undefined && dy >= profile.top - 1 && dy <= profile.hem
  // The bust is compared at the bust points: higher up the bust dart is still open.
  const bustDy = levels.bust ?? levels.chest
  if (profile.garment === 'dress' && within(bustDy)) add('bust', 'Грудь', profile.girthAt(bustDy!), m.bust, bustDy!)
  // The waist of a skirt or trousers is its top edge: the length of the waist seam.
  if (profile.waistSeam) add('waist', 'Талия', profile.waistSeam, m.waist, 0)
  else if (within(0)) add('waist', 'Талия', profile.girthAt(0), m.waist, 0)
  if (within(levels.hip)) add('hips', 'Бёдра', profile.girthAt(levels.hip!), m.hips, levels.hip!)
  if (profile.legGirthAt && levels.crotch !== undefined) {
    const dy = levels.crotch + 30
    if (dy <= profile.hem) add('thigh', 'Бедро', profile.legGirthAt(dy), m.thigh, dy)
    if (levels.knee !== undefined && levels.knee <= profile.hem) add('knee', 'Колено', profile.legGirthAt(levels.knee), m.knee, levels.knee)
  }
  const sl = profile.sleeve
  if (sl && sl.length > sl.underarm + 20) add('upperArm', 'Рукав (плечо)', sl.girthAt(sl.underarm + 10), m.upperArm, sl.underarm + 10)
  return out
}
