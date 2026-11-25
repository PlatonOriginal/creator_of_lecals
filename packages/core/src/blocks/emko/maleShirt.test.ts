import { describe, expect, it } from 'vitest'
import {
  MALE_EMKO_GRADATION,
  MALE_EMKO_TABLE_8,
  gradeMaleFeature,
  maleTypicalFigure,
} from '../../measurements/male/typical'
import {
  draftEmkoMaleShirt,
  emkoMaleShirt,
  type EmkoMaleShirtMeasurements,
} from './maleShirt'

/** Опорные признаки верхней части тела для базовой фигуры 176-100-88 (мм). */
const UPPER_BASE_176_100_88 = {
  chest1: 975,
  chest2: 1005,
  neck: 400,
  upperArm: 315,
  wrist: 175,
  shoulderSlope: 148,
  neckToRadial: 355,
  neckToWrist: 610,
  armholeArc: 365,
  armholeDepthBack: 218,
  backLength: 462,
  frontLength: 465,
  chestWidth: 374,
  chestPointDistance: 215,
  backWidth: 411,
  armDepth: 124,
} as const

function makeShirtMeasurements(lead: { height: number; chest3: number; waist: number }): EmkoMaleShirtMeasurements {
  const typ = maleTypicalFigure(lead)
  const g = <K extends keyof typeof UPPER_BASE_176_100_88>(key: K) =>
    Math.round(gradeMaleFeature(UPPER_BASE_176_100_88[key], MALE_EMKO_GRADATION[key]!, lead))

  return {
    height: typ.height!,
    chest1: g('chest1'),
    chest2: g('chest2'),
    chest3: typ.chest3!,
    waist: typ.waist!,
    hips: typ.hips!,
    neck: g('neck'),
    waistHeight: typ.waistHeight!,
    glutealFoldHeight: typ.glutealFoldHeight!,
    upperArm: g('upperArm'),
    wrist: g('wrist'),
    shoulderSlope: g('shoulderSlope'),
    neckToRadial: g('neckToRadial'),
    neckToWrist: g('neckToWrist'),
    armholeArc: g('armholeArc'),
    armholeDepthBack: g('armholeDepthBack'),
    backLength: g('backLength'),
    frontLength: g('frontLength'),
    chestWidth: g('chestWidth'),
    chestPointDistance: g('chestPointDistance'),
    backWidth: g('backWidth'),
    armDepth: g('armDepth'),
  }
}

describe('Мужская сорочка ЕМКО СЭВ (§ 6)', () => {
  it('строит 7 деталей (спинка, полочка, рукав, стойка, воротник, планка, манжета) на 176-100-88', () => {
    const m = makeShirtMeasurements({ height: 1760, chest3: 1000, waist: 880 })
    const res = draftEmkoMaleShirt(m, emkoMaleShirt.defaults('semi'))

    expect(res.pieces.map((p) => p.id)).toEqual([
      'emko-male-shirt-back',
      'emko-male-shirt-front',
      'emko-male-shirt-sleeve',
      'emko-male-shirt-collar-stand',
      'emko-male-shirt-collar',
      'emko-male-shirt-placket',
      'emko-male-shirt-cuff',
    ])
    expect(res.warnings).toEqual([])
    expect(res.checks.every((c) => c.ok)).toBe(true)
  })

  it('соблюдает тождество 31–87, нормативные ПП из табл. 11 и контрольные допуски по срезам', () => {
    const m = makeShirtMeasurements({ height: 1760, chest3: 1000, waist: 880 })
    const opts = emkoMaleShirt.defaults('semi')
    const res = draftEmkoMaleShirt(m, opts)
    const step = (id: string) => res.steps.find((s) => s.id === id)?.value ?? 0

    expect(step('31–87')).toBeCloseTo(step('31–33') + step('33–35') + step('35–37'), 6)
    expect(step('ДОР')).toBeCloseTo((1 + opts.capEase) * step('ДП'), 6)
    expect(step('13–93')).toBeCloseTo(m.neckToWrist - m.shoulderSlope + 1.0, 6)
  })

  it('строится на всех 8 базовых мужских фигурах табл. 8 и во всех трёх силуэтах', () => {
    for (const fig of MALE_EMKO_TABLE_8) {
      const m = makeShirtMeasurements({ height: fig.height, chest3: fig.chest3, waist: fig.waist })

      for (const silhouette of ['fitted', 'semi', 'straight'] as const) {
        const res = draftEmkoMaleShirt(m, emkoMaleShirt.defaults(silhouette))
        expect(res.panels).toHaveLength(7)
        expect(res.warnings).toEqual([])
        expect(res.checks.every((c) => c.ok)).toBe(true)
      }
    }
  })
})
