import { MALE_MEASUREMENT_IDS, type MaleMeasurementId, type MaleMeasurementSet, type MaleMeasurements } from './schema'

/**
 * Типовые мужские фигуры и градация ЕМКО СЭВ, т. 3 (этап MM1).
 *
 * Табл. 8 (с. 119) — восемь базовых фигур высотой 176 см; табл. 10 (с. 124) —
 * коэффициенты градации Di,s / Di,h / Di,f в см на шаг: по размеру (Т16 и Т18
 * + 4 см одновременно), по росту (Т1 + 6 см) и по полноте (Т18 + 6 см при
 * неизменных Т16 и Т1). База градации — фигура 176-100-88.
 *
 * Базовые значения есть только у признаков, напечатанных в проверенном
 * фрагменте т. 3 (контрольный расчёт брюк, спецификация § 5.7): Т1, Т7, Т8,
 * Т9, Т12, Т18, Т19, Т22, Т25, Т26, Т27, Т51. Остальные признаки имеют
 * коэффициенты градации, но не имеют базы: их типовых значений в core нет,
 * пока не оцифрована полная табл. 8 / ОСТ 17-325-86. maleTypicalFigure поэтому
 * возвращает частичный набор.
 *
 * За пределами диапазона ГОСТ 17521-72 (табл. 3а) значения помечаются
 * 'estimated' (спецификация § 4.4.4); молчаливая экстраполяция запрещена.
 * Известное расхождение табл. 8 и 10 для Т20 у фигуры 176-92-74 (92,2 против
 * 93,2 см, спецификация § 10.9): базы Т20 в core нет, поэтому значение не
 * воспроизводится и не усредняется.
 */

/** Ведущие признаки мужской типовой фигуры: Р (Т1), Т16, Т18, мм. */
export interface MaleLead {
  height: number
  chest3: number
  waist: number
}

/** Коэффициенты градации ЕМКО СЭВ т. 3, табл. 10, см на шаг. */
export interface MaleGradationCoefficients {
  size: number
  height: number
  fullness: number
}

/** Одна строка табл. 8 ЕМКО СЭВ: базовые типовые фигуры, мм. */
export interface MaleTypicalFigureRow {
  /** «176-100-88»: рост-грудь-талия. */
  label: string
  height: number
  chest3: number
  waist: number
  hips: number
  /** Полнота D = Т16 − Т18, мм. */
  fullness: number
}

export const MALE_EMKO_TABLE_8: MaleTypicalFigureRow[] = [
  { label: '176-92-74', height: 1760, chest3: 920, waist: 740, hips: 948, fullness: 180 },
  { label: '176-100-82', height: 1760, chest3: 1000, waist: 820, hips: 1008, fullness: 180 },
  { label: '176-100-88', height: 1760, chest3: 1000, waist: 880, hips: 1038, fullness: 120 },
  { label: '176-100-94', height: 1760, chest3: 1000, waist: 940, hips: 1068, fullness: 60 },
  { label: '176-100-100', height: 1760, chest3: 1000, waist: 1000, hips: 1098, fullness: 0 },
  { label: '176-112-100', height: 1760, chest3: 1120, waist: 1000, hips: 1128, fullness: 120 },
  { label: '176-112-106', height: 1760, chest3: 1120, waist: 1060, hips: 1158, fullness: 60 },
  { label: '176-112-112', height: 1760, chest3: 1120, waist: 1120, hips: 1188, fullness: 0 },
]

/** База градации: 176-100-88. */
export const MALE_EMKO_BASE_LEAD: MaleLead = { height: 1760, chest3: 1000, waist: 880 }

/**
 * Базовые значения признаков фигуры 176-100-88, мм: ведущие и признаки
 * контрольного расчёта брюк (спецификация § 5.7, табл. 8).
 */
export const MALE_EMKO_BASE_FEATURES: MaleMeasurementSet = {
  height: 1760,
  chest3: 1000,
  waist: 880,
  hips: 1038,
  waistHeight: 1099,
  frontAsisHeight: 1007,
  kneeHeight: 494,
  glutealFoldHeight: 808,
  knee: 388,
  waistToFloorSide: 1108,
  waistToFloorFront: 1103,
  inseam: 814,
  instep: 353,
}

/**
 * Коэффициенты градации табл. 10, см на шаг (спецификация § 4.4.2):
 * построения (31 признак) и контрольные (13 признаков).
 */
