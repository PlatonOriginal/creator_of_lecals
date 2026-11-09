import { describe, expect, it } from 'vitest'
import { draftMullerDress, mullerDress, mullerFeatures } from './dress'
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
/** The book's Ог is Müller's own, so no ГОСТ → Müller shift. */
const BOOK_OPTS = { ...mullerDress.defaults('fitted'), bustShift: 0 }

describe('Платье Мюллера: пример книги, размер 48', () => {
  const r = draftMullerDress(BOOK, BOOK_OPTS)

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

describe('Платье Мюллера: таблица признаков по Ог (форум Club Sezon)', () => {
  it('ступенчатые формулы на границах диапазонов', () => {
    // Ог 88: Гпр 8,8 + 11, Вг II 22 + 6, Дтп II Дсп + 4, Шпр/Шг вариант 1: 11 − 1,5 и 22 − 4.
    expect(mullerFeatures(880, 400, 1)).toMatchObject({ Gpr: 198, Vg: 280, Dtp: 440, Shpr: 95, Shg: 180 })
    // Ог 96: Вг II уже 24 + 5, Дтп II + 4,5 (без поправки на (Ог − 100)/10).
    expect(mullerFeatures(960, 400, 1)).toMatchObject({ Vg: 290, Dtp: 445 })
    // Ог 120: Гпр 12 + 10,5; Вг II 30 + 4; Дтп II + 5 + 2; вариант 2: 15 + 0,5 и 30 − 6.
    expect(mullerFeatures(1200, 400, 2)).toMatchObject({ Gpr: 225, Vg: 340, Dtp: 470, Shpr: 155, Shg: 240 })
    // Ог 110, вариант 1 и 2 дают одну сумму Шпр + Шг.
    const a = mullerFeatures(1100, 420, 1)
    const b = mullerFeatures(1100, 420, 2)
    expect(a.Shpr + a.Shg).toBeCloseTo(b.Shpr + b.Shg, 6)
    expect(b.Shpr - a.Shpr).toBeCloseTo(5, 6)
  })

  it('переводит Ог3 по ГОСТ в Ог Мюллера (+1–2 см) и по умолчанию берёт Гпр от Ог', () => {
    const o = mullerDress.defaults('semi')
    const r = draftMullerDress({ ...BOOK, bust: 880 }, o)
    expect(step(r, 'Ог')).toBe(893)
    expect(step(r, 'Гпр')).toBeCloseTo(89.3 + 110, 6)
    const big = draftMullerDress({ ...BOOK, bust: 1200 }, o)
    expect(step(big, 'Ог')).toBe(1218)
    const byMeasure = draftMullerDress(BOOK, { ...o, depthFromBust: 0 })
    expect(step(byMeasure, 'Гпр')).toBe(220)
  })
})
