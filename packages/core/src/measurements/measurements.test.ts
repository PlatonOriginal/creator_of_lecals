import { describe, expect, it } from 'vitest'
import {
  GOST_FIGURES,
  LEADING_IDS,
  MEASUREMENTS,
  MEASUREMENT_IDS,
  SAMPLE_MEASUREMENTS,
  nearestTypicalFigure,
  prefill,
  typicalFigure,
  validateMeasurements,
} from '.'

const messages = (m: Parameters<typeof validateMeasurements>[0]) => validateMeasurements(m).map((i) => i.message)

describe('schema', () => {
  it('has unique ids and abbreviations, sane ranges and hints', () => {
    expect(new Set(MEASUREMENT_IDS).size).toBe(MEASUREMENT_IDS.length)
    const shorts = MEASUREMENT_IDS.map((id) => MEASUREMENTS[id].short)
    expect(new Set(shorts).size).toBe(shorts.length)
    for (const id of MEASUREMENT_IDS) {
      const s = MEASUREMENTS[id]
      expect(s.min).toBeGreaterThan(0)
      expect(s.max).toBeGreaterThan(s.min)
      expect(s.hint.length).toBeGreaterThan(20)
    }
  })

  it('starts with the leading measurements of ГОСТ 31396-2009', () => {
    expect(LEADING_IDS).toEqual(['height', 'bust', 'hips', 'waist'])
    expect(MEASUREMENT_IDS.slice(0, 4)).toEqual(LEADING_IDS)
  })
})

describe('typical figure', () => {
  it('is valid for every typical figure of the standard, without warnings', () => {
    for (const f of GOST_FIGURES) {
      const fig = typicalFigure(f)
      const issues = validateMeasurements(fig, { required: MEASUREMENT_IDS })
      expect(issues.map((i) => i.message), f.label).toEqual([])
    }
  })

  it('grows with height and size', () => {
    const base = typicalFigure({ height: 1640, bust: 880, hips: 960 })
    const taller = typicalFigure({ height: 1700, bust: 880, hips: 960 })
    const bigger = typicalFigure({ height: 1640, bust: 960, hips: 1040 })
    expect(taller.backLength).toBeGreaterThan(base.backLength)
    expect(taller.waistToFloor - base.waistToFloor).toBeGreaterThanOrEqual(30)
    // ОСТ 17-326-81: a taller figure of the same size has a slightly smaller waist.
    expect(taller.waist).toBe(base.waist - 12)
    expect(bigger.waist).toBeGreaterThan(base.waist + 60)
    expect(bigger.backLength - base.backLength).toBeLessThan(10)
  })

  it('repeats the tables of ОСТ 17-326-81 on its own figures', () => {
    // 164-88-96, second fullness group (table 6).
    expect(typicalFigure({ height: 1640, bust: 880, hips: 960 })).toMatchObject({
      waist: 676, bustUpper: 858, bustFull: 928, underbust: 764, neck: 354, shoulderLength: 131,
      backWidth: 346, chestWidth: 330, bustSpan: 192, backLength: 401, armholeDepth: 175, armholeArc: 304,
      torsoArc: 859, armDepth: 100, upperArm: 275, wrist: 159, armLength: 552, elbowLength: 316,
      crotchDepth: 272, waistToKnee: 582, waistToFloor: 1057, waistToFloorBack: 1028, waistToFloorFront: 1036,
      glutealFoldHeight: 738, inseam: 769, instep: 314, thigh: 546, knee: 353, calf: 342, ankle: 221,
    })
    // 158-96-100, first group (table 4); 164-112-124, third group (table 10); 164-132-140, second group (table 8).
    expect(typicalFigure({ height: 1580, bust: 960, hips: 1000 })).toMatchObject({ waist: 752, backLength: 393, thigh: 561 })
    expect(typicalFigure({ height: 1640, bust: 1120, hips: 1240 })).toMatchObject({ waist: 954, backLength: 406, thigh: 664, upperArm: 358 })
    expect(typicalFigure({ height: 1640, bust: 1320, hips: 1400 })).toMatchObject({ waist: 1196, neck: 434, backWidth: 450, waistToFloor: 1069 })
  })

  it('interpolates between the fullness groups and the bust bands of the tables', () => {
    const v = (bust: number, hips: number) => typicalFigure({ height: 1580, bust, hips }).waist
    expect(v(880, 940)).toBe((v(880, 920) + v(880, 960)) / 2)
    // Between Ог3 104 (table 6) and 108 (table 7).
    expect(v(1060, 1140)).toBe((v(1040, 1120) + v(1080, 1160)) / 2)
    // ГОСТ 31396-2009 has groups beyond the old standard: the trend continues.
    expect(v(880, 860)).toBeLessThan(v(880, 920))
    expect(v(880, 1060)).toBeGreaterThan(v(880, 1040))
  })

  it('prefill keeps entered values and fills the rest', () => {
    const p = prefill({ height: 1700, bust: 920, hips: 1000, waist: 760, neck: 370 })
    expect(p.waist).toBe(760)
    expect(p.neck).toBe(370)
    for (const id of MEASUREMENT_IDS) expect(p[id], id).toBeTypeOf('number')
    expect(prefill({ height: 1700 })).toEqual({ height: 1700 })
  })

  it('lists the 356 typical figures of table 3', () => {
    expect(GOST_FIGURES).toHaveLength(356)
    expect(new Set(GOST_FIGURES.map((f) => f.label)).size).toBe(356)
  })

  it('snaps to the nearest typical figure and fullness group', () => {
    expect(nearestTypicalFigure({ height: 1660, bust: 890, hips: 950 })).toMatchObject({ label: '164-88-94', group: 2, matches: true })
    expect(nearestTypicalFigure({ height: 1700, bust: 1000, hips: 1110 })).toMatchObject({ label: '170-100-110', group: 3 })
    // 182 cm exists only from Ог3 96 in the first group.
    expect(nearestTypicalFigure({ height: 1820, bust: 840, hips: 860 })).toMatchObject({ label: '176-84-86', matches: false })
    // No group 0 at Ог3 80: the nearest is 158-80-82 (first group).
    expect(nearestTypicalFigure({ height: 1580, bust: 800, hips: 780 })).toMatchObject({ label: '158-80-82', group: 1 })
  })
})

