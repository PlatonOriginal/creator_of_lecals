import { describe, expect, it } from 'vitest'
import {
  MALE_DERIVED_FORMULAS,
  MALE_EMKO_BASE_FEATURES,
  MALE_EMKO_BASE_LEAD,
  MALE_EMKO_GRADATION,
  MALE_EMKO_TABLE_8,
  MALE_LEADING_IDS,
  MALE_MEASUREMENTS,
  MALE_MEASUREMENT_IDS,
  SAMPLE_MALE_MEASUREMENTS,
  maleDerived,
  maleFeature,
  maleHalves,
  maleHipsEstimate,
  maleIssuesFor,
  maleLeadInRange,
  malePrefill,
  maleTypicalFigure,
  nearestMaleFigure,
  validateMaleMeasurements,
  type MaleMeasurementId,
} from './index'

const messages = (m: Parameters<typeof validateMaleMeasurements>[0]) => validateMaleMeasurements(m).map((i) => i.message)

describe('male schema', () => {
  it('has unique ids and feature numbers, sane ranges and hints', () => {
    expect(new Set(MALE_MEASUREMENT_IDS).size).toBe(MALE_MEASUREMENT_IDS.length)
    const shorts = MALE_MEASUREMENT_IDS.map((id) => MALE_MEASUREMENTS[id].short)
    expect(new Set(shorts).size).toBe(shorts.length)
    for (const id of MALE_MEASUREMENT_IDS) {
      const s = MALE_MEASUREMENTS[id]
      expect(s.min).toBeGreaterThan(0)
      expect(s.max).toBeGreaterThan(s.min)
      expect(s.hint.length).toBeGreaterThan(20)
    }
  })

  it('starts with the leading measurements of ГОСТ 17521-72', () => {
    expect(MALE_LEADING_IDS).toEqual(['height', 'chest3', 'waist'])
    expect(MALE_MEASUREMENT_IDS.slice(0, 3)).toEqual(MALE_LEADING_IDS)
    // Р (Т1), Т16 и Т18 — ведущие признаки мужской типовой фигуры.
    expect(MALE_LEADING_IDS.map((id) => MALE_MEASUREMENTS[id].short)).toEqual(['Т1', 'Т16', 'Т18'])
  })

  it('gives every base feature of the tables a gradation coefficient', () => {
    for (const id of Object.keys(MALE_EMKO_BASE_FEATURES) as MaleMeasurementId[]) {
      if (id === 'height' || id === 'chest3' || id === 'waist') continue
      expect(MALE_EMKO_GRADATION[id], id).toBeDefined()
    }
  })
})

