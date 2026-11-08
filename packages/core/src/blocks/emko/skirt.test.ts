import { describe, expect, it } from 'vitest'
import { draftEmkoSkirt, emkoSkirt, type EmkoSkirtOptions } from './skirt'
import { dist } from '../../draft/geom'
import { SAMPLE_MEASUREMENTS, validateMeasurements } from '../../measurements'

/**
 * Reference cases: the key segments of the drawing are compared with a hand
 * calculation by the textbook formulas (written out in the comments, cm).
 */
const step = (r: ReturnType<typeof draftEmkoSkirt>, id: string) => {
  const s = r.steps.find((x) => x.id === id)
  if (!s) throw new Error(`no step ${id}`)
  return s.value
}

const cases: {
  name: string
  m: Parameters<typeof draftEmkoSkirt>[0]
  o: EmkoSkirtOptions
  hand: Record<string, number>
}[] = [
  {
    // vflint.ru/node/68 worked example: Ст 37, Сб 50, Дтс 40,4 (ТБ = 0,5·Дтс = 20,2),
    // Влт 103, Дсб 105,8, Дсп 103,9, Ди = Дтк = 57,6; Пт 1, Пб 2.
    name: 'пример из учебного пособия 164-96-100',
    m: { waist: 740, hips: 1000, waistToHips: 202, skirtLength: 576, waistToFloor: 1058, waistToFloorBack: 1030, waistToFloorFront: 1039 },
    o: { waistEase: 10, hipEase: 20, backDartLength: 160, frontDartLength: 110, backCentreDrop: 0 },
    hand: {
      // ББ1 = 50 + 2 = 52; ББ2 = 26 − 1 = 25; ББ3 = 0,4·25 = 10; Б1Б4 = 0,4·27 = 10,8
      ББ1: 520, ББ2: 250, ББ3: 100, Б1Б4: 108,
      // ΣВ = 52 − (37 + 1) = 14; 0,35·14 = 4,9; 0,5·14 = 7; 0,15·14 = 2,1
      ΣВ: 140, Вз: 49, Вб: 70, Вп: 21,
      // Т2Т20 = 105,8 − 103 = 2,8; Т1Т10 = 103,9 − 103 = 0,9
      Т2Т20: 28, Т1Т10: 9,
    },
  },
  {
    // Типовая фигура около 164-88-96, прилегающий силуэт: Пт 0,5, Пб 1.
    name: 'прилегающая, 164-88-94',
    m: { waist: 680, hips: 940, waistToHips: 190, skirtLength: 600, waistToFloor: 1060, waistToFloorBack: 1045, waistToFloorFront: 1050 },
    o: { waistEase: 5, hipEase: 10, backDartLength: 160, frontDartLength: 110, backCentreDrop: 0 },
    hand: {
      // ББ1 = 47 + 1 = 48; ББ2 = 24 − 1 = 23; ББ3 = 9,2; Б1Б4 = 0,4·25 = 10
      ББ1: 480, ББ2: 230, ББ3: 92, Б1Б4: 100,
      // ΣВ = 48 − (34 + 0,5) = 13,5; 4,725; 6,75; 2,025
      ΣВ: 135, Вз: 47.25, Вб: 67.5, Вп: 20.25,
      Т2Т20: 15, Т1Т10: 5,
    },
  },
  {
    // Полная фигура с выступающим животом, прямой силуэт: Пт 1,5, Пб 3.
    name: 'полная, 170-108-116, выступающий живот',
    m: { waist: 940, hips: 1160, waistToHips: 210, skirtLength: 700, waistToFloor: 1080, waistToFloorBack: 1060, waistToFloorFront: 1085 },
    o: { waistEase: 15, hipEase: 30, backDartLength: 160, frontDartLength: 110, backCentreDrop: 10 },
    hand: {
      // ББ1 = 58 + 3 = 61; ББ2 = 30,5 − 1 = 29,5; ББ3 = 11,8; Б1Б4 = 0,4·31,5 = 12,6
      ББ1: 610, ББ2: 295, ББ3: 118, Б1Б4: 126,
      // ΣВ = 61 − (47 + 1,5) = 12,5; 4,375; 6,25; 1,875
      ΣВ: 125, Вз: 43.75, Вб: 62.5, Вп: 18.75,
      // Т2Т20 = 108 − 106 = 2; Т1Т10 = 108,5 − 106 = 2,5
      Т2Т20: 20, Т1Т10: 25,
    },
  },
]

