import { describe, expect, it } from 'vitest'
import { draftEmkoSkirt, emkoSkirt } from './skirt'
import { dist } from '../../draft/geom'
import { GOST_FIGURES, SAMPLE_MEASUREMENTS, typicalFigure, validateMeasurements } from '../../measurements'

const step = (r: ReturnType<typeof draftEmkoSkirt>, id: string) => {
  const s = r.steps.find((x) => x.id === id)
  if (!s) throw new Error(`no step ${id}`)
  return s.value
}

/**
 * The book's own example: ЕМКО СЭВ vol. 2, p. 107, size 164-96-104.
 * Measurements from table 11 (ОСТ 17-326-81), cm: Т7 103,2, Т12 73,6, Т18 76,0,
 * Т19 104,0, Т25 106,1, Т26 104,2, Т46 20,4. Ease Пб 2,15, Пт 1,34.
 * The book's length is Т7 − Т9 + 0,75 + 0,6 = 59,15 at the back, so Ди at the
 * side is 59,15 + 1,85 = 61,00.
 */
const book = {
  m: {
    waist: 760, hips: 1040, bustSpan: 204, skirtLength: 610,
    waistToFloorBack: 1032, glutealFoldHeight: 736, waistToFloor: 1061, waistToFloorFront: 1042,
  },
  o: { waistEase: 13.4, hipEase: 21.5, backCentreDrop: 0 },
}

describe('Прямая юбка ЕМКО СЭВ: пример учебника, размер 164-96-104', () => {
  const r = draftEmkoSkirt(book.m, book.o)
  const p = r.points

  it('формулы дают значения столбца «величина отрезка в чертеже» (±1 мм)', () => {
    // Book column, cm → mm.
    const table: Record<string, number> = {
      '41–51': 202, '51–57': 542, '51–54': 271, '41–470': 393.5,
      '41–42': 108.5, '42–521': 161.5, '47–46': 103, '46–561': 101, '41–91': 591.5,
    }
    for (const [id, value] of Object.entries(table)) expect(Math.abs(step(r, id) - value), id).toBeLessThanOrEqual(1)
    // Raises: 94–441 − 41–91 = 61,00 − 59,15; 97–47 − 41–91 = 59,40 − 59,15.
    expect(step(r, '94–441')).toBeCloseTo(18.5, 6)
    expect(step(r, '97–47')).toBeCloseTo(2.5, 6)
  })

  it('суммы вытачек считаются по формуле dт = |51–57| − |41–470|', () => {
    // 541,5 − 393,4 = 148,1 мм. The book prints 14,40 cm here (its darts
    // 3,75 / 2,45 / 1,00 are 0,26 / 0,17 / 0,07 of 14,40), which does not
    // follow from its own 54,20 − 39,35; we keep the formula.
    expect(step(r, 'dт')).toBeCloseTo(148.1, 6)
    expect(step(r, '441–442')).toBeCloseTo(0.26 * 148.1, 6)
    expect(step(r, '42–421')).toBeCloseTo(0.17 * 148.1, 6)
    expect(step(r, '46–461')).toBeCloseTo(0.07 * 148.1, 6)
    // The halves add up to the whole suppression: 2·(0,26 + 0,17 + 0,07) = 1.
    expect(2 * (step(r, '441–442') + step(r, '42–421') + step(r, '46–461'))).toBeCloseTo(148.1, 6)
  })

  it('чертёж построен по этим размерам (рис. 46)', () => {
    expect(p.hipCB!.y).toBeCloseTo(step(r, '41–51'), 6)
    expect(p.hipCF!.x).toBeCloseTo(541.5, 6)
    expect(p.hipSide!.x).toBeCloseTo(270.75, 6)
    expect(p.hemCB!.y).toBeCloseTo(591.5, 6)
    expect(p.waistCB!.y).toBeCloseTo(0, 6)
    expect(-p.waistSideTop!.y).toBeCloseTo(18.5, 6)
    expect(-p.waistCF!.y).toBeCloseTo(2.5, 6)
    // The waist stays level at the centres for a tenth of the waist.
    expect(p.waistBackLead!).toMatchObject({ x: expect.closeTo(39.34, 6), y: expect.closeTo(0, 6) })
    expect(p.waistCF!.x - p.waistFrontLead!.x).toBeCloseTo(39.34, 6)
    expect(p.waistFrontLead!.y).toBeCloseTo(-2.5, 6)
    // Side seam ends at 442 and 442', equally either side of 441.
    expect(p.waistSideTop!.x - p.waistSideBack!.x).toBeCloseTo(0.26 * 148.1, 6)
    expect(p.waistSideFront!.x - p.waistSideTop!.x).toBeCloseTo(0.26 * 148.1, 6)
    // Dart tips on the dart axes at the given lengths.
    expect(p.dartBackTip!.x).toBeCloseTo(108.3, 6)
    expect(p.hipCF!.x - p.dartFrontTip!.x).toBeCloseTo(103, 6)
  })

  it('стороны вытачек уравнены, раствор как в таблице', () => {
    expect(dist(p.dartBackTip!, p.dartBackLeft!)).toBeCloseTo(dist(p.dartBackTip!, p.dartBackRight!), 6)
    expect(dist(p.dartFrontTip!, p.dartFrontLeft!)).toBeCloseTo(dist(p.dartFrontTip!, p.dartFrontRight!), 6)
    expect(Math.abs(p.dartBackRight!.x - p.dartBackLeft!.x - 2 * 0.17 * 148.1)).toBeLessThan(1)
    expect(Math.abs(p.dartFrontRight!.x - p.dartFrontLeft!.x - 2 * 0.07 * 148.1)).toBeLessThan(1)
    expect(dist(p.dartBackTip!, p.dartBackLeft!)).toBeGreaterThan(161)
  })

  it('сшиваемые срезы совпадают, предупреждений нет', () => {
    for (const ch of r.checks) expect(ch.ok, `${ch.title}: ${ch.a} / ${ch.b}`).toBe(true)
    expect(r.warnings).toEqual([])
  })

  it('даёт две детали: заднюю (крой 2) и переднюю со сгибом', () => {
    expect(r.pieces.map((x) => x.id)).toEqual(['emko-skirt-back', 'emko-skirt-front'])
    expect(r.pieces[1]!.paths.some((x) => x.role === 'fold')).toBe(true)
    for (const piece of r.pieces) expect(piece.paths[0]!.d).toMatch(/^M [-\d.,]+ .* Z$/)
  })
})