describe('male typical figure', () => {
  it('lists the eight base figures of table 8, all 176 cm', () => {
    expect(MALE_EMKO_TABLE_8.map((r) => r.label)).toEqual([
      '176-92-74', '176-100-82', '176-100-88', '176-100-94',
      '176-100-100', '176-112-100', '176-112-106', '176-112-112',
    ])
    for (const r of MALE_EMKO_TABLE_8) {
      expect(r.height).toBe(1760)
      // Полнота D = Т16 − Т18.
      expect(r.fullness).toBe(r.chest3 - r.waist)
    }
  })

  it('reproduces the base figure 176-100-88 exactly', () => {
    expect(maleTypicalFigure(MALE_EMKO_BASE_LEAD)).toEqual(MALE_EMKO_BASE_FEATURES)
    expect(SAMPLE_MALE_MEASUREMENTS).toEqual(MALE_EMKO_BASE_FEATURES)
  })

  it('reproduces the hips of every fullness group from the control formula and the gradation', () => {
    // Т19 = 0,25·Т16 + 0,50·Т18 + 34,8 + 0,8·(Т1 − 176)/6 воспроизводит табл. 8 точно.
    for (const row of MALE_EMKO_TABLE_8) {
      expect(maleHipsEstimate(row), row.label).toBe(row.hips)
      expect(maleTypicalFigure(row).hips, row.label).toBe(row.hips)
    }
  })

  it('grows with height and fullness like the tables prescribe', () => {
    const base = maleTypicalFigure(MALE_EMKO_BASE_LEAD)
    // Рост +6 см при том же размере: вертикали растут, бёдра почти на месте.
    const taller = maleTypicalFigure({ height: 1820, chest3: 1000, waist: 880 })
    expect(taller.waistHeight).toBe(base.waistHeight! + 44)
    expect(taller.inseam).toBe(base.inseam! + 36)
    expect(taller.waistToFloorSide).toBe(base.waistToFloorSide! + 45)
    expect(taller.hips).toBe(base.hips! + 8)
    // Полнота +6 см талии при том же размере и росте.
    const fuller = maleTypicalFigure({ height: 1760, chest3: 1000, waist: 940 })
    expect(fuller.hips).toBe(base.hips! + 30)
    expect(fuller.waistToFloorSide).toBe(base.waistToFloorSide! + 6)
    // Коэффициент градации inseam по полноте равен нулю.
    expect(fuller.inseam).toBe(base.inseam!)
  })

  it('grades features along all three axes of table 10', () => {
    // Полшага роста (1790): +4,4 см / 2 = +22 мм к высоте талии, округление до целых.
    expect(maleFeature('waistHeight', { height: 1790, chest3: 1000, waist: 880 })).toEqual({ value: 1121, source: 'typical' })
    // 176-100-94 (полнота +1 шаг): обхваты растут, длины почти на месте.
    expect(maleTypicalFigure({ height: 1760, chest3: 1000, waist: 940 })).toMatchObject({
      hips: 1068, waistHeight: 1103, kneeHeight: 493, waistToFloorSide: 1114, inseam: 814,
    })
    // 176-112-100 (размер +3 шага): талия той же высоты, колено ниже, шаг короче.
    expect(maleTypicalFigure({ height: 1760, chest3: 1120, waist: 1000 })).toMatchObject({
      hips: 1128, waistHeight: 1099, kneeHeight: 500, inseam: 799,
    })
  })

  it('marks extrapolation beyond ГОСТ 17521-72 as estimated', () => {
    expect(maleLeadInRange(MALE_EMKO_BASE_LEAD)).toBe(true)
    expect(maleLeadInRange({ height: 1550, chest3: 840, waist: 640 })).toBe(true)
    expect(maleLeadInRange({ height: 2000, chest3: 1280, waist: 1320 })).toBe(true)
    expect(maleLeadInRange({ height: 1520, chest3: 1000, waist: 880 })).toBe(false)
    expect(maleLeadInRange({ height: 1760, chest3: 800, waist: 880 })).toBe(false)
    expect(maleLeadInRange({ height: 1760, chest3: 1000, waist: 1340 })).toBe(false)
    // Внутри диапазона — 'typical', за пределами — только явная 'estimated'.
    expect(maleFeature('hips', MALE_EMKO_BASE_LEAD)).toEqual({ value: 1038, source: 'typical' })
    expect(maleFeature('hips', { height: 2060, chest3: 1000, waist: 880 })).toEqual({ value: 1078, source: 'estimated' })
  })

  it('returns nothing for features that have coefficients but no base value', () => {
    for (const id of ['neck', 'backLength', 'thigh', 'upperArm'] as const) {
      expect(maleFeature(id, MALE_EMKO_BASE_LEAD), id).toBeUndefined()
      expect(maleTypicalFigure(MALE_EMKO_BASE_LEAD)[id], id).toBeUndefined()
    }
  })

  it('prefill keeps entered values and fills the rest', () => {
    const p = malePrefill({ height: 1760, chest3: 1000, waist: 880, neck: 400, hips: 1200 })
    expect(p.neck).toBe(400)
    expect(p.hips).toBe(1200)
    expect(p.waistHeight).toBe(1099)
    expect(p.inseam).toBe(814)
    // Без полного набора ведущих предзаполнение не работает.
    expect(malePrefill({ height: 1760, chest3: 1000 })).toEqual({ height: 1760, chest3: 1000 })
  })

  it('snaps to the nearest base figure and reports deltas', () => {
    expect(nearestMaleFigure(MALE_EMKO_BASE_LEAD)).toMatchObject({
      label: '176-100-88', matches: true, deltas: { height: 0, chest3: 0, waist: 0, hips: 0 },
    })
    // Полшага по всем трём осям — ещё считается совпадением.
    expect(nearestMaleFigure({ height: 1780, chest3: 1020, waist: 900 })).toMatchObject({
      label: '176-100-88', matches: true, deltas: { height: 20, chest3: 20, waist: 20 },
    })
    expect(nearestMaleFigure({ height: 1700, chest3: 920, waist: 760 })).toMatchObject({ label: '176-92-74', matches: false })
    expect(nearestMaleFigure({ height: 1860, chest3: 1160, waist: 1080 })).toMatchObject({ label: '176-112-106', matches: false })
  })

  it('is valid for every base figure, without warnings', () => {
    for (const row of MALE_EMKO_TABLE_8) {
      expect(validateMaleMeasurements(maleTypicalFigure(row)), row.label).toEqual([])
    }
    expect(validateMaleMeasurements(SAMPLE_MALE_MEASUREMENTS)).toEqual([])
  })
})

