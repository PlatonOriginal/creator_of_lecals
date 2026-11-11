import {
  OST_BAND_FIRST_BUST,
  OST_BAND_LAST_BUST,
  OST_BASE_HEIGHT,
  OST_FEATURES,
  OST_GROUP_FIRST_DIFF,
  OST_GROUP_STEP,
} from './ost17326'
import { MEASUREMENT_IDS, type MeasurementId, type MeasurementSet, type Measurements } from './schema'

/**
 * Typical-figure prefill.
 *
 * Women's typical figures are classified by three leading measurements:
 * height (Р), bust girth Ог3 and hip girth Об (ГОСТ 31396-2009, table 3,
 * below). The values of all the other size features come from the tables of
 * ОСТ 17-326-81 (see ost17326.ts), which are exact for its 137 figures:
 * heights 146…176, Ог3 84…136, Об − Ог3 = 4, 8, 12, 16 cm.
 *
 * Real people and the newer ГОСТ grid fall between and outside those figures,
 * so the tables are interpolated: linearly in height and bust inside a bust
 * band, linearly between neighbouring fullness groups by Об − Ог3 (and
 * extrapolated the same way beyond groups 1 and 4), and blended across the
 * 104…108 and 120…124 gaps between the bust bands.
 *
 * waistToHips and skirtLength are not size features of the standard and stay
 * approximate. `spread` is our own estimate of how far real people with the
 * same leading measurements usually deviate; it drives the plausibility check.
 */
export const BASE_FIGURE = { height: 1640, bust: 880, hips: 960 } as const

type DerivedId = Exclude<MeasurementId, 'height' | 'bust' | 'hips'>

/** How a measurement is put together from the features of ОСТ 17-326-81: Σ factor · feature. */
type OstTerms = [feature: number, factor: number][]

const FROM_OST: Partial<Record<DerivedId, OstTerms>> = {
  waist: [[18, 2]],
  bustUpper: [[14, 2]],
  bustFull: [[15, 2]],
  underbust: [[17, 2]],
  neck: [[13, 2]],
  shoulderLength: [[31, 1]],
  backWidth: [[47, 2]],
  chestWidth: [[45, 2]],
  bustSpan: [[46, 2]],
  // Т35 and Т34 start at the seventh vertebra; we measure from the neck base point at the shoulder (Т76 further).
  bustHeight: [[35, 1], [76, -1]],
  frontLength: [[61, 1]],
  backLength: [[40, 1]],
  shoulderSlantBack: [[41, 1]],
  armholeDepth: [[39, 1]],
  armholeDepthFront: [[34, 1], [76, -1]],
  armholeArc: [[38, 1]],
  // Waist at the back up to the neck base point (Т43) and down over the bust to the waist (Т61).
  torsoArc: [[43, 1], [61, 1]],
  armDepth: [[57, 1]],
  upperArm: [[28, 1]],
  wrist: [[29, 1]],
  armLength: [[68, 1]],
  elbowLength: [[62, 1]],
  crotchDepth: [[49, 1]],
  waistToKnee: [[71, 1]],
  waistToFloor: [[25, 1]],
  waistToFloorBack: [[7, 1]],
  waistToFloorFront: [[26, 1]],
  glutealFoldHeight: [[12, 1]],
  inseam: [[27, 1]],
  instep: [[51, 1]],
  thigh: [[21, 1]],
  knee: [[22, 1]],
  calf: [[23, 1]],
  ankle: [[24, 1]],
}

/** Measurements the standard does not have: value = base + perHeight·(Р − 164), mm. */
const APPROXIMATE: Partial<Record<DerivedId, { base: number; perHeight: number }>> = {
  waistToHips: { base: 190, perHeight: 0.1 },
  skirtLength: { base: 600, perHeight: 0.3 },
}