export const MALE_EMKO_GRADATION: Partial<Record<MaleMeasurementId, MaleGradationCoefficients>> = {
  height: { size: 0, height: 6.0, fullness: 0 },
  neckBaseHeight: { size: 0.2, height: 5.4, fullness: 0.2 },
  waistHeight: { size: 0, height: 4.4, fullness: 0.4 },
  frontAsisHeight: { size: 0.1, height: 4.1, fullness: 0.1 },
  kneeHeight: { size: 0.2, height: 2.0, fullness: -0.1 },
  glutealFoldHeight: { size: 0, height: 3.5, fullness: 0.1 },
  neck: { size: 0.8, height: 0.4, fullness: 0.4 },
  chest1: { size: 3.5, height: 0.3, fullness: 0 },
  chest2: { size: 3.8, height: 0.2, fullness: 0.4 },
  waist: { size: 4.0, height: 0, fullness: 6.0 },
  hips: { size: 3.0, height: 0.8, fullness: 3.0 },
  thigh: { size: 1.8, height: 0.6, fullness: 0.7 },
  knee: { size: 0.7, height: 0.7, fullness: 0.4 },
  waistToFloorSide: { size: 0, height: 4.5, fullness: 0.6 },
  waistToFloorFront: { size: 0, height: 4.4, fullness: 0.5 },
  inseam: { size: -0.5, height: 3.6, fullness: 0 },
  wrist: { size: 0.3, height: 0.2, fullness: 0.1 },
  neckToRadial: { size: 0.3, height: 1.4, fullness: -0.1 },
  neckToWrist: { size: 0.4, height: 2.1, fullness: -0.1 },
  napeToChest1Front: { size: 0.4, height: 0.1, fullness: -0.2 },
  bustHeight: { size: 0.7, height: 0.4, fullness: 0.9 },
  frontLength: { size: 0.7, height: 0.8, fullness: -0.2 },
  armholeArc: { size: 0.6, height: 0.4, fullness: 0.2 },
  armholeDepthBack: { size: 0.2, height: 0.5, fullness: 0.5 },
  backLength: { size: 0.1, height: 1.0, fullness: -0.2 },
  upperTorsoArc: { size: 0.8, height: 1.7, fullness: -0.6 },
  chestWidth: { size: 1.0, height: 0.3, fullness: 0.5 },
  chestPointDistance: { size: 0.7, height: 0, fullness: 0.2 },
  backWidth: { size: 1.0, height: 0.1, fullness: -0.3 },
  head: { size: 0.4, height: 0.4, fullness: 0.1 },
  instep: { size: 0.3, height: 0.7, fullness: 0 },
  armDepth: { size: 0.5, height: 0, fullness: 0.4 },
  // Контрольные признаки.
  napeHeight: { size: 0.2, height: 5.4, fullness: 0.2 },
  hipsWithoutAbdomen: { size: 2.6, height: 1.0, fullness: 2.2 },
  calf: { size: 0.8, height: 0.4, fullness: 0.3 },
  ankle: { size: 0.4, height: 0.4, fullness: 0.1 },
  upperArm: { size: 1.3, height: 0, fullness: 0.5 },
  hand: { size: 0.3, height: 0.3, fullness: 0 },
  shoulderSlope: { size: 0.1, height: 0.2, fullness: -0.1 },
  slantedShoulderHeight: { size: 0.5, height: 0.7, fullness: -0.6 },
  upperTorsoArcThroughShoulder: { size: 1.2, height: 1.5, fullness: -0.4 },
  backWaistToNeckBase: { size: 0.3, height: 0.9, fullness: -0.7 },
  waistToSeat: { size: 0.1, height: 0.7, fullness: 0.3 },
  bentKnee: { size: 0.8, height: 0.8, fullness: 0.4 },
  shoulderDiameter: { size: 0.5, height: 0.8, fullness: -0.1 },
}

/**
 * Диапазон ведущих признаков, внутри которого градация считается НОРМ
 * (ГОСТ 17521-72 / ОСТ 17-325-86, приблизительно по табл. 8 и шагам сетки;
 * точные границы табл. 3а уточнить по действующей редакции ОСТ). Вне его —
 * только явная экстраполяция с меткой 'estimated'.
 */
export const MALE_EMKO_RANGE: { height: [number, number]; chest3: [number, number]; waist: [number, number] } = {
  height: [1550, 2000],
  chest3: [840, 1280],
  waist: [640, 1320],
}

/** Попадают ли ведущие признаки в нормативный диапазон градации. */
export function maleLeadInRange(lead: MaleLead): boolean {
  return (
    lead.height >= MALE_EMKO_RANGE.height[0] && lead.height <= MALE_EMKO_RANGE.height[1] &&
    lead.chest3 >= MALE_EMKO_RANGE.chest3[0] && lead.chest3 <= MALE_EMKO_RANGE.chest3[1] &&
    lead.waist >= MALE_EMKO_RANGE.waist[0] && lead.waist <= MALE_EMKO_RANGE.waist[1]
  )
}

/**
 * Градация признака по трём осям (спецификация § 4.4.1). Вход и выход — мм,
 * коэффициенты табл. 10 — см, поэтому сумма шагов умножается на 10.
 */
