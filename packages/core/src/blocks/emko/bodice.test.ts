import { describe, expect, it } from 'vitest'
import { draftEmkoBodice, emkoBodice, type EmkoBodiceOptions } from './bodice'
import { dist } from '../../draft/geom'
import { GOST_FIGURES, SAMPLE_MEASUREMENTS, typicalFigure } from '../../measurements'

/**
 * Reference: the worked example of the ЕМКО СЭВ dress and sleeve
 * (blogremaking.blogspot.com, 2016). Measurements in cm: Ош 30, Ог1 77,5,
 * Ог2 85, От 59, Впрп 18, Вг 25, Дтп 40,5, Шг 27, Цг 17, Впрз 19,5, Дтс 41,
 * Двт 82, Шс 31, Дп 30, dпзр 9, Дсп 106, Дсб 107, Длуч 45, Дзап 69, Оз 15.
 * Our arm lengths are taken from the shoulder point, so with Шп = 13:
 * elbowLength = 45 − 13 = 32, armLength = 69 − 13 = 56.
 * Ease (cm): СО спинки 1,15, проймы 2,75, полочки 0,65, по талии 3, по рукаву 2,5;
 * ∠β = 13°, Н = 0,08.
 */
const m = {
  neck: 300, bustUpper: 775, bustFull: 850, waist: 590, chestWidth: 270, bustSpan: 170, bustHeight: 250,
  frontLength: 405, armholeDepthFront: 180, backLength: 410, armholeDepth: 195, torsoArc: 820, backWidth: 310,
  armholeArc: 300, armDepth: 90, waistToFloor: 1070, waistToFloorFront: 1060, upperArm: 260, wrist: 150,
  armLength: 560, elbowLength: 320, shoulderLength: 130,
}
const o: EmkoBodiceOptions = {
  easeBack: 11.5, easeArmhole: 27.5, easeFront: 6.5, easeWaist: 30, backDartAngle: 13, shoulderPad: 0, easeSleeve: 25, capEase: 0.08,
}

/** Hand calculation by the formulas (mm), next to the value printed in the source (cm). */
const hand: [id: string, mine: number, source: number][] = [
  ['РГ', 195 + 10.9, 20.6], // Впрз + 1,09
  ['РТ', 410 + 13.1, 42.3], // Дтс + 1,31
  ['ГГ1', 155 + 11.5 + 2, 16.9], // 0,5·Шс + СО + 0,2
  ['Г1Г2', 90 + 27.5 + 1.5, 11.9], // dпзр + СО + 0,15
  ['Г2Г3', 0.5 * (270 + 850 - 775 - 12) + 6.5 + 2, 17.5], // 0,5·(Шг + Ог2 − Ог1 − 1,2) + СО + 0,2
  ['ГГ3', 168.5 + 119 + 175, 46.3],
  ['Г3Т1', 410 - 195 + 2, 21.7], // Дтс − Впрз + 0,2
  ['Г1А', 0.49 * 300 + 9.1, 15.6],
  ['Г2А1', 0.43 * 300 + 8.9, 13.8],
  ['ОО2', 0.62 * 119 + 5, 7.9],
  ['РР1', 0.18 * 300 + 2, 5.6],
  ['Р1Р3', 0.07 * 300 - 3.5, 1.8],
  ['АП', 35 - 0.08 * 310, 1.0],
  ['ГГ4', 0.17 * 310 + 0.5 * 11.5 + 7, 6.5],
  ['∠в', 13 - 0.9 * 1.15, 1.2], // 12°: compared as tenths below
  ['Т1Т4', 0.5 * 170 + 0.5 * 6.5 + 4, 9.2],
  ['Т4Ц', 405 - 250 + 1.5, 15.7],
  ['ЦЦ2', 250 - 180 + 0.5 * 6.5 + 4, 7.7],
  ['Ц2Ц3', 0.5 * (850 - 775 - 12), 3.2],
  ['Ц4Ц5', 0.18 * 300 + 3, 5.7],
  ['ЦР4', 820 - (410 + 21) - (405 - 250) + 6.5 + 3, 24.4],
  ['Р4Р5', 0.205 * 300 + 4, 6.6],
  ['Т2Т5', 295 + 30 + 4.5, 33],
  ['Рвт', 462.5 - 7.5 - 329.5, 12.55],
  ['Т3Т6', 1070 - 1060 - 8, 0.2],
  ['Вт сп', 0.15 * 125.5, 1.9],
  ['Вт п', 0.12 * 125.5, 1.5],
  ['Вт б', 0.18 * 125.5, 2.3],
  ['ШПр', 119, 11.9],
  ['ДПр', 0.93 * 300 + 0.57 * 119 + 70 + 18, 43.48],
  ['ПОР', 0.08 * 434.83, 3.48],
  ['ДОР', 434.83 * 1.08, 46.96],
  ['ШОР', 90 + 45 + 25 + 2, 16.2],
  ['ВОР', 150.42, 15.0],
]