describe('validateMaleMeasurements', () => {
  it('accepts the sample figure and a partial set', () => {
    expect(validateMaleMeasurements(SAMPLE_MALE_MEASUREMENTS)).toEqual([])
    expect(validateMaleMeasurements({ height: 1760 })).toEqual([])
  })

  it('reports missing required values', () => {
    expect(messages({})).toEqual([])
    expect(validateMaleMeasurements({}, { required: ['chest3'] })[0]?.message).toBe('Обхват груди третий: не задано')
  })

  it('rejects out-of-range values and hints at units', () => {
    const issues = validateMaleMeasurements({ chest3: 10000 })
    expect(issues[0]).toMatchObject({ level: 'error', ids: ['chest3'] })
    expect(issues[0]!.message).toMatch(/вне диапазона/)
    expect(issues[0]!.message).toMatch(/сантиметрах/)
    expect(messages({ chestWidth: 200 })[0]).toMatch(/половина/)
  })

  it('catches impossible relations as errors', () => {
    // Запас в 30 мм: запястье + 30 не может быть больше обхвата плеча.
    expect(messages({ wrist: 220, upperArm: 200 })).toContain('Обхват запястья должен быть меньше обхвата плеча')
    // На границе запаса (200 + 30 = 230) ошибки ещё нет.
    expect(messages({ wrist: 200, upperArm: 230 })).toEqual([])
    expect(messages({ frontAsisHeight: 1150, waistHeight: 1100 })).toContain(
      'Гребень подвздошной кости должен быть ниже линии талии: проверьте высоты от пола',
    )
    expect(messages({ glutealFoldHeight: 950, frontAsisHeight: 900 })).toContain(
      'Подъягодичная складка должна быть ниже гребня подвздошной кости: проверьте высоты от пола',
    )
    expect(messages({ inseam: 950, waistToFloorSide: 1050 })).toContain(
      'Длина ноги по внутренней поверхности должна быть заметно меньше расстояния от талии до пола сбоку',
    )
    expect(messages({ knee: 560, thigh: 540 })).toContain('Обхват колена должен быть меньше обхвата бедра')
    expect(messages({ waistToSeat: 380, inseam: 650 })).toContain(
      'Высота сидения должна быть заметно меньше длины ноги по внутренней поверхности',
    )
    expect(validateMaleMeasurements({ wrist: 220, upperArm: 200 })[0]).toMatchObject({
      level: 'error', ids: ['wrist', 'upperArm'],
    })
  })

  it('does not compare values that are out of range themselves', () => {
    const issues = validateMaleMeasurements({ neck: 5000, chest1: 900 })
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toMatch(/вне диапазона/)
  })

  it('warns, but does not block, on unusual relations', () => {
    const issues = validateMaleMeasurements({ chest3: 1000, waist: 1100, hips: 1200 })
    expect(issues.find((i) => i.message.startsWith('Обхват талии больше обхвата груди'))?.level).toBe('warning')
    expect(issues.every((i) => i.level === 'warning')).toBe(true)
    expect(messages({ waist: 1150, hips: 1100 })).toContain(
      'Обхват талии больше обхвата бёдер: так бывает редко, проверьте мерки',
    )
    expect(messages({ chest2: 900, chest1: 950 })).toContain(
      'Обхват груди второй обычно не меньше первого: спереди он идёт ниже, через сосковые точки',
    )
    // Равные грудь и талия (176-100-100, 176-112-112) — норма, не предупреждение.
    expect(validateMaleMeasurements({ chest3: 1000, waist: 1000 })).toEqual([])
  })

  it('lists errors before warnings', () => {
    const issues = validateMaleMeasurements({ wrist: 220, upperArm: 200, waist: 1100, hips: 1050 })
    expect(issues[0]!.level).toBe('error')
    expect(issues.at(-1)!.level).toBe('warning')
  })

  it('maleIssuesFor shows related errors on both measurements, warnings only on the first', () => {
    const issues = validateMaleMeasurements({ frontAsisHeight: 1150, waistHeight: 1100, waist: 1100, hips: 1050 })
    expect(maleIssuesFor('frontAsisHeight', issues)).toHaveLength(1)
    expect(maleIssuesFor('waistHeight', issues)).toHaveLength(1)
    expect(maleIssuesFor('waist', issues)).toHaveLength(1)
    expect(maleIssuesFor('hips', issues)).toEqual([])
  })
})

