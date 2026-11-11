import type { Piece } from '../geometry'
import type { MeasurementId, Measurements } from '../measurements'
import type { Vec } from '../draft/geom'
import type { Panel } from '../pattern/panel'

export type MethodId = 'emko' | 'muller'

export const METHODS: Record<MethodId, string> = {
  emko: 'ЕМКО СЭВ',
  muller: 'М. Мюллер и сын',
}

/** Силуэт: задаёт прибавки на свободу облегания по умолчанию. */
export type Silhouette = 'fitted' | 'semi' | 'straight'

export const SILHOUETTES: { id: Silhouette; title: string }[] = [
  { id: 'fitted', title: 'Прилегающий' },
  { id: 'semi', title: 'Полуприлегающий' },
  { id: 'straight', title: 'Прямой' },
]

/** A number the user can change for one model, mm unless said otherwise. */
export interface BlockOption {
  id: string
  title: string
  /** Short textbook name, e.g. «Пб». */
  short?: string
  min: number
  max: number
  step: number
  hint?: string
}

/** One line of the calculation table: what the textbook asks you to compute. */
export interface CalcStep {
  /** Textbook segment or quantity, e.g. «ББ1» or «ΣВ». */
  id: string
  title: string
  /** The formula as printed in the textbook, e.g. «Сб + Пб». */
  formula: string
  /** Result, mm (or degrees when unit is '°'). */
  value: number
  unit?: '°'
}

/** Two seam lengths that must match (or differ by a planned ease). */
export interface SeamCheck {
  id: string
  title: string
  a: number
  b: number
  /** Planned difference a − b, mm (e.g. the ease of a sleeve cap). */
  expected: number
  tolerance: number
  ok: boolean
}

export interface BlockResult {
  /** Pieces with named edges: what the modelling steps work on. */
  panels: Panel[]
  /** The same pieces drawn as the net block (no allowances). */
  pieces: Piece[]
  /**
   * Control points in one coordinate frame, with names shared by all methods
   * (waistCB, hipSide, …). Modelling steps of stage M3 work only with these.
   */
  points: Record<string, Vec>
  steps: CalcStep[]
  checks: SeamCheck[]
  warnings: string[]
}

export type GarmentKind = 'skirt' | 'dress' | 'trousers'

export interface BlockDef<O extends Record<string, number> = Record<string, number>> {
  id: string
  title: string
  garment: GarmentKind
  method: MethodId
  /** Measurements the method needs; checked with validateMeasurements. */
  required: readonly MeasurementId[]
  options: (BlockOption & { id: keyof O & string })[]
  defaults: (s: Silhouette) => O
  draft: (m: Pick<Measurements, MeasurementId>, o: O) => BlockResult
}

export function check(id: string, title: string, a: number, b: number, expected = 0, tolerance = 3): SeamCheck {
  return { id, title, a, b, expected, tolerance, ok: Math.abs(a - b - expected) <= tolerance }
}

/** Calculation table helper: records the step and returns its value. */
export function calc(steps: CalcStep[]) {
  return (id: string, title: string, formula: string, value: number, unit?: '°'): number => {
    steps.push(unit ? { id, title, formula, value, unit } : { id, title, formula, value })
    return value
  }
}
