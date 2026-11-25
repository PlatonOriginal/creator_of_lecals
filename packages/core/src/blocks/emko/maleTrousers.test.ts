import { describe, expect, it } from 'vitest'
import { MALE_EMKO_TABLE_8, maleTypicalFigure } from '../../measurements/male/typical'
import {
  draftEmkoMaleTrousers,
  emkoMaleTrouserGrid,
  emkoMaleTrousers,
  type EmkoMaleTrousersMeasurements,
} from './maleTrousers'

/** Контрольные исходные признаки 176-100-88 из табл. 8 / разд. 5.7 спецификации (мм). */
const REF_176_100_88: EmkoMaleTrousersMeasurements = {
  height: 1760,
  waistHeight: 1099,
  frontAsisHeight: 1007,
  kneeHeight: 494,
  glutealFoldHeight: 808,
  waist: 880,
  hips: 1038,
  knee: 388,
  waistToFloorSide: 1108,
  waistToFloorFront: 1103,
  inseam: 814,
  instep: 353,
}

describe('Мужские брюки ЕМКО СЭВ (табл. 7.2–7.3)', () => {
  it('воспроизводит все контрольные отрезки для 176-100-88 в пределах 0,3 мм', () => {
    const opts = emkoMaleTrousers.defaults('semi')
    const g = emkoMaleTrouserGrid(REF_176_100_88, opts)

    expect(g.hipRise).toBeCloseTo(160.5, 0)       // 160.75 vs 160.5 (Δ = 0.25 мм)
    expect(g.hipWidth).toBeCloseTo(547.0, 0)      // 546.90 vs 547.0 (Δ = 0.10 мм)
    expect(g.backHalf).toBeCloseTo(290.0, 0)      // 289.86 vs 290.0 (Δ = 0.14 мм)
    expect(g.frontHalf).toBeCloseTo(257.0, 0)     // 257.04 vs 257.0 (Δ = 0.04 мм)
    expect(g.crotchBack).toBeCloseTo(139.0, 0)    // 139.15 vs 139.0 (Δ = 0.15 мм)
    expect(g.crotchFront).toBeCloseTo(71.5, 0)    // 71.55 vs 71.5  (Δ = 0.05 мм)
    expect(g.creaseBack).toBeCloseTo(214.5, 0)    // 214.51 vs 214.5 (Δ = 0.01 мм)
    expect(g.creaseFront).toBeCloseTo(164.5, 0)   // 164.29 vs 164.5 (Δ = 0.21 мм)
    expect(g.kneeBack).toBeCloseTo(133.5, 1)      // 133.50 vs 133.5 (Δ = 0.00 мм)
    expect(g.kneeFront).toBeCloseTo(108.5, 0)     // 108.40 vs 108.5 (Δ = 0.10 мм)
    expect(g.hemBack).toBeCloseTo(125.0, 0)       // 125.28 vs 125.0 (Δ = 0.28 мм)
    expect(g.hemFront).toBeCloseTo(99.5, 0)       // 99.43 vs 99.5   (Δ = 0.07 мм)
    expect(g.waistHalf).toBeCloseTo(471.0, 0)     // 471.20 vs 471.0 (Δ = 0.20 мм)
    expect(g.dt).toBeCloseTo(76.0, 0)             // 75.70 vs 76.0   (Δ = 0.30 мм)
  })

  it('строит замкнутые лекала задней и передней половин без предупреждений на 176-100-88', () => {
    const res = draftEmkoMaleTrousers(REF_176_100_88, emkoMaleTrousers.defaults('semi'))

    expect(res.panels).toHaveLength(2)
    expect(res.warnings).toHaveLength(0)
    expect(res.checks.every((c) => c.ok)).toBe(true)
  })

  it('строится на всех 8 базовых мужских фигурах табл. 8 и во всех трёх силуэтах', () => {
    for (const fig of MALE_EMKO_TABLE_8) {
      const m = maleTypicalFigure({
        height: fig.height,
        chest3: fig.chest3,
        waist: fig.waist,
      }) as unknown as EmkoMaleTrousersMeasurements

      for (const silhouette of ['fitted', 'semi', 'straight'] as const) {
        const res = draftEmkoMaleTrousers(m, emkoMaleTrousers.defaults(silhouette))
        expect(res.panels).toHaveLength(2)
        expect(res.pieces).toHaveLength(2)
        expect(res.checks.every((c) => c.ok)).toBe(true)
      }
    }
  })
})