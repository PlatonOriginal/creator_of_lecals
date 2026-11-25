import { formatCm } from '../schema'
import { MALE_MEASUREMENTS, MALE_MEASUREMENT_IDS, type MaleMeasurementId, type MaleMeasurementSet } from './schema'
import { maleLeadingOf } from './typical'

export type MaleIssueLevel = 'error' | 'warning'

export interface MaleMeasurementIssue {
  level: MaleIssueLevel
  /** Measurements the issue is about; the first one is where the wizard shows it. */
  ids: MaleMeasurementId[]
  message: string
}

/**
 * Связи мужских признаков (спецификация § 9, этап MM1: Т16 > Т18, Т19 > Т18,
 * Т51 > Т29, Т33 > Т32 > Т31, плюс геометрия высот и ног). `a < b` должно
 * выполняться (строго, с заданным запасом в мм). Ошибки — физически
 * невозможные сочетания; предупреждения — необычные, стоит перемерить.
 *
 * Т16 > Т18 и Т19 > Т18 сделаны предупреждениями: у фигур табл. 8
 * 176-100-100 и 176-112-112 грудь и талия равны, у полных талия больше.
 */
interface Relation {
  a: MaleMeasurementId
  b: MaleMeasurementId
  /** a + margin ≤ b */
  margin?: number
  level: MaleIssueLevel
  message: string
}

const RELATIONS: Relation[] = [
  { a: 'neck', b: 'chest1', level: 'error', message: 'Обхват шеи должен быть меньше обхвата груди первого' },
  { a: 'waist', b: 'chest3', level: 'warning', message: 'Обхват талии больше обхвата груди: так бывает у полных фигур, проверьте мерки' },
  { a: 'waist', b: 'hips', level: 'warning', message: 'Обхват талии больше обхвата бёдер: так бывает редко, проверьте мерки' },
  { a: 'chest1', b: 'chest2', level: 'warning', message: 'Обхват груди второй обычно не меньше первого: спереди он идёт ниже, через сосковые точки' },
  { a: 'chestPointDistance', b: 'chestWidth', level: 'error', message: 'Расстояние между сосковыми точками не может быть больше ширины груди' },
  { a: 'shoulderSlope', b: 'neckToRadial', level: 'error', message: 'Ширина плечевого ската должна быть меньше расстояния от шеи до лучевой точки' },
  { a: 'neckToRadial', b: 'neckToWrist', level: 'error', message: 'Расстояние от шеи до запястья должно быть больше расстояния до лучевой точки (локтя)' },
  { a: 'wrist', b: 'instep', level: 'error', message: 'Обхват запястья должен быть меньше обхвата подъёма стопы' },
  { a: 'wrist', b: 'upperArm', margin: 30, level: 'error', message: 'Обхват запястья должен быть меньше обхвата плеча' },
  { a: 'kneeHeight', b: 'glutealFoldHeight', level: 'error', message: 'Колено не может быть выше подъягодичной складки: проверьте высоты от пола' },
  { a: 'glutealFoldHeight', b: 'frontAsisHeight', level: 'error', message: 'Подъягодичная складка должна быть ниже гребня подвздошной кости: проверьте высоты от пола' },
  { a: 'frontAsisHeight', b: 'waistHeight', level: 'error', message: 'Гребень подвздошной кости должен быть ниже линии талии: проверьте высоты от пола' },
  { a: 'armholeDepthBack', b: 'backLength', margin: 100, level: 'error', message: 'Расстояние до линии обхватов груди должно быть заметно меньше длины спины до талии' },
  { a: 'inseam', b: 'waistToFloorSide', margin: 150, level: 'error', message: 'Длина ноги по внутренней поверхности должна быть заметно меньше расстояния от талии до пола сбоку' },
  { a: 'waistToFloorSide', b: 'height', margin: 500, level: 'error', message: 'Расстояние от талии до пола не может быть так близко к росту' },
  { a: 'knee', b: 'thigh', level: 'error', message: 'Обхват колена должен быть меньше обхвата бедра' },
  { a: 'ankle', b: 'calf', level: 'error', message: 'Обхват щиколотки должен быть меньше обхвата икры' },
  { a: 'ankle', b: 'knee', level: 'error', message: 'Обхват щиколотки должен быть меньше обхвата колена' },
  { a: 'waistToSeat', b: 'inseam', margin: 300, level: 'error', message: 'Высота сидения должна быть заметно меньше длины ноги по внутренней поверхности' },
]

export interface ValidateMaleOptions {
  /** Ids that must be filled in. By default none: missing values are fine while filling in. */
  required?: readonly MaleMeasurementId[]
}

/** Checks a set of male measurements (mm). Returns errors first, then warnings. */
export function validateMaleMeasurements(m: MaleMeasurementSet, opts: ValidateMaleOptions = {}): MaleMeasurementIssue[] {
  const issues: MaleMeasurementIssue[] = []
  const bad = new Set<MaleMeasurementId>()

  for (const id of opts.required ?? []) {
    const v = m[id]
    if (v === undefined || !Number.isFinite(v))
      issues.push({ level: 'error', ids: [id], message: `${MALE_MEASUREMENTS[id].title}: не задано` })
  }

  for (const id of MALE_MEASUREMENT_IDS) {
    const v = m[id]
    if (v === undefined) continue
    const s = MALE_MEASUREMENTS[id]
    if (!Number.isFinite(v)) {
      issues.push({ level: 'error', ids: [id], message: `${s.title}: не число` })
      bad.add(id)
    } else if (v < s.min || v > s.max) {
      bad.add(id)
      issues.push({
        level: 'error',
        ids: [id],
        message: `${s.title}: ${formatCm(v)} вне диапазона ${formatCm(s.min)} – ${formatCm(s.max)}${unitHint(v, s.min, s.max)}`,
      })
    }
  }

  for (const r of RELATIONS) {
    const a = m[r.a]
    const b = m[r.b]
    if (a === undefined || b === undefined || bad.has(r.a) || bad.has(r.b)) continue
    const margin = r.margin ?? 0
    if (a + margin > b) issues.push({ level: r.level, ids: [r.a, r.b], message: r.message })
  }

  return [...issues.filter((i) => i.level === 'error'), ...issues.filter((i) => i.level === 'warning')]
}

/** Issues to show next to one measurement. */
export function maleIssuesFor(id: MaleMeasurementId, issues: MaleMeasurementIssue[]): MaleMeasurementIssue[] {
  return issues.filter((i) => i.ids[0] === id || (i.ids.includes(id) && i.level === 'error'))
}

/** The leading measurements, if the set has all three. */
export { maleLeadingOf }

function unitHint(v: number, min: number, max: number): string {
  if (v * 10 >= min && v * 10 <= max) return '. Похоже, не хватает цифры: мерки вводятся в сантиметрах'
  if (v / 10 >= min && v / 10 <= max) return '. Похоже, лишний ноль или введены миллиметры: мерки вводятся в сантиметрах'
  if (v * 2 >= min && v * 2 <= max) return '. Возможно, введена половина мерки: нужна полная'
  return ''
}
