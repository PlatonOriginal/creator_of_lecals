import { MEASUREMENTS, MEASUREMENT_IDS, formatCm, type MeasurementId, type MeasurementSet } from './schema'
import { leadingOf, typicalValue } from './typical'

export type IssueLevel = 'error' | 'warning'

export interface MeasurementIssue {
  level: IssueLevel
  /** Measurements the issue is about; the first one is where the wizard shows it. */
  ids: MeasurementId[]
  message: string
}

/**
 * Relations between measurements. `a < b` must hold (strictly, with the
 * given margin in mm). Errors are physically impossible combinations;
 * warnings are very unusual ones that are worth re-measuring.
 */
interface Relation {
  a: MeasurementId
  b: MeasurementId
  /** a + margin ≤ b */
  margin?: number
  level: IssueLevel
  message: string
}

const RELATIONS: Relation[] = [
  { a: 'bustUpper', b: 'bust', level: 'error', message: 'Обхват груди третий (по груди) не может быть меньше первого (над грудью)' },
  { a: 'bust', b: 'bustFull', level: 'warning', message: 'Обхват груди второй обычно не меньше третьего: сзади он идёт выше, через лопатки' },
  { a: 'underbust', b: 'bust', level: 'error', message: 'Обхват под грудью должен быть меньше обхвата по груди' },
  { a: 'waist', b: 'hips', level: 'warning', message: 'Обхват талии больше обхвата бёдер: так бывает редко, проверьте мерки' },
  { a: 'neck', b: 'upperArm', margin: -150, level: 'warning', message: 'Обхват шеи заметно больше обхвата плеча: проверьте обе мерки' },
  { a: 'bustSpan', b: 'chestWidth', level: 'error', message: 'Расстояние между центрами груди не может быть больше ширины груди' },
  { a: 'shoulderLength', b: 'backWidth', level: 'error', message: 'Ширина плеча (одного) должна быть меньше ширины спины' },
  { a: 'bustHeight', b: 'frontLength', margin: 50, level: 'error', message: 'Высота груди должна быть заметно меньше длины переда до талии' },
  { a: 'backLength', b: 'frontLength', margin: -30, level: 'warning', message: 'Длина переда до талии обычно не меньше длины спины: перед идёт через грудь' },
  { a: 'armholeDepth', b: 'backLength', margin: 100, level: 'error', message: 'Высота проймы должна быть заметно меньше длины спины до талии' },
  { a: 'wrist', b: 'upperArm', margin: 30, level: 'error', message: 'Обхват запястья должен быть меньше обхвата плеча' },
  { a: 'elbowLength', b: 'armLength', margin: 100, level: 'error', message: 'Длина до локтя должна быть заметно меньше длины руки до запястья' },
  { a: 'waistToHips', b: 'crotchDepth', level: 'error', message: 'Линия бёдер не может быть ниже сиденья: высота бёдер должна быть меньше высоты сидения' },
  { a: 'crotchDepth', b: 'waistToKnee', margin: 100, level: 'error', message: 'Высота сидения должна быть заметно меньше длины до колена' },
  { a: 'waistToKnee', b: 'waistToFloor', margin: 200, level: 'error', message: 'Длина до колена должна быть заметно меньше длины до пола' },
  { a: 'waistToFloorBack', b: 'waistToFloor', margin: -10, level: 'warning', message: 'Сзади линия талии обычно не выше, чем сбоку: проверьте длину до пола сзади и сбоку' },
  { a: 'waistToFloor', b: 'waistToFloorBack', margin: -60, level: 'warning', message: 'Сбоку линия талии выше, чем сзади, больше чем на 6 см: проверьте обе мерки' },
  { a: 'glutealFoldHeight', b: 'waistToFloorBack', margin: 150, level: 'error', message: 'Подъягодичная складка должна быть заметно ниже линии талии: проверьте высоту складки и высоту талии' },
  { a: 'inseam', b: 'waistToFloor', margin: 150, level: 'error', message: 'Длина ноги по внутренней поверхности должна быть заметно меньше длины от талии до пола' },
  { a: 'waistToFloor', b: 'height', margin: 500, level: 'error', message: 'Длина от талии до пола не может быть так близка к росту' },
  { a: 'thigh', b: 'hips', margin: 100, level: 'error', message: 'Обхват бедра (одной ноги) должен быть заметно меньше обхвата бёдер' },
  { a: 'knee', b: 'thigh', level: 'error', message: 'Обхват колена должен быть меньше обхвата бедра' },
  { a: 'ankle', b: 'calf', level: 'error', message: 'Обхват щиколотки должен быть меньше обхвата икры' },
  { a: 'ankle', b: 'knee', level: 'error', message: 'Обхват щиколотки должен быть меньше обхвата колена' },
]

