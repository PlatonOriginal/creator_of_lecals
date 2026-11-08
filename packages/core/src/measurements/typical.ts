import { MEASUREMENT_IDS, type MeasurementId, type MeasurementSet, type Measurements } from './schema'

/**
 * Typical-figure prefill after ГОСТ 31396-2009.
 *
 * The standard classifies women's figures by three leading measurements:
 * height (Р), bust girth Ог3 and hip girth Об. Every other measurement of a
 * typical figure changes almost linearly between neighbouring sizes and
 * heights, so we model it as
 *
 *   value = base + perHeight·(Р − 164) + perBust·(Ог3 − 88) + perHips·(Об − 96)
 *
 * around the base figure 164-88-96 (all in mm, coefficients per mm).
 *
 * IMPORTANT: the base values and coefficients below are APPROXIMATE, put
 * together from textbook tables (ЕМКО СЭВ) for the base figure and the usual
 * inter-size and inter-height differences. They are a starting point that the
 * user then measures and corrects, and the yardstick for the plausibility
 * check. ГОСТ 31396-2009 itself only classifies the figures (table 3, below)
 * and defines how to measure (table 2); the values of the size features for
 * each figure are published separately (ОСТ 17-326-86 and its successors).
 */
interface Regression {
  base: number
  perHeight?: number
  perBust?: number
  perHips?: number
  /** Typical spread between real people with the same leading measurements, mm. */
  spread: number
}

export const BASE_FIGURE = { height: 1640, bust: 880, hips: 960 } as const

const TYPICAL: Record<Exclude<MeasurementId, 'height' | 'bust' | 'hips'>, Regression> = {
  waist: { base: 700, perBust: 0.6, perHips: 0.45, spread: 50 },
  bustUpper: { base: 850, perBust: 0.85, spread: 30 },
  bustFull: { base: 935, perBust: 1.0, spread: 30 },
  underbust: { base: 745, perBust: 0.8, perHips: 0.05, spread: 40 },
  neck: { base: 355, perHeight: 0.05, perBust: 0.25, spread: 20 },
  shoulderLength: { base: 128, perHeight: 0.08, perBust: 0.05, spread: 12 },
  backWidth: { base: 345, perHeight: 0.1, perBust: 0.3, spread: 25 },
  chestWidth: { base: 330, perHeight: 0.05, perBust: 0.35, spread: 25 },
  bustSpan: { base: 190, perBust: 0.2, spread: 20 },
  bustHeight: { base: 265, perHeight: 0.15, perBust: 0.15, spread: 20 },
  frontLength: { base: 435, perHeight: 0.25, perBust: 0.2, spread: 20 },
  backLength: { base: 410, perHeight: 0.25, perBust: 0.05, spread: 20 },
  shoulderSlantBack: { base: 425, perHeight: 0.25, perBust: 0.1, spread: 20 },
  armholeDepth: { base: 200, perHeight: 0.1, perBust: 0.15, spread: 20 },
  upperArm: { base: 280, perBust: 0.35, perHips: 0.1, spread: 30 },
  wrist: { base: 155, perHeight: 0.03, perBust: 0.05, spread: 12 },
  armLength: { base: 580, perHeight: 0.33, spread: 25 },
  elbowLength: { base: 330, perHeight: 0.2, spread: 20 },
  waistToHips: { base: 190, perHeight: 0.1, spread: 25 },
  crotchDepth: { base: 265, perHeight: 0.1, perHips: 0.15, spread: 25 },
  waistToKnee: { base: 590, perHeight: 0.35, spread: 30 },
  waistToFloor: { base: 1060, perHeight: 0.6, spread: 35 },
  waistToFloorBack: { base: 1040, perHeight: 0.6, spread: 35 },
  waistToFloorFront: { base: 1050, perHeight: 0.6, perHips: -0.05, spread: 35 },
  thigh: { base: 560, perHips: 0.5, spread: 40 },
  knee: { base: 365, perBust: 0.05, perHips: 0.15, spread: 25 },
  calf: { base: 350, perHips: 0.2, spread: 30 },
  ankle: { base: 220, perHeight: 0.05, perHips: 0.04, spread: 15 },
  skirtLength: { base: 600, perHeight: 0.3, spread: Infinity },
}

export interface LeadingMeasurements {
  height: number
  bust: number
  hips: number
}

/** Typical value of one measurement and how far real people usually deviate from it. */
export function typicalValue(id: MeasurementId, lead: LeadingMeasurements): { value: number; spread: number } {
  if (id === 'height' || id === 'bust' || id === 'hips') return { value: lead[id], spread: 0 }
  const r = TYPICAL[id]
  const value =
    r.base +
    (r.perHeight ?? 0) * (lead.height - BASE_FIGURE.height) +
    (r.perBust ?? 0) * (lead.bust - BASE_FIGURE.bust) +
    (r.perHips ?? 0) * (lead.hips - BASE_FIGURE.hips)
  return { value: Math.round(value / 5) * 5, spread: r.spread }
}

/** Full typical figure for the given leading measurements, rounded to 0.5 cm. */
export function typicalFigure(lead: LeadingMeasurements): Measurements {
  return Object.fromEntries(MEASUREMENT_IDS.map((id) => [id, typicalValue(id, lead).value])) as Measurements
}

/**
 * Prefill: keeps every value the user already entered and fills the gaps from
 * the typical figure. If the waist is known it nudges the waist-dependent
 * girths a little, the rest follows the leading three.
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
