/**
 * Measurements are stored once, in millimetres, as a superset of what every
 * drafting method needs. M0 only defines the few the test piece uses; M1 brings
 * the full schema with ranges and relations.
 */
export interface MeasurementSpec {
  id: string
  title: string
  min: number
  max: number
}

export const MEASUREMENTS = {
  waist: { id: 'waist', title: 'Обхват талии (От)', min: 500, max: 1500 },
  hips: { id: 'hips', title: 'Обхват бёдер (Об)', min: 700, max: 1700 },
  waistToHips: { id: 'waistToHips', title: 'Высота бёдер (Дтб)', min: 150, max: 260 },
  skirtLength: { id: 'skirtLength', title: 'Длина юбки (Ди)', min: 300, max: 1200 },
} as const satisfies Record<string, MeasurementSpec>

export type MeasurementId = keyof typeof MEASUREMENTS
export type Measurements = Record<MeasurementId, number>

/** Типовая фигура 164-88-96 (ГОСТ 31396-2009), значения округлены. */
export const SAMPLE_MEASUREMENTS: Measurements = {
  waist: 700,
  hips: 960,
  waistToHips: 190,
  skirtLength: 600,
}

export function validateMeasurements(m: Partial<Measurements>): string[] {
  const errors: string[] = []
  for (const spec of Object.values(MEASUREMENTS)) {
    const v = m[spec.id as MeasurementId]
    if (v === undefined || Number.isNaN(v)) errors.push(`${spec.title}: не задано`)
    else if (v < spec.min || v > spec.max)
      errors.push(`${spec.title}: ${v / 10} см вне диапазона ${spec.min / 10}–${spec.max / 10} см`)
  }
  if (m.waist !== undefined && m.hips !== undefined && m.waist > m.hips)
    errors.push('Обхват талии больше обхвата бёдер: проверьте мерки')
  return errors
}
