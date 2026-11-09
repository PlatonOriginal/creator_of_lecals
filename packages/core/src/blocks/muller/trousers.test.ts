import { describe, expect, it } from 'vitest'
import { draftMullerTrousers, mullerTrousers } from './trousers'
import { GOST_FIGURES, SAMPLE_MEASUREMENTS, typicalFigure } from '../../measurements'

const step = (r: ReturnType<typeof draftMullerTrousers>, id: string) => {
  const s = r.steps.find((x) => x.id === id)
  if (!s) throw new Error(`no step ${id}`)
  return s.value
}

/** The book's example, p. 6: size 40, От 76, Об 100, Дсб 106, Вс 26,5, Шн 42. */
const BOOK = { waist: 760, hips: 1000, waistToFloor: 1060, crotchDepth: 265, instep: 320 }

describe('Брюки Мюллера: пример книги, размер 40', () => {
  const r = draftMullerTrousers(BOOK, { ...mullerTrousers.defaults('fitted'), hipEase: 0 })
  const p = r.points

  it('расчёт как в таблице книги', () => {
    const table: Record<string, number> = {
      'Дш': 795, '3–4': 318, '3–7': 80, '7–8': 240, 'Шзп': 260, 'Шн': 420, '12–15': 95,
    }
    for (const [id, value] of Object.entries(table)) expect(step(r, id), id).toBeCloseTo(value, 6)
    // 8–9 = 1/10·½Об + 0,5…1 = 5,5…6; the book prints 6.
    expect(step(r, '8–9')).toBeCloseTo(57.5, 6)
  })

  it('чертёж построен по этим размерам (рис. 2, 5)', () => {
    expect(p.P7!.y).toBeCloseTo(265 - 80, 6)
    expect(p.P13!.y).toBeCloseTo(265 + 318, 6)
    expect(p.P11!.x).toBeCloseTo((240 + 57.5) / 2, 6)
    expect(p.P26!.x - p.P25!.x).toBeCloseTo(65, 6)
    // 28–29 = Шзп, 29 on the hip line; 25–30 = 25–29.
    expect(Math.hypot(p.P29!.x - p.P28!.x, p.P29!.y - p.P28!.y)).toBeCloseTo(260, 6)
    expect(p.P29!.y).toBeCloseTo(p.P7!.y, 6)
    expect(p.P30!.x - p.P25!.x).toBeCloseTo(Math.hypot(p.P25!.x - p.P29!.x, p.P25!.y - p.P29!.y), 6)
    // The back hem and knee are 2 cm wider than the front each side.
    expect(p.P34!.x - p.P33!.x - (p.P16!.x - p.P15!.x)).toBeCloseTo(40, 6)
  })

  it('сшиваемые срезы сходятся, предупреждений нет', () => {
    for (const ch of r.checks) expect(ch.ok, `${ch.title}: ${ch.a} / ${ch.b}`).toBe(true)
    expect(r.warnings).toEqual([])
    expect(r.pieces.map((x) => x.id)).toEqual(['muller-trousers-back', 'muller-trousers-front'])
  })
})

describe('Брюки Мюллера: другие фигуры', () => {
  it('работает на типовой фигуре из мерок приложения', () => {
    const r = mullerTrousers.draft(SAMPLE_MEASUREMENTS, mullerTrousers.defaults('semi'))
    for (const ch of r.checks) expect(ch.ok, `${ch.title}: ${ch.a} / ${ch.b}`).toBe(true)
  })

  it('строится на всех типовых фигурах ГОСТ 31396 без ошибок проверки', () => {
    for (const f of GOST_FIGURES) {
      for (const s of ['fitted', 'semi', 'straight'] as const) {
        const r = mullerTrousers.draft(typicalFigure(f), mullerTrousers.defaults(s))
        for (const ch of r.checks) expect(ch.ok, `${f.label} ${s}: ${ch.title} ${ch.a.toFixed(1)} / ${ch.b.toFixed(1)}`).toBe(true)
        expect(r.warnings, f.label).toEqual([])
      }
    }
  })
})
