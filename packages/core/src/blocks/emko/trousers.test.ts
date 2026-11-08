import { describe, expect, it } from 'vitest'
import { draftEmkoTrousers, emkoTrousers } from './trousers'
import { dist } from '../../draft/geom'
import { GOST_FIGURES, SAMPLE_MEASUREMENTS, typicalFigure } from '../../measurements'

/**
 * The book's own example: ЕМКО СЭВ vol. 2, table 9, semi-fitted trousers,
 * size 164-96-104. Measurements of table 11 (cm): Т1 164, Т7 103,2, Т9 45,4
 * (Дтк = Т7 − Т9 = 57,8), Т12 73,6, Т18 76, Т19 104, Т22 37,1, Т25 106,1,
 * Т26 104,2, Т27 76,5, Т51 32,0.
 */
const BOOK = {
  height: 1640, waist: 760, hips: 1040, waistToFloorBack: 1032, glutealFoldHeight: 736, waistToFloor: 1061,
  waistToFloorFront: 1042, inseam: 765, waistToKnee: 578, knee: 371, instep: 320,
}
const r = draftEmkoTrousers(BOOK, emkoTrousers.defaults('semi'))
const step = (id: string) => {
  const s = r.steps.find((x) => x.id === id)
  if (!s) throw new Error(`no step ${id}`)
  return s.value
}

describe('Брюки ЕМКО СЭВ: пример учебника, размер 164-96-104', () => {
  it('формулы дают значения столбца «величина отрезка в чертеже» (±1,5 мм)', () => {
    const table: Record<string, number> = {
      '41–51': 174, '51–57': 540, '51–54': 286, '54′–57': 254, '51–58': 129,
      '44′–940': 1042, '940–441′': 1062, '940–64': 795, '940–74': 463, '940–94': 15.5,
      '58–52': 207.5, '72–78': 141.5, '76–741′': 117.5, '92–98': 124, '96–941′': 101,
      '41–470': 401.5, dт: 138.5, '441–442': 27.5, '421–422': 14, '46–461': 9, '47–471': 9.5,
      '411–421': 86, '411–43': 172, '421–521': 113, '43–531': 87, '46–561': 78,
    }
    for (const [id, value] of Object.entries(table)) expect(Math.abs(step(id) - value), id).toBeLessThanOrEqual(1.5)
  })

  it('передний шаговый выступ — по формуле (книга печатает 6,10 вместо 6,30)', () => {
    expect(step('57–58′')).toBeCloseTo(0.335 * (208 - 20) + 3.9, 6)
    // The front crease follows from it: 0,5·(25,40 + 6,69) instead of the book's 15,95.
    expect(Math.abs(step('54′–56') - 159.5)).toBeLessThanOrEqual(2)
  })

  it('задняя половина повёрнута: линия бёдер перпендикулярна боку 742–54', () => {
    const p = r.points
    const side = { x: p.P54!.x - p.P742!.x, y: p.P54!.y - p.P742!.y }
    const hip = { x: p.P511!.x - p.P54!.x, y: p.P511!.y - p.P54!.y }
    expect(side.x * hip.x + side.y * hip.y).toBeCloseTo(0, 6)
    expect(dist(p.P54!, p.P511!)).toBeCloseTo(step('51–54'), 6)
    // The back side top equals the front side from 54′ to 441′.
    expect(dist(p.P54!, p.P441!)).toBeCloseTo(p.P54!.y - p.P441f!.y, 6)
  })

  it('сшиваемые срезы совпадают, предупреждений нет', () => {
    for (const ch of r.checks) expect(ch.ok, `${ch.title}: ${ch.a} / ${ch.b}`).toBe(true)
    expect(r.warnings).toEqual([])
  })

  it('даёт две детали', () => {
    expect(r.pieces.map((x) => x.id)).toEqual(['emko-trousers-back', 'emko-trousers-front'])
    for (const piece of r.pieces) expect(piece.paths[0]!.d).toMatch(/^M [-\d.,]+ .* Z$/)
  })
})

describe('Брюки ЕМКО СЭВ: другие фигуры', () => {
  it('работает на типовой фигуре из мерок приложения', () => {
    const t = emkoTrousers.draft(SAMPLE_MEASUREMENTS, emkoTrousers.defaults('semi'))
    for (const ch of t.checks) expect(ch.ok, `${ch.title}: ${ch.a} / ${ch.b}`).toBe(true)
  })

  it('строится на всех типовых фигурах ГОСТ 31396 в трёх силуэтах', () => {
    const failed: string[] = []
    for (const f of GOST_FIGURES) {
      for (const s of ['fitted', 'semi', 'straight'] as const) {
        const t = emkoTrousers.draft(typicalFigure(f), emkoTrousers.defaults(s))
        for (const ch of t.checks) if (!ch.ok) failed.push(`${f.label} ${s}: ${ch.title} ${Math.round(ch.a)} / ${Math.round(ch.b)}`)
        for (const w of t.warnings) failed.push(`${f.label} ${s}: ${w}`)
      }
    }
    expect(failed).toEqual([])
  })
})
