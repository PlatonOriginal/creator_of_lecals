import type { MaleMeasurementSet } from './schema'

/**
 * Расчётные мужские признаки (ГОСТ 17521-72, № 60–63) и производные
 * вертикали (спецификация § 3.4).
 *
 * Расчётный признак хранится со источником 'derived' и формулой, чтобы
 * пользователь мог отличить его от измерения; типы значения — ниже.
 */

/** Where a stored value came from. */
export type MaleMeasurementSource = 'measured' | 'derived' | 'typical' | 'estimated'

/** A stored measurement value with its provenance. */
export interface MaleMeasurementValue {
  value: number
  source: MaleMeasurementSource
  /** Formula of a derived value, e.g. «Т42 − Т41». */
  formula?: string
  /** When the value was measured or computed. */
  measuredAt?: string
}

/** Расчётные признаки: id признака ГОСТ → формула и слагаемые. */
export const MALE_DERIVED_FORMULAS = {
  frontArcThroughShoulder: 'Т60 = Т42 − Т41',
  frontArcThroughNeckBase: 'Т61 = Т44 − Т43',
  upperArmLength: 'Т62 = Т32 − Т31',
  forearmLength: 'Т63 = Т33 − Т32',
  waistToHipVertical: 'Т7 − Т12',
  waistToKneeVertical: 'Т7 − Т9',
  frontAsisToWaistVertical: 'Т7 − Т8',
} as const

export type MaleDerivedId = keyof typeof MALE_DERIVED_FORMULAS

/** Расчётные признаки, мм. Появляются, только если заданы все слагаемые. */
export type MaleDerived = Partial<Record<MaleDerivedId, number>>

/** Т60–Т63 из ГОСТ 17521-72 и производные вертикали, где хватает данных. */
export function maleDerived(m: MaleMeasurementSet): MaleDerived {
  const d: MaleDerived = {}
  if (m.upperTorsoArcThroughShoulder !== undefined && m.slantedShoulderHeight !== undefined)
    d.frontArcThroughShoulder = m.upperTorsoArcThroughShoulder - m.slantedShoulderHeight
  if (m.upperTorsoArc !== undefined && m.backWaistToNeckBase !== undefined)
    d.frontArcThroughNeckBase = m.upperTorsoArc - m.backWaistToNeckBase
  if (m.neckToRadial !== undefined && m.shoulderSlope !== undefined) d.upperArmLength = m.neckToRadial - m.shoulderSlope
  if (m.neckToWrist !== undefined && m.neckToRadial !== undefined) d.forearmLength = m.neckToWrist - m.neckToRadial
  if (m.waistHeight !== undefined && m.glutealFoldHeight !== undefined)
    d.waistToHipVertical = m.waistHeight - m.glutealFoldHeight
  if (m.waistHeight !== undefined && m.kneeHeight !== undefined) d.waistToKneeVertical = m.waistHeight - m.kneeHeight
  if (m.waistHeight !== undefined && m.frontAsisHeight !== undefined)
    d.frontAsisToWaistVertical = m.waistHeight - m.frontAsisHeight
  return d
}

/**
 * Полуобхваты для расчёта (спецификация § 3.4.3): считаются методикой,
 * но не хранятся вместо полного обхвата.
 */
export function maleHalves(m: MaleMeasurementSet) {
  return {
    halfChest3: m.chest3 !== undefined ? m.chest3 / 2 : undefined,
    halfWaist: m.waist !== undefined ? m.waist / 2 : undefined,
    halfHips: m.hips !== undefined ? m.hips / 2 : undefined,
    halfThigh: m.thigh !== undefined ? m.thigh / 2 : undefined,
  }
}