describe('validateMeasurements', () => {
  it('accepts the sample figure and a partial set', () => {
    expect(validateMeasurements(SAMPLE_MEASUREMENTS)).toEqual([])
    expect(validateMeasurements({ height: 1640 })).toEqual([])
  })

  it('reports missing required values', () => {
    expect(messages({})).toEqual([])
    expect(validateMeasurements({}, { required: ['waist'] })[0]?.message).toBe('Обхват талии: не задано')
  })

  it('rejects out-of-range values and hints at units', () => {
    const issues = validateMeasurements({ bust: 8800 })
    expect(issues[0]).toMatchObject({ level: 'error', ids: ['bust'] })
    expect(issues[0]!.message).toMatch(/вне диапазона.*миллиметры/)
    expect(messages({ backWidth: 172 })[0]).toMatch(/половина/)
  })

  it('catches impossible relations as errors', () => {
    const issues = validateMeasurements({ ...SAMPLE_MEASUREMENTS, bustUpper: 900, bust: 880 })
    expect(issues.find((i) => i.ids.includes('bustUpper'))).toMatchObject({ level: 'error', ids: ['bustUpper', 'bust'] })
    expect(messages({ waistToHips: 270, crotchDepth: 250 })).toContain(
      'Линия бёдер не может быть ниже сиденья: высота бёдер должна быть меньше высоты сидения',
    )
  })

  it('warns, but does not block, on unusual relations', () => {
    const issues = validateMeasurements({ ...SAMPLE_MEASUREMENTS, waist: 1000 })
    const w = issues.find((i) => i.message.startsWith('Обхват талии больше обхвата бёдер'))
    expect(w?.level).toBe('warning')
    expect(issues.every((i) => i.level === 'warning')).toBe(true)
  })

  it('warns when a value is far from the typical figure', () => {
    const issues = validateMeasurements({ ...SAMPLE_MEASUREMENTS, backLength: 335 })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ level: 'warning', ids: ['backLength'] })
    expect(validateMeasurements({ ...SAMPLE_MEASUREMENTS, backLength: 335 }, { plausibility: false })).toEqual([])
  })

  it('lists errors before warnings', () => {
    const issues = validateMeasurements({ ...SAMPLE_MEASUREMENTS, waist: 1000, ankle: 400 })
    expect(issues[0]!.level).toBe('error')
    expect(issues.at(-1)!.level).toBe('warning')
  })
})