/** Typical spread between real people with the same leading measurements, mm. */
const SPREAD: Record<DerivedId, number> = {
  waist: 50,
  bustUpper: 30,
  bustFull: 30,
  underbust: 40,
  neck: 20,
  shoulderLength: 12,
  backWidth: 25,
  chestWidth: 25,
  bustSpan: 20,
  bustHeight: 20,
  frontLength: 20,
  backLength: 20,
  shoulderSlantBack: 20,
  armholeDepth: 20,
  armholeDepthFront: 20,
  armholeArc: 25,
  torsoArc: 30,
  armDepth: 12,
  upperArm: 30,
  wrist: 12,
  armLength: 25,
  elbowLength: 20,
  waistToHips: 25,
  crotchDepth: 25,
  waistToKnee: 30,
  waistToFloor: 35,
  waistToFloorBack: 35,
  waistToFloorFront: 35,
  glutealFoldHeight: 25,
  inseam: 30,
  instep: 15,
  thigh: 40,
  knee: 25,
  calf: 30,
  ankle: 15,
  skirtLength: Infinity,
}

export interface LeadingMeasurements {
  height: number
  bust: number
  hips: number
}

/** One bust band of one feature for a (fractional) fullness group, at the given bust and height. */
function bandValue(feature: number, band: 0 | 1 | 2, group: number, lead: LeadingMeasurements): number {
  const bands = OST_FEATURES[feature]!
  const [bases, sizeStep, heightStep] = bands[band]
  // Band C exists for group 2 only: the other groups keep their offset from group 2 of band B.
  const groupBases = bases.length === 4 ? bases : bands[1][0].map((b) => bases[0]! + b - bands[1][0][1]!)
  const i = Math.min(2, Math.max(0, Math.floor(group)))
  const base = groupBases[i]! + (group - i) * (groupBases[i + 1]! - groupBases[i]!)
  return (
    base +
    (sizeStep * (lead.bust - OST_BAND_FIRST_BUST[band])) / 40 +
    (heightStep * (lead.height - OST_BASE_HEIGHT)) / 60
  )
}

/** Value of one size feature of ОСТ 17-326-81 for any leading measurements, mm (not rounded). */
export function ostFeature(feature: number, lead: LeadingMeasurements): number {
  const group = (lead.hips - lead.bust - OST_GROUP_FIRST_DIFF) / OST_GROUP_STEP
  for (const band of [0, 1] as const) {
    const last = OST_BAND_LAST_BUST[band]
    const next = OST_BAND_FIRST_BUST[band + 1]!
    if (lead.bust <= last) return bandValue(feature, band, group, lead)
    if (lead.bust < next) {
      const lo = bandValue(feature, band, group, { ...lead, bust: last })
      const hi = bandValue(feature, (band + 1) as 1 | 2, group, { ...lead, bust: next })
      return lo + ((hi - lo) * (lead.bust - last)) / (next - last)
    }
  }
  return bandValue(feature, 2, group, lead)
}

/** Typical value of one measurement (to 1 mm) and how far real people usually deviate from it. */
export function typicalValue(id: MeasurementId, lead: LeadingMeasurements): { value: number; spread: number } {
  if (id === 'height' || id === 'bust' || id === 'hips') return { value: lead[id], spread: 0 }
  const terms = FROM_OST[id]
  const approx = APPROXIMATE[id]
  const value = terms
    ? terms.reduce((sum, [feature, factor]) => sum + factor * ostFeature(feature, lead), 0)
    : approx!.base + approx!.perHeight * (lead.height - BASE_FIGURE.height)
  // Below Ог3 84 the tables are extrapolated and Ог1 would overtake Ог3; the tables never bring them closer than 8 mm.
  const capped = id === 'bustUpper' ? Math.min(value, lead.bust - 8) : value
  return { value: Math.round(capped), spread: SPREAD[id] }
}

/** Full typical figure for the given leading measurements. */
export function typicalFigure(lead: LeadingMeasurements): Measurements {
  return Object.fromEntries(MEASUREMENT_IDS.map((id) => [id, typicalValue(id, lead).value])) as Measurements
}

/**
 * Prefill: keeps every value the user already entered and fills the gaps from
 * the typical figure for the three leading measurements.
 */