export interface ValidateOptions {
  /** Ids that must be filled in. By default none: missing values are fine while filling in. */
  required?: readonly MeasurementId[]
  /** Compare with the typical figure for the leading measurements. Default true. */
  plausibility?: boolean
}

/** Checks a set of measurements (mm). Returns errors first, then warnings. */
export function validateMeasurements(m: MeasurementSet, opts: ValidateOptions = {}): MeasurementIssue[] {
  const issues: MeasurementIssue[] = []
  const bad = new Set<MeasurementId>()

  for (const id of opts.required ?? []) {
    const v = m[id]
    if (v === undefined || !Number.isFinite(v))
      issues.push({ level: 'error', ids: [id], message: `${MEASUREMENTS[id].title}: не задано` })
  }

  for (const id of MEASUREMENT_IDS) {
    const v = m[id]
    if (v === undefined) continue
    const s = MEASUREMENTS[id]
    if (!Number.isFinite(v)) {
      issues.push({ level: 'error', ids: [id], message: `${s.title}: не число` })
      bad.add(id)
    } else if (v < s.min || v > s.max) {
      bad.add(id)
      issues.push({ level: 'error', ids: [id], message: `${s.title}: ${formatCm(v)} вне диапазона ${formatCm(s.min)} – ${formatCm(s.max)}${unitHint(v, s.min, s.max)}` })
    }
  }

  for (const r of RELATIONS) {
    const a = m[r.a]
    const b = m[r.b]
    if (a === undefined || b === undefined || bad.has(r.a) || bad.has(r.b)) continue
    const margin = r.margin ?? 0
    // margin > 0 tightens the rule, margin < 0 loosens it.
    if (a + margin > b)
      issues.push({ level: r.level, ids: [r.a, r.b], message: r.message })
  }

  const lead = leadingOf(m)
  if ((opts.plausibility ?? true) && lead && !['height', 'bust', 'hips'].some((id) => bad.has(id as MeasurementId))) {
    for (const id of MEASUREMENT_IDS) {
      const v = m[id]
      if (v === undefined || bad.has(id)) continue
      const t = typicalValue(id, lead)
      if (!Number.isFinite(t.spread) || t.spread === 0) continue
      const dev = v - t.value
      if (Math.abs(dev) > 3 * t.spread)
        issues.push({
          level: 'warning',
          ids: [id],
          message: `${MEASUREMENTS[id].title}: ${formatCm(v)} — на ${formatCm(Math.abs(dev))} ${dev > 0 ? 'больше' : 'меньше'} типичного (${formatCm(t.value)}) для вашего роста и обхватов. Если перемеряли и всё так, оставьте.`,
        })
    }
  }

  return [...issues.filter((i) => i.level === 'error'), ...issues.filter((i) => i.level === 'warning')]
}

/** Issues to show next to one measurement. */
export function issuesFor(id: MeasurementId, issues: MeasurementIssue[]): MeasurementIssue[] {
  return issues.filter((i) => i.ids[0] === id || (i.ids.includes(id) && i.level === 'error'))
}

function unitHint(v: number, min: number, max: number): string {
  if (v * 10 >= min && v * 10 <= max) return '. Похоже, не хватает цифры: мерки вводятся в сантиметрах'
  if (v / 10 >= min && v / 10 <= max) return '. Похоже, лишний ноль или введены миллиметры: мерки вводятся в сантиметрах'
  if (v * 2 >= min && v * 2 <= max) return '. Возможно, введена половина мерки: нужна полная'
  return ''
}
