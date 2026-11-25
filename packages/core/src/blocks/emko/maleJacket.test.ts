import { describe, expect, it } from 'vitest'
import {
  MALE_EMKO_GRADATION,
  MALE_EMKO_TABLE_8,
  gradeMaleFeature,
  maleTypicalFigure,
} from '../../measurements/male/typical'
import {
  draftEmkoMaleJacket,
  emkoMaleJacket,
  emkoMaleJacketGrid,
  emkoMaleSummerJacket,
  type EmkoMaleJacketMeasurements,
} from './maleJacket'

/** Опорные признаки верхней части тела для базовой фигуры 176-100-88 из табл. 1.2 / 1.4 ЕМКО СЭВ т. 3 (мм). */
const JACKET_UPPER_BASE_176_100_88 = {
  chest1: 975,
  chest2: 1005,
  neck: 400,
  upperArm: 315,
  wrist: 175,
  shoulderSlope: 148,
  neckToRadial: 355,
  neckToWrist: 610,
  napeToChest1Front: 210,
  bustHeight: 272,
  frontLength: 464,
  armholeArc: 365,
  armholeDepthBack: 216,
  backLength: 460,
  upperTorsoArc: 935,
  chestWidth: 374,
  chestPointDistance: 215,
  backWidth: 408,
  armDepth: 124,
} as const

function makeJacketMeasurements(lead: { height: number; chest3: number; waist: number }): EmkoMaleJacketMeasurements {
  const typ = maleTypicalFigure(lead)
  const g = <K extends keyof typeof JACKET_UPPER_BASE_176_100_88>(key: K) =>
    Math.round(gradeMaleFeature(JACKET_UPPER_BASE_176_100_88[key], MALE_EMKO_GRADATION[key]!, lead))

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
    napeToChest1Front: g('napeToChest1Front'),
    bustHeight: g('bustHeight'),
    frontLength: g('frontLength'),
    armholeArc: g('armholeArc'),
    armholeDepthBack: g('armholeDepthBack'),
    backLength: g('backLength'),
    upperTorsoArc: g('upperTorsoArc'),
    chestWidth: g('chestWidth'),
    chestPointDistance: g('chestPointDistance'),
    backWidth: g('backWidth'),
    armDepth: g('armDepth'),
  }
}

describe('Мужской пиджак и летняя куртка ЕМКО СЭВ (§ 7)', () => {
  it('воспроизводит все контрольные отрезки пиджака из табл. 1.2 (§ 7.9) для 176-100-88 в пределах 0,5 мм', () => {
    const m = makeJacketMeasurements({ height: 1760, chest3: 1000, waist: 880 })
    const opts = emkoMaleJacket.defaults('semi')
    const g = emkoMaleJacketGrid(m, opts)

    expect(g.s11_91).toBeCloseTo(773.5, 0) // 773.4 vs 773.5
    expect(g.s11_21).toBeCloseTo(155.0, 0) // 154.8 vs 155.0
    expect(g.s11_31).toBeCloseTo(233.5, 1) // 233.5 vs 233.5
    expect(g.s11_41).toBeCloseTo(478.0, 0) // 478.1 vs 478.0
    expect(g.s31_33).toBeCloseTo(224.5, 1) // 224.5 vs 224.5
    expect(g.s33_35).toBeCloseTo(160.0, 1) // 160.0 vs 160.0
    expect(g.s35_37).toBeCloseTo(217.0, 1) // 217.0 vs 217.0
    expect(g.s31_87).toBeCloseTo(601.5, 1) // 601.5 vs 601.5
    expect(g.s33_13).toBeCloseTo(198.0, 1) // 198.0 vs 198.0
    expect(g.s35_15).toBeCloseTo(180.5, 0) // 180.6 vs 180.5
    expect(g.shor).toBeCloseTo(211.0, 1)   // ШОР = 124 + 40 + 47 = 211.0 мм (§ 7.7)
  })

  it('строит 4 детали пиджака (спинка, полочка, верхняя и нижняя половинки рукава) на 176-100-88', () => {
    const m = makeJacketMeasurements({ height: 1760, chest3: 1000, waist: 880 })
    const res = draftEmkoMaleJacket(m, emkoMaleJacket.defaults('semi'), 'jacket')

    expect(res.pieces.map((p) => p.id)).toEqual([
      'emko-male-jacket-back',
      'emko-male-jacket-front',
      'emko-male-jacket-sleeve-top',
      'emko-male-jacket-sleeve-under',
    ])
    expect(res.warnings).toEqual([])
    expect(res.checks.every((c) => c.ok)).toBe(true)
  })

  it('строится на всех 8 базовых мужских фигурах табл. 8 во всех трёх силуэтах для пиджака и летней куртки', () => {
    for (const fig of MALE_EMKO_TABLE_8) {
      const m = makeJacketMeasurements({ height: fig.height, chest3: fig.chest3, waist: fig.waist })

      for (const silhouette of ['fitted', 'semi', 'straight'] as const) {
        const jacketRes = emkoMaleJacket.draft(m, emkoMaleJacket.defaults(silhouette))
        expect(jacketRes.panels).toHaveLength(4)
        expect(jacketRes.warnings).toEqual([])
        expect(jacketRes.checks.every((c) => c.ok)).toBe(true)

        const summerRes = emkoMaleSummerJacket.draft(m, emkoMaleSummerJacket.defaults(silhouette))
        expect(summerRes.panels).toHaveLength(4)
        expect(summerRes.warnings).toEqual([])
        expect(summerRes.checks.every((c) => c.ok)).toBe(true)
      }
    }
  })
})