export function prefill(m: MeasurementSet): MeasurementSet {
  const lead = leadingOf(m)
  if (!lead) return m
  const out: MeasurementSet = { ...typicalFigure(lead) }
  for (const id of MEASUREMENT_IDS) if (m[id] !== undefined) out[id] = m[id]
  return out
}

export function leadingOf(m: MeasurementSet): LeadingMeasurements | undefined {
  if (m.height === undefined || m.bust === undefined || m.hips === undefined) return undefined
  return { height: m.height, bust: m.bust, hips: m.hips }
}

/**
 * Typical figures of ГОСТ 31396-2009, table 3: for each fullness group
 * (Об − Ог3 = −2, +2, +6, +10, +14, +18 cm) the bust girths and the range of
 * heights (every 6 cm) that exist. 356 figures in all.
 */
const GROUP_DIFF = [-20, 20, 60, 100, 140, 180]
type Row = [group: number, busts: number[], minHeight: number, maxHeight: number]
const GOST_TABLE: Row[] = [
  [0, [84, 88, 92, 96, 100, 104], 152, 170],
  [0, [108, 112], 152, 176],
  [0, [116, 120, 124], 158, 176],
  [1, [80], 158, 170],
  [1, [84, 88, 92], 152, 176],
  [1, [96, 100, 104], 152, 182],
  [1, [108, 112, 116, 120], 152, 182],
  [1, [124], 158, 182],
  [2, [80, 84], 152, 176],
  [2, [88, 92, 96, 100, 104], 152, 182],
  [2, [108, 112, 116], 152, 182],
  [2, [120, 124], 158, 182],
  [2, [128, 132], 158, 176],
  [3, [80, 84], 152, 176],
  [3, [88, 92, 96, 100, 104], 152, 182],
  [3, [108], 152, 182],
  [3, [112, 116, 120, 124, 128], 158, 182],
  [3, [132], 158, 176],
  [4, [84], 152, 176],
  [4, [88, 92, 96, 100, 104], 152, 182],
  [4, [108], 152, 182],
  [4, [112, 116, 120, 124], 158, 182],
  [5, [88, 92], 164, 176],
  [5, [96, 100, 104], 158, 176],
  [5, [108, 112], 158, 176],
  [5, [116], 158, 170],
  [5, [120, 124], 158, 164],
]

export interface TypicalFigureLabel {
  height: number
  bust: number
  hips: number
  /** Полнотная группа 0…5. */
  group: number
  /** «164-88-94» */
  label: string
  /**
   * True when the person is within half a step of this figure in every
   * leading measurement (± 3 cm height, ± 2 cm girths), as the standard defines.
   */
  matches: boolean
}

/** All typical figures of the standard, mm. */
export const GOST_FIGURES: TypicalFigureLabel[] = GOST_TABLE.flatMap(([group, busts, h0, h1]) =>
  busts.flatMap((b) => {
    const out: TypicalFigureLabel[] = []
    for (let h = h0; h <= h1; h += 6) {
      const hips = b * 10 + GROUP_DIFF[group]!
      out.push({ height: h * 10, bust: b * 10, hips, group, label: `${h}-${b}-${hips / 10}`, matches: false })
    }
    return out
  }),
)

/** The nearest typical figure of ГОСТ 31396-2009 (table 3) for the given leading measurements. */
export function nearestTypicalFigure(lead: LeadingMeasurements): TypicalFigureLabel {
  let best = GOST_FIGURES[0]!
  let bestD = Infinity
  for (const f of GOST_FIGURES) {
    const d = ((f.height - lead.height) / 60) ** 2 + ((f.bust - lead.bust) / 40) ** 2 + ((f.hips - lead.hips) / 40) ** 2
    if (d < bestD) {
      bestD = d
      best = f
    }
  }
  const matches =
    Math.abs(best.height - lead.height) <= 30 && Math.abs(best.bust - lead.bust) <= 20 && Math.abs(best.hips - lead.hips) <= 20
  return { ...best, matches }
}
