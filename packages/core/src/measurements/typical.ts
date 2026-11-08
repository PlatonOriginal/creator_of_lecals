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
 * check. They are not the official table: replace them with the exact values
 * from the full text of ГОСТ 31396-2009 when we have it (see docs/m1-results.md).
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
 * The nearest typical figure of ГОСТ 31396-2009: heights 146…182 in steps of
 * 6 cm, Ог3 from 80 cm in steps of 4 cm, Об from 82 cm in steps of 4 cm, and
 * six fullness groups 0…5 by Об − Ог3 = −2, +2, +6, +10, +14, +18 cm.
 */
export interface TypicalFigureLabel {
  height: number
  bust: number
  hips: number
  /** Полнотная группа 0…5. */
  group: number
  /** «164-88-94» */
  label: string
}

const GROUP_DIFF = [-20, 20, 60, 100, 140, 180]

export function nearestTypicalFigure(lead: LeadingMeasurements): TypicalFigureLabel {
  const snap = (v: number, start: number, step: number, min: number, max: number) =>
    Math.min(max, Math.max(min, start + Math.round((v - start) / step) * step))
  const height = snap(lead.height, 1460, 60, 1460, 1820)
  const bust = snap(lead.bust, 800, 40, 800, 1360)
  const diff = lead.hips - bust
  let group = 0
  for (let g = 1; g < GROUP_DIFF.length; g++)
    if (Math.abs(diff - GROUP_DIFF[g]!) < Math.abs(diff - GROUP_DIFF[group]!)) group = g
  const hips = bust + GROUP_DIFF[group]!
  return { height, bust, hips, group, label: `${height / 10}-${bust / 10}-${hips / 10}` }
}