export function gradeMaleFeature(
  baseValueMm: number,
  coefficients: MaleGradationCoefficients,
  lead: MaleLead,
  baseLead: MaleLead = MALE_EMKO_BASE_LEAD,
): number {
  const sizeSteps = (lead.chest3 - baseLead.chest3) / 40
  const heightSteps = (lead.height - baseLead.height) / 60
  const fullnessSteps = ((lead.waist - lead.chest3) - (baseLead.waist - baseLead.chest3)) / 60
  return (
    baseValueMm +
    10 * (coefficients.size * sizeSteps + coefficients.height * heightSteps + coefficients.fullness * fullnessSteps)
  )
}

export interface MaleFeatureEstimate {
  value: number
  /** 'typical' внутри диапазона ГОСТ, 'estimated' — явная экстраполяция. */
  source: 'typical' | 'estimated'
}

/**
 * Типовое значение одного признака для заданных ведущих. Ведущие возвращаются
 * как есть; признаки с базой и коэффициентом градируются; остальные —
 * undefined (базы нет, см. комментарий модуля).
 */
export function maleFeature(id: MaleMeasurementId, lead: MaleLead): MaleFeatureEstimate | undefined {
  if (id === 'height' || id === 'chest3' || id === 'waist') return { value: lead[id], source: 'typical' }
  const base = MALE_EMKO_BASE_FEATURES[id]
  const grad = MALE_EMKO_GRADATION[id]
  if (base === undefined || grad === undefined) return undefined
  return { value: Math.round(gradeMaleFeature(base, grad, lead)), source: maleLeadInRange(lead) ? 'typical' : 'estimated' }
}

/**
 * Контрольная формула обхвата бёдер (спецификация § 4.6):
 * Т19 = 0,25·Т16 + 0,50·Т18 + 34,8 + 0,8·(Т1 − 176)/6, см; здесь в мм.
 * Точно воспроизводит табл. 8; замер Т19 всегда имеет приоритет.
 */
export function maleHipsEstimate(lead: MaleLead): number {
  return Math.round(0.25 * lead.chest3 + 0.5 * lead.waist + 348 + (8 / 60) * (lead.height - 1760))
}

/** Типовые значения, которые известны для заданных ведущих (частичный набор). */
export function maleTypicalFigure(lead: MaleLead): MaleMeasurementSet {
  const out: MaleMeasurementSet = {}
  for (const id of MALE_MEASUREMENT_IDS) {
    const est = maleFeature(id, lead)
    if (est) out[id] = est.value
  }
  return out
}

/** Ведущие признаки из частичного набора, если все три заданы. */
export function maleLeadingOf(m: MaleMeasurementSet): MaleLead | undefined {
  if (m.height === undefined || m.chest3 === undefined || m.waist === undefined) return undefined
  return { height: m.height, chest3: m.chest3, waist: m.waist }
}

/**
 * Предзаполнение по типовой мужской фигуре: сохраняет всё введённое, заполняет
 * пробелы известными типовыми значениями (ведущие и 12 признаков базы).
 */
export function malePrefill(m: MaleMeasurementSet): MaleMeasurementSet {
  const lead = maleLeadingOf(m)
  if (!lead) return m
  const out: MaleMeasurementSet = { ...maleTypicalFigure(lead) }
  for (const id of MALE_MEASUREMENT_IDS) if (m[id] !== undefined) out[id] = m[id]
  return out
}

export interface MaleTypicalMatch extends MaleTypicalFigureRow {
  /** Половины шагов сетки: ±3 см рост, ±2 см грудь и талия (спецификация § 4.5). */
  matches: boolean
  /** lead − row по ведущим признакам, мм; hips — от контрольной оценки. */
  deltas: {
    height: number
    chest3: number
    waist: number
    hips: number
  }
}

/**
 * Ближайшая строка табл. 8 для заданных ведущих: нормализованная квадратичная
 * дистанция (шаги сетки 6/4/4 см). Дельта бёдер считается от контрольной
 * формулы § 4.6, если Т19 не измерялся.
 */
export function nearestMaleFigure(lead: MaleLead): MaleTypicalMatch {
  let best = MALE_EMKO_TABLE_8[0]!
  let bestD = Infinity
  for (const row of MALE_EMKO_TABLE_8) {
    const d =
      ((row.height - lead.height) / 60) ** 2 + ((row.chest3 - lead.chest3) / 40) ** 2 + ((row.waist - lead.waist) / 40) ** 2
    if (d < bestD) {
      bestD = d
      best = row
    }
  }
  const matches =
    Math.abs(best.height - lead.height) <= 30 && Math.abs(best.chest3 - lead.chest3) <= 20 && Math.abs(best.waist - lead.waist) <= 20
  return {
    ...best,
    matches,
    deltas: {
      height: lead.height - best.height,
      chest3: lead.chest3 - best.chest3,
      waist: lead.waist - best.waist,
      hips: maleHipsEstimate(lead) - best.hips,
    },
  }
}

/** Типовая фигура 176-100-88 для тестов и демо мужских блоков. */
export const SAMPLE_MALE_MEASUREMENTS: Partial<MaleMeasurements> = maleTypicalFigure(MALE_EMKO_BASE_LEAD)