describe('Лиф ЕМКО СЭВ: сверка с примером из учебного построения', () => {
  const r = draftEmkoBodice(m, o)
  const step = (id: string) => r.steps.find((s) => s.id === id)?.value

  it.each(hand)('%s совпадает с ручным расчётом и с примером источника', (id, mine, source) => {
    const value = step(id)
    expect(value, id).toBeDefined()
    expect(value!).toBeCloseTo(mine, 1)
    // The source rounds to 0,1 cm.
    if (id === '∠в') expect(value!).toBeCloseTo(12, 0)
    else expect(Math.abs(value! - source * 10)).toBeLessThanOrEqual(id === 'Вт б' || id === 'Вт сп' ? 1 : 0.6)
  })

  it('чертёж построен по этим размерам', () => {
    const p = r.points
    expect(p.chestCB!.y).toBeCloseTo(205.9, 6)
    expect(p.waistCF!.x).toBeCloseTo(462.5, 6)
    expect(p.armholeBottom!.x).toBeCloseTo(168.5 + 78.78, 6)
    expect(p.armholeBottom!.y).toBeCloseTo(205.9 + 35, 6)
    expect(p.waistCF!.x - p.bustPoint!.x).toBeCloseTo(92.25, 6)
    expect(p.waistCF!.y - p.bustPoint!.y).toBeCloseTo(156.5, 6)
    expect(dist(p.bustPoint!, p.neckSideFront!)).toBeCloseTo(243.5, 6)
    expect(p.waistCF!.x - p.neckSideFront!.x).toBeCloseTo(57, 6)
    expect(p.neckCF!.y - p.neckSideFront!.y).toBeCloseTo(65.5, 6)
    expect(p.neckSideBack!.x).toBeCloseTo(56, 6)
    expect(-p.neckSideBack!.y).toBeCloseTo(17.5, 6)
    // Raised side waist and bust dart mouth on the shoulder.
    expect(p.waistLevelCB!.y - p.waistSideBack!.y).toBeCloseTo(2, 6)
    expect(dist(p.bustDartLeft!, p.bustDartRight!)).toBeCloseTo(31.5, 6)
  })

  it('сшиваемые срезы и окат с проймой сходятся', () => {
    for (const ch of r.checks) expect(ch.ok, `${ch.title}: ${ch.a.toFixed(1)} / ${ch.b.toFixed(1)}`).toBe(true)
    const cap = r.checks.find((c) => c.id === 'cap')!
    expect(cap.a - cap.b).toBeCloseTo(0.08 * 434.83, 0)
  })

  it('плечевая точка полочки чуть за линией проймы, рукав свободнее руки', () => {
    const outside = step('ПА1')!
    expect(outside).toBeGreaterThan(0)
    expect(outside).toBeLessThan(50)
    expect(step('ШР − Оп')!).toBeGreaterThan(20)
    expect(r.warnings).toEqual([])
  })

  it('даёт три детали: спинку, полочку со сгибом и рукав', () => {
    expect(r.pieces.map((p) => p.id)).toEqual(['emko-bodice-back', 'emko-bodice-front', 'emko-sleeve'])
    expect(r.pieces[1]!.paths.some((p) => p.role === 'fold')).toBe(true)
  })
})

describe('Лиф ЕМКО СЭВ на типовых фигурах', () => {
  // Typical secondary measurements are approximate (see m1-results.md); on large busts the
  // front shoulder point falls a few cm inside the armhole line and the block warns about it.
  it('строится и проходит проверки на всех типовых фигурах ГОСТ', () => {
    const failed: string[] = []
    for (const f of GOST_FIGURES) {
      for (const s of ['fitted', 'semi', 'straight'] as const) {
        try {
          const r = emkoBodice.draft(typicalFigure(f), emkoBodice.defaults(s))
          const bad = r.checks.filter((c) => !c.ok).map((c) => `${c.id}${(c.a - c.b).toFixed(0)}`)
          const outside = r.steps.find((x) => x.id === 'ПА1')!.value
          if (bad.length || outside < -60 || outside > 50) failed.push(`${f.label} ${s}: ${bad.join(',')} ПА1=${outside.toFixed(0)}`)
        } catch (e) {
          failed.push(`${f.label} ${s}: ${(e as Error).message}`)
        }
      }
    }
    expect(failed).toEqual([])
  })

  it('работает на образцовой фигуре приложения', () => {
    const r = emkoBodice.draft(SAMPLE_MEASUREMENTS, emkoBodice.defaults('semi'))
    expect(r.checks.every((c) => c.ok)).toBe(true)
  })
})