describe('Прямая юбка ЕМКО СЭВ: другие фигуры', () => {
  it('понижает талию посередине сзади, не трогая остальное', () => {
    const r = draftEmkoSkirt(book.m, { ...book.o, backCentreDrop: 10 })
    expect(r.points.waistCB!.y).toBeCloseTo(10, 6)
    expect(r.points.waistBackLead!.y).toBeCloseTo(0, 6)
    expect(r.checks.every((c) => c.ok)).toBe(true)
  })

  it('предупреждает о слишком широкой вытачке', () => {
    const r = draftEmkoSkirt({ ...book.m, waist: 600, hips: 1200 }, book.o)
    expect(r.warnings.join(' ')).toMatch(/Задняя вытачка/)
  })

  it('работает на типовой фигуре из мерок приложения', () => {
    expect(validateMeasurements(SAMPLE_MEASUREMENTS, { required: emkoSkirt.required, plausibility: false }).filter((i) => i.level === 'error')).toEqual([])
    const r = emkoSkirt.draft(SAMPLE_MEASUREMENTS, emkoSkirt.defaults('straight'))
    expect(r.checks.every((c) => c.ok)).toBe(true)
  })

  it('строится на всех типовых фигурах ГОСТ 31396 без ошибок проверки', () => {
    for (const f of GOST_FIGURES) {
      for (const s of ['fitted', 'semi', 'straight'] as const) {
        const r = emkoSkirt.draft(typicalFigure(f), emkoSkirt.defaults(s))
        for (const ch of r.checks) expect(ch.ok, `${f.label} ${s}: ${ch.title} ${ch.a} / ${ch.b}`).toBe(true)
      }
    }
  })
})
