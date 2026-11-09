import { describe, expect, it } from 'vitest'
import { draftMullerSkirt, mullerSkirt } from './skirt'
import { dist } from '../../draft/geom'
import { GOST_FIGURES, SAMPLE_MEASUREMENTS, typicalFigure } from '../../measurements'

const step = (r: ReturnType<typeof draftMullerSkirt>, id: string) => {
  const s = r.steps.find((x) => x.id === id)
  if (!s) throw new Error(`no step ${id}`)
  return s.value
}

/**
 * The book's own example, p. 1: size 40, ОТ 76, ОБ 100, ВБ 20,8, length 61,5;
 * ease 1 см to both half girths. 51 − 39 = 12 см: side 7, front 2, back 3.
 */
const book = {
  m: { waist: 760, hips: 1000, waistToHips: 208, skirtLength: 615 + 10 },
  o: { waistEase: 10, hipEase: 10, sideRaise: 10, frontDart: 20, sideExtra: 10 },
}

describe('Прямая юбка Мюллера: пример книги, размер 40', () => {
  const r = draftMullerSkirt(book.m, book.o)
  const p = r.points

  it('расчёт как в книге', () => {
    expect(step(r, '2–4')).toBe(510)
    expect(step(r, '1–11')).toBe(390)
    expect(step(r, '11–8')).toBe(120)
    expect(step(r, 'бок')).toBe(70)
    expect(step(r, 'в. пер.')).toBe(20)
    expect(step(r, 'в. зад.')).toBe(30)
    expect(step(r, '1–3')).toBe(615)
  })

  it('чертёж построен по этим размерам (рис. 1–2)', () => {
    expect(p.hipCB!.y).toBe(208)
    expect(p.hipSide!.x).toBe(255)
    expect(p.waistSideBack!).toMatchObject({ x: 220, y: -10 })
    expect(p.waistSideFront!).toMatchObject({ x: 290, y: -10 })
    // One back dart in the middle of the back waist, 3 cm, 14 cm long.
    expect(p.dartBackTip!.x).toBeCloseTo(110, 6)
    expect(p.dartBackRight!.x - p.dartBackLeft!.x).toBeCloseTo(30, 0)
    expect(p.dartBackTip!.y).toBe(140)
    expect(p.dartBackSideTip).toBeUndefined()
    // Front dart 7 cm from the side, 2 cm, 9,5 cm long.
    expect(p.dartFrontTip!.x).toBeCloseTo(360, 6)
    expect(p.dartFrontRight!.x - p.dartFrontLeft!.x).toBeCloseTo(20, 0)
    expect(dist(p.dartFrontTip!, p.dartFrontLeft!)).toBeCloseTo(dist(p.dartFrontTip!, p.dartFrontRight!), 6)
    expect(p.hemSide!.y - p.waistSideTop!.y).toBe(625)
  })

  it('сшиваемые срезы совпадают, предупреждений нет', () => {
    for (const ch of r.checks) expect(ch.ok, `${ch.title}: ${ch.a} / ${ch.b}`).toBe(true)
    expect(r.warnings).toEqual([])
    expect(r.pieces.map((x) => x.id)).toEqual(['muller-skirt-back', 'muller-skirt-front'])
  })
})

describe('Прямая юбка Мюллера: две вытачки сзади', () => {
  // ОТ 70, ОБ 100: 51 − 36 = 15 см, back 15 − 8,5 − 2 = 4,5 → 3 + ... two darts.
  const r = draftMullerSkirt({ ...book.m, waist: 700 }, book.o)
  const p = r.points

  it('ставит первую вытачку в 6 см от середины, вторую посередине до бока', () => {
    expect(step(r, 'в. зад.')).toBe(45)
    expect(p.dartBackTip!.x).toBe(60)
    expect(p.dartBackRight!.x - p.dartBackLeft!.x).toBeCloseTo(30, 0)
    expect(p.dartBackSideRight!.x - p.dartBackSideLeft!.x).toBeCloseTo(15, 0)
    // The side seam moved 0,5 to the front at the top.
    expect(p.waistSideBack!.x).toBeCloseTo(255 - 42.5 + 5, 6)
    expect(p.dartBackSideTip!.x).toBeCloseTo((60 + p.waistSideBack!.x) / 2, 6)
    for (const ch of r.checks) expect(ch.ok, `${ch.title}: ${ch.a} / ${ch.b}`).toBe(true)
  })
})

describe('Прямая юбка Мюллера: другие фигуры', () => {
  it('работает на типовой фигуре из мерок приложения', () => {
    const r = mullerSkirt.draft(SAMPLE_MEASUREMENTS, mullerSkirt.defaults('straight'))
    expect(r.checks.every((c) => c.ok)).toBe(true)
  })

  it('строится на всех типовых фигурах ГОСТ 31396 без ошибок проверки', () => {
    for (const f of GOST_FIGURES) {
      for (const s of ['fitted', 'semi', 'straight'] as const) {
        const r = mullerSkirt.draft(typicalFigure(f), mullerSkirt.defaults(s))
        for (const ch of r.checks) expect(ch.ok, `${f.label} ${s}: ${ch.title} ${ch.a} / ${ch.b}`).toBe(true)
      }
    }
  })
})