describe('Прямая юбка ЕМКО СЭВ: сверка с ручным расчётом', () => {
  for (const tc of cases) {
    describe(tc.name, () => {
      const r = draftEmkoSkirt(tc.m, tc.o)

      it('совпадает с расчётом по формулам', () => {
        for (const [id, value] of Object.entries(tc.hand)) expect(step(r, id), id).toBeCloseTo(value, 6)
      })

      it('чертёж построен по этим размерам', () => {
        const p = r.points
        const h = tc.hand
        expect(p.hipCF!.x - p.hipCB!.x).toBeCloseTo(h.ББ1!, 6)
        expect(p.hipSide!.x).toBeCloseTo(h.ББ2!, 6)
        expect(p.hemCB!.y).toBeCloseTo(tc.m.skirtLength, 6)
        expect(p.hipCB!.y).toBeCloseTo(tc.m.waistToHips, 6)
        expect(p.dartBackCentre!.x).toBeCloseTo(h.ББ3!, 6)
        expect(p.hipCF!.x - p.dartFrontCentre!.x).toBeCloseTo(h.Б1Б4!, 6)
        expect(p.waistSideFront!.x - p.waistSideBack!.x).toBeCloseTo(h.Вб!, 6)
        expect(p.dartBackRight!.x - p.dartBackLeft!.x).toBeGreaterThan(h.Вз! - 1)
        expect(p.dartBackRight!.x - p.dartBackLeft!.x).toBeLessThan(h.Вз! + 1)
        // Side waist raise and front raise over the back waist line.
        expect(-p.waistSideBack!.y).toBeCloseTo(h.Т2Т20!, 6)
        expect(-p.waistCF!.y).toBeCloseTo(h.Т1Т10!, 6)
        expect(p.waistCB!.y).toBeCloseTo(tc.o.backCentreDrop, 6)
      })

      it('стороны вытачек уравнены, длина вытачки задана', () => {
        const p = r.points
        expect(dist(p.dartBackTip!, p.dartBackLeft!)).toBeCloseTo(dist(p.dartBackTip!, p.dartBackRight!), 6)
        expect(dist(p.dartFrontTip!, p.dartFrontLeft!)).toBeCloseTo(dist(p.dartFrontTip!, p.dartFrontRight!), 6)
        expect(dist(p.dartBackTip!, p.dartBackCentre!)).toBeGreaterThan(tc.o.backDartLength - 2)
      })

      it('сшиваемые срезы совпадают', () => {
        for (const ch of r.checks) expect(ch.ok, `${ch.title}: ${ch.a} / ${ch.b}`).toBe(true)
      })

      it('нет предупреждений для обычной фигуры', () => {
        expect(r.warnings).toEqual([])
      })
    })
  }

  it('даёт две детали: заднюю (крой 2) и переднюю со сгибом', () => {
    const r = draftEmkoSkirt(cases[0]!.m, cases[0]!.o)
    expect(r.pieces.map((p) => p.id)).toEqual(['emko-skirt-back', 'emko-skirt-front'])
    expect(r.pieces[1]!.paths.some((p) => p.role === 'fold')).toBe(true)
    for (const piece of r.pieces) expect(piece.paths[0]!.d).toMatch(/^M [-\d.,]+ .* Z$/)
  })

  it('предупреждает о слишком широкой вытачке', () => {
    const r = draftEmkoSkirt({ ...cases[0]!.m, waist: 600, hips: 1100 }, cases[0]!.o)
    expect(r.warnings.join(' ')).toMatch(/Задняя вытачка/)
  })

  it('работает на типовой фигуре из мерок приложения', () => {
    expect(validateMeasurements(SAMPLE_MEASUREMENTS, { required: emkoSkirt.required, plausibility: false }).filter((i) => i.level === 'error')).toEqual([])
    const r = emkoSkirt.draft(SAMPLE_MEASUREMENTS, emkoSkirt.defaults('semi'))
    expect(r.checks.every((c) => c.ok)).toBe(true)
  })
})
