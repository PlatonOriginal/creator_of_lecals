import { describe, expect, it } from 'vitest'
import {
  MALE_EMKO_GRADATION,
  MALE_EMKO_TABLE_8,
  gradeMaleFeature,
  maleTypicalFigure,
} from '../../measurements/male/typical'
import {
  draftMullerMaleTrousers,
  mullerMaleTrousers,
  type MullerMaleTrousersMeasurements,
} from './maleTrousers'

/** Пример из сборника «М. Мюллер и сын» (спецификация § 5.8): От=76, Об=100, Дсб=106, Вс=26,5, Шн=42 см. */
const BOOK_EXAMPLE: MullerMaleTrousersMeasurements = {
  waist: 760,
  hips: 1000,
  waistToFloorSide: 1060,
  waistToSeat: 265,
  instep: 353, // + hemEase 67 = 420 мм (Шн = 42 см)
}

describe('Мужские классические брюки Мюллера (§ 5.8)', () => {
  it('воспроизводит контрольные величины примера сборника: Дш=795, Вк=318, Шн=420 мм', () => {
    const res = draftMullerMaleTrousers(BOOK_EXAMPLE, mullerMaleTrousers.defaults('semi'))
    const step = (id: string) => res.steps.find((s) => s.id === id)?.value

    expect(step('Дш')).toBeCloseTo(795, 1)
    expect(step('3–4')).toBeCloseTo(318, 1)
    expect(step('3–7')).toBeCloseTo(80, 1)
    expect(step('7–8')).toBeCloseTo(240, 1)
    expect(step('8–9')).toBeCloseTo(57.5, 1)
    expect(step('12–15')).toBeCloseTo(95, 1)

    expect(res.panels).toHaveLength(2)
    expect(res.pieces.map((p) => p.id)).toEqual(['muller-male-trousers-back', 'muller-male-trousers-front'])
    expect(res.warnings).toEqual([])
    expect(res.checks.every((c) => c.ok)).toBe(true)
  })

  it('строится на всех 8 базовых мужских фигурах табл. 8 и во всех трёх силуэтах', () => {
    for (const fig of MALE_EMKO_TABLE_8) {
      const lead = { height: fig.height, chest3: fig.chest3, waist: fig.waist }
      const typ = maleTypicalFigure(lead)
      const waistToSeat = Math.round(gradeMaleFeature(265, MALE_EMKO_GRADATION.waistToSeat!, lead))

      const m: MullerMaleTrousersMeasurements = {
        waist: typ.waist!,
        hips: typ.hips!,
        waistToFloorSide: typ.waistToFloorSide!,
        waistToSeat,
        instep: typ.instep!,
      }

      for (const silhouette of ['fitted', 'semi', 'straight'] as const) {
        const res = draftMullerMaleTrousers(m, mullerMaleTrousers.defaults(silhouette))
        expect(res.panels).toHaveLength(2)
        expect(res.warnings).toEqual([])
        expect(res.checks.every((c) => c.ok)).toBe(true)
      }
    }
  })
})
