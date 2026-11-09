import { describe, expect, it } from 'vitest'
import { draftMullerDress, mullerDress } from './dress'
import { GOST_FIGURES, SAMPLE_MEASUREMENTS, typicalFigure } from '../../measurements'

const step = (r: ReturnType<typeof draftMullerDress>, id: string) => {
  const s = r.steps.find((x) => x.id === id)
  if (!s) throw new Error(`no step ${id}`)
  return s.value
}

/**
 * The book's example, p. 49: typical figure size 48, Р 168, Ог 110, От 94,5,
 * Об 114, Др 61,4; Гпр 22, Дсп 42, Вб 64, Ди 106; sleeve hem 24 см.
 * Гпр 22 = Впрз 19,5 + 2,5; Вб = Дсп + 22; Ди = Дсп + 64.
 */
const BOOK = {
  bust: 1100, waist: 945, hips: 1140, backLength: 420, armholeDepth: 195,
  waistToHips: 220, skirtLength: 640, armLength: 614, wrist: 165,
}

describe('Платье Мюллера: пример книги, размер 48', () => {
  const r = draftMullerDress(BOOK, mullerDress.defaults('fitted'))

  it('вспомогательные признаки и ширины как в таблице книги', () => {
    const table: Record<string, number> = {
      'Гпр': 220, 'Дгс': 75, 'Вг II': 325, 'Шс': 197.5, 'Шпр': 147.5, 'Шг': 240, '9–13': 585, '1–2': 230,
    }
    for (const [id, value] of Object.entries(table)) expect(step(r, id), id).toBeCloseTo(value, 6)
    // The book prints Дтп II 47,6 for 42 + 4,5 + 1.
    expect(step(r, 'Дтп II')).toBeCloseTo(475, 6)
  })

  it('талия распределена в пределах книги: бока 3–4 см, вытачка спинки 2–3,5 см', () => {
    expect(step(r, 'бок')).toBeGreaterThanOrEqual(30)
    expect(step(r, 'бок')).toBeLessThanOrEqual(40)
    expect(step(r, 'в. спинки')).toBeGreaterThanOrEqual(20)
    expect(step(r, 'в. спинки')).toBeLessThanOrEqual(35)
    // Front: 34–35 = ¼От − 1,25; the rest up to 37 is the front dart.
    expect(step(r, '34–35')).toBeCloseTo(223.75, 6)
    expect(step(r, '35–37')).toBeGreaterThan(10)
  })

  it('пройма по чертежу близка к значениям книги: Впр(ч) 40, Дпр(ч) 49, Вок 16,3', () => {
    expect(Math.abs(step(r, 'Впр(ч)') - 400)).toBeLessThan(15)
    expect(Math.abs(step(r, 'Дпр(ч)') - 490)).toBeLessThan(10)
    expect(Math.abs(step(r, 'Вок') - 163)).toBeLessThan(8)
  })

  it('вытачки: нагрудная около 10 см у плеча, на лопатки 1–2 см в плече', () => {
    expect(step(r, '32–33')).toBeGreaterThan(90)
    expect(step(r, '32–33')).toBeLessThan(115)
    expect(step(r, 'лопатки')).toBeGreaterThan(10)
    expect(step(r, 'лопатки')).toBeLessThan(25)
  })

  it('сшиваемые срезы сходятся, предупреждений нет', () => {
    for (const ch of r.checks) expect(ch.ok, `${ch.title}: ${ch.a} / ${ch.b}`).toBe(true)
    expect(r.warnings).toEqual([])
    expect(r.pieces.map((x) => x.id)).toEqual(['muller-dress-back', 'muller-dress-front', 'muller-dress-sleeve'])
  })
})

describe('Платье Мюллера: другие фигуры', () => {
  it('работает на типовой фигуре из мерок приложения', () => {
    const r = mullerDress.draft(SAMPLE_MEASUREMENTS, mullerDress.defaults('semi'))
    for (const ch of r.checks) expect(ch.ok, `${ch.title}: ${ch.a} / ${ch.b}`).toBe(true)
  })

  it('строится на всех типовых фигурах ГОСТ 31396 без ошибок проверки', () => {
    for (const f of GOST_FIGURES) {
      for (const s of ['fitted', 'semi', 'straight'] as const) {
        const r = mullerDress.draft(typicalFigure(f), mullerDress.defaults(s))
        for (const ch of r.checks) expect(ch.ok, `${f.label} ${s}: ${ch.title} ${ch.a.toFixed(1)} / ${ch.b.toFixed(1)}`).toBe(true)
      }
    }
  })
})