describe('maleDerived', () => {
  it('documents the computed features Т60–Т63', () => {
    expect(MALE_DERIVED_FORMULAS.frontArcThroughShoulder).toBe('Т60 = Т42 − Т41')
    expect(MALE_DERIVED_FORMULAS.frontArcThroughNeckBase).toBe('Т61 = Т44 − Т43')
    expect(MALE_DERIVED_FORMULAS.upperArmLength).toBe('Т62 = Т32 − Т31')
    expect(MALE_DERIVED_FORMULAS.forearmLength).toBe('Т63 = Т33 − Т32')
  })

  it('computes the verticals of the base figure 176-100-88', () => {
    expect(maleDerived(SAMPLE_MALE_MEASUREMENTS)).toEqual({
      waistToHipVertical: 291,
      waistToKneeVertical: 605,
      frontAsisToWaistVertical: 92,
    })
  })

  it('computes Т60–Т63 only when both inputs are present', () => {
    expect(maleDerived({})).toEqual({})
    expect(maleDerived({ waistHeight: 1099 })).toEqual({})
    expect(
      maleDerived({
        upperTorsoArcThroughShoulder: 1210,
        slantedShoulderHeight: 470,
        upperTorsoArc: 1330,
        backWaistToNeckBase: 490,
        neckToRadial: 440,
        shoulderSlope: 130,
        neckToWrist: 620,
      }),
    ).toEqual({
      frontArcThroughShoulder: 740, // Т60 = 1210 − 470
      frontArcThroughNeckBase: 840, // Т61 = 1330 − 490
      upperArmLength: 310, // Т62 = 440 − 130
      forearmLength: 180, // Т63 = 620 − 440
    })
  })

  it('maleHalves returns half girths for the construction or undefined', () => {
    expect(maleHalves({ chest3: 1000, waist: 880, hips: 1038, thigh: 560 })).toEqual({
      halfChest3: 500,
      halfWaist: 440,
      halfHips: 519,
      halfThigh: 280,
    })
    expect(maleHalves({ height: 1760 })).toEqual({
      halfChest3: undefined,
      halfWaist: undefined,
      halfHips: undefined,
      halfThigh: undefined,
    })
  })
})
