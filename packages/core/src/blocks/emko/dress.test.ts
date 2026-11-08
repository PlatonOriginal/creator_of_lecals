import { describe, expect, it } from 'vitest'
import { draftEmkoDress, emkoDress } from './dress'
import { dist } from '../../draft/geom'
import { GOST_FIGURES, SAMPLE_MEASUREMENTS, typicalFigure } from '../../measurements'

/**
 * The book's own example: ЕМКО СЭВ vol. 2, table 6, semi-fitted dress, size
 * 164-96-104. Measurements of table 11 (cm): Т13 37,0, Т14 91,8, Т15 100,8,
 * Т16 96, Т18 76, Т19 104, Т29 16,5, Т32 45,3, Т33 68,9, Т35 − Т34 10,3,
 * Т36 − Т35 17,4, Т38 31,6, Т39 17,9, Т40 40,3, Т44 87,3, Т45 34,6, Т46 20,4,
 * Т47 36,6, Т57 11,0, Т7 103,2, Т12 73,6, Т25 106,1, Т26 104,2.
 * Т32 and Т33 are split into shoulder 13 + arm to the elbow 32,3 / wrist 55,9.
 */
const BOOK = {
  bust: 960, bustUpper: 918, bustFull: 1008, waist: 760, hips: 1040, neck: 370,
  backLength: 403, armholeDepth: 179, backWidth: 366, chestWidth: 346, bustSpan: 204, bustHeight: 260, frontLength: 434,
  armholeArc: 316, torsoArc: 873, armDepth: 110,
  waistToFloorBack: 1032, glutealFoldHeight: 736, waistToFloor: 1061, waistToFloorFront: 1042, skirtLength: 580,
  shoulderLength: 130, armLength: 559, elbowLength: 323, wrist: 165,
}
const SEMI = emkoDress.defaults('semi')

const r = draftEmkoDress(BOOK, SEMI)
const step = (id: string) => {
  const s = r.steps.find((x) => x.id === id)
  if (!s) throw new Error(`no step ${id}`)
  return s.value
}

describe('Платье ЕМКО СЭВ: пример учебника, размер 164-96-104', () => {
  it('формулы дают значения столбца «величина отрезка в чертеже» (±1 мм)', () => {
    // Book column, cm → mm.
    const table: Record<string, number> = {
      '11–21': 131.5, '11–31': 190, '11–41': 416, '41–51': 194.5,
      '31–33': 196.5, '33–35': 139, '35–37': 220.5, '31–37': 556, '37–47': 226,
      '33–13': 164, '35–15': 145, '33–331': 35, '331–341': 91, '351–341′': 48,
      '11–12': 68.5, '12–121': 22.5, '13–14': 5.5, '31–32': 69,
      '47–46': 106, '46–36': 175.5, '372–372′': 39, '371′–361': 69.5, '36–16': 279.5, '16–161': 80,
      '411–470': 450, '511–570': 575,
      ДП: 461, ПОР: 37, ДОР: 498, '351–333': 184.5, '333–13': 148, '13–131': 44.5, '95–931': 130.5,
    }
    for (const [id, value] of Object.entries(table)) expect(Math.abs(step(id) - value), id).toBeLessThanOrEqual(1)
  })

  it('там, где не хватает мерки или книга расходится сама с собой, — в пределах нескольких мм', () => {
    // Т35 − Т34 is estimated (0,1·Т16 + 0,5 = 10,1 instead of 10,3).
    expect(Math.abs(step('36–372') - 107)).toBeLessThanOrEqual(3)
    // Sleeve lengths subtract the drafted shoulder |121–14| (14,2 here, 14,0 in the book).
    expect(Math.abs(step('13–93') - 586)).toBeLessThanOrEqual(3)
    expect(Math.abs(step('13–43') - 333.5)).toBeLessThanOrEqual(3)
    // The book prints dт 10,20 and dб 2,30; its formulas give 55,60 − 45,75 and 58,25 − 55,60.
    expect(step('dт')).toBeCloseTo(98.5, 6)
    expect(step('dб')).toBeCloseTo(26.5, 6)
    // Shoulder dart: the book has 11,3°; table 12 gives β34 = 13° for this size.
    expect(Math.abs(step('122–22–122′') - 11.3)).toBeLessThan(0.6)
  })

  it('нагрудная вытачка перенесена в плечо, середина переда прямая', () => {
    const p = r.points
    // Rotated back by the dart angle, the centre-front neck point lands on the centre front.
    expect(p.Q17!.x).toBeCloseTo(p.P47!.x, 6)
    expect(dist(p.P36!, p.Q162!)).toBeCloseTo(dist(p.P36!, p.P162!), 6)
    expect(step('γ')).toBeGreaterThan(15)
    expect(step('γ')).toBeLessThan(25)
  })

  it('сшиваемые срезы совпадают, окат с посадкой, предупреждений нет', () => {
    for (const ch of r.checks) expect(ch.ok, `${ch.title}: ${ch.a} / ${ch.b}`).toBe(true)
    expect(r.warnings).toEqual([])
  })

  it('даёт три детали: спинку, полочку со сгибом и рукав', () => {
    expect(r.pieces.map((x) => x.id)).toEqual(['emko-dress-back', 'emko-dress-front', 'emko-dress-sleeve'])
    expect(r.pieces[1]!.paths.some((x) => x.role === 'fold')).toBe(true)
    for (const piece of r.pieces) expect(piece.paths[0]!.d).toMatch(/^M [-\d.,]+ .* Z$/)
  })
})

describe('Платье ЕМКО СЭВ: другие фигуры', () => {
  it('работает на типовой фигуре из мерок приложения', () => {
    const t = emkoDress.draft(SAMPLE_MEASUREMENTS, SEMI)
    for (const ch of t.checks) expect(ch.ok, `${ch.title}: ${ch.a} / ${ch.b}`).toBe(true)
  })

  it('строится на всех типовых фигурах ГОСТ 31396 в трёх силуэтах', () => {
    const failed: string[] = []
    for (const f of GOST_FIGURES) {
      for (const s of ['fitted', 'semi', 'straight'] as const) {
        const t = emkoDress.draft(typicalFigure(f), emkoDress.defaults(s))
        for (const ch of t.checks) if (!ch.ok) failed.push(`${f.label} ${s}: ${ch.title} ${Math.round(ch.a)} / ${Math.round(ch.b)}`)
      }
    }
    expect(failed).toEqual([])
  })
})
