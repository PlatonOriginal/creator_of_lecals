/**
 * The fitting log (stage M5): what the sewist had to change on each mock-up.
 *
 * Every entry keeps a snapshot of what the pattern was built from (the
 * measurements, the block and method, the ease options, the modelling
 * layers) and of the ease map the app showed, so the log still means the
 * same after the formulas change. The sewist adds her fixes («убрать 1,5 см
 * по боковому шву на талии»), how each fit level actually felt, and where
 * the interface confused her.
 *
 * The rule from the prototype plan: a fix that repeats on different figures
 * is an error in the formulas, not in the measurements. `repeatedFixes`
 * finds those.
 */
import { BLOCKS } from '../blocks'
import { METHODS, SILHOUETTES, type GarmentKind, type MethodId, type Silhouette } from '../blocks/types'
import { EASE_VERDICTS, type EaseVerdict, type FitLevelId } from '../fitmap'
import { MEASUREMENT_LIST, type MeasurementSet } from '../measurements'
import type { ModelSpec } from '../pattern/model'

export interface FitZone {
  id: string
  title: string
}

const Z = (id: string, title: string): FitZone => ({ id, title })

/** Places on the garment where a fix is made, per garment kind. */
export const FIT_ZONES: Record<GarmentKind, FitZone[]> = {
  dress: [
    Z('neck', 'Горловина'),
    Z('shoulder', 'Плечевой шов'),
    Z('armhole', 'Пройма'),
    Z('sleeveCap', 'Окат рукава'),
    Z('sleeve', 'Рукав: ширина'),
    Z('sleeveLength', 'Рукав: длина'),
    Z('bust', 'Грудь'),
    Z('bustDart', 'Нагрудная вытачка / рельеф'),
    Z('back', 'Спинка: ширина, лопатки'),
    Z('front', 'Перед: ширина'),
    Z('bodiceLength', 'Длина лифа до талии'),
    Z('waist', 'Талия'),
    Z('hips', 'Бёдра'),
    Z('side', 'Боковой шов'),
    Z('length', 'Длина изделия'),
    Z('hem', 'Низ'),
  ],
  skirt: [
    Z('waist', 'Талия / пояс'),
    Z('darts', 'Вытачки'),
    Z('hips', 'Бёдра'),
    Z('side', 'Боковой шов'),
    Z('balance', 'Баланс (перекос переда и спинки)'),
    Z('length', 'Длина'),
    Z('hem', 'Низ'),
  ],
  trousers: [
    Z('waist', 'Талия / пояс'),
    Z('darts', 'Вытачки'),
    Z('hips', 'Бёдра'),
    Z('seat', 'Сидение: задний шов'),
    Z('frontRise', 'Передний шов'),
    Z('crotch', 'Шаговый шов, сидение'),
    Z('thigh', 'Бедро'),
    Z('knee', 'Колено'),
    Z('legWidth', 'Ширина низа'),
    Z('length', 'Длина'),
  ],
}

export const OTHER_ZONE: FitZone = Z('other', 'Другое')

export function zonesOf(garment: GarmentKind): FitZone[] {
  return [...FIT_ZONES[garment], OTHER_ZONE]
}

export type FixAction = 'take' | 'add' | 'move' | 'other'

export const FIX_ACTIONS: { id: FixAction; title: string }[] = [
  { id: 'take', title: 'Убрать (ушить)' },
  { id: 'add', title: 'Добавить (выпустить)' },
  { id: 'move', title: 'Сместить' },
  { id: 'other', title: 'Другое' },
]

export interface FitFix {
  id: string
  zone: string
  action: FixAction
  /** How much, mm (always positive: the action gives the direction). */
  amount?: number
  note?: string
}

export type Verdict = 'ok' | 'minor' | 'major'

export const VERDICTS: { id: Verdict; title: string }[] = [
  { id: 'ok', title: 'Села без правок' },
  { id: 'minor', title: 'Мелкие правки (до 1–2 см)' },
  { id: 'major', title: 'Большие правки или перекрой' },
]

/** One fit level of the ease map as the app showed it, and how it actually felt. */
export interface FitLevelCheck {
  id: FitLevelId
  title: string
  /** Ease the map showed, mm. */
  ease: number
  shown: EaseVerdict
  felt?: EaseVerdict
}

export interface FittingEntry {
  id: string
  /** Who sews and who it is for: «Анна, макет 1». */
  title: string
  created: number
  updated: number
  /** Mock-up from a cheap fabric or the finished garment. */
  stage: 'mockup' | 'garment'
  fabric?: string
  /** Snapshot of the pattern. */
  figureName?: string
  measurements: MeasurementSet
  /** Measurements the user took herself; the rest were prefilled from the typical figure. */
  confirmed: string[]
  model: {
    name: string
    block: string
    silhouette: Silhouette
    options: Record<string, number>
    layers: ModelSpec[]
  }
  fitMap: FitLevelCheck[]
  fixes: FitFix[]
  verdict?: Verdict
  /** Minutes spent taking the measurements, if noted. */
  measureMinutes?: number
  /** Where the interface confused her. */
  interfaceNotes?: string
  notes?: string
}

export interface BlockInfo {
  title: string
  garment: GarmentKind
  method: MethodId
}

let blocksInfo: Map<string, BlockInfo> | undefined

export function blockInfo(id: string): BlockInfo | undefined {
  blocksInfo ??= new Map(BLOCKS.map((b) => [b.id, { title: b.title, garment: b.garment, method: b.method }]))
  return blocksInfo.get(id)
}

export function zoneTitle(garment: GarmentKind | undefined, zone: string): string {
  const z = garment ? zonesOf(garment).find((x) => x.id === zone) : undefined
  return z?.title ?? (zone === OTHER_ZONE.id ? OTHER_ZONE.title : zone)
}

/** How the felt fit compares with the map: same verdict, the next one on the scale, or further off. */
export type MapMatch = 'match' | 'near' | 'off'

const SCALE: EaseVerdict[] = ['tight', 'snug', 'fitted', 'loose', 'veryLoose']

export function mapMatch(c: FitLevelCheck): MapMatch | undefined {
  if (!c.felt) return undefined
  const d = Math.abs(SCALE.indexOf(c.felt) - SCALE.indexOf(c.shown))
  return d === 0 ? 'match' : d === 1 ? 'near' : 'off'
}

/** Fixes with a signed amount: + added, − taken in; undefined for moves and other fixes. */
export function signedAmount(f: FitFix): number | undefined {
  if (f.amount === undefined) return undefined
  if (f.action === 'take') return -f.amount
  if (f.action === 'add') return f.amount
  return undefined
}

export interface RepeatedFix {
  block: string
  zone: string
  action: FixAction
  /** Entries with this fix and how many different figures they were sewn for. */
  entries: number
  figures: number
  /** Mean amount, mm, over the fixes that give one. */
  mean?: number
  amounts: number[]
}

/**
 * The same fix (block, zone, direction) across the log, most frequent first.
 * A figure is told apart by its name, or by its height, bust and hips when
 * it has none. Only fixes seen on at least `min` entries are returned.
 */
export function repeatedFixes(entries: FittingEntry[], min = 2): RepeatedFix[] {
  const groups = new Map<string, { block: string; zone: string; action: FixAction; entries: Set<string>; figures: Set<string>; amounts: number[] }>()
  for (const e of entries) {
    const fig = figureKey(e)
    for (const f of e.fixes) {
      const key = `${e.model.block}|${f.zone}|${f.action}`
      let g = groups.get(key)
      if (!g) groups.set(key, (g = { block: e.model.block, zone: f.zone, action: f.action, entries: new Set(), figures: new Set(), amounts: [] }))
      g.entries.add(e.id)
      g.figures.add(fig)
      if (f.amount !== undefined) g.amounts.push(f.amount)
    }
  }
  return [...groups.values()]
    .filter((g) => g.entries.size >= min)
    .map((g) => ({
      block: g.block,
      zone: g.zone,
      action: g.action,
      entries: g.entries.size,
      figures: g.figures.size,
      amounts: g.amounts,
      ...(g.amounts.length ? { mean: g.amounts.reduce((a, b) => a + b, 0) / g.amounts.length } : {}),
    }))
    .sort((a, b) => b.figures - a.figures || b.entries - a.entries)
}

function figureKey(e: FittingEntry): string {
  if (e.figureName?.trim()) return e.figureName.trim().toLowerCase()
  const m = e.measurements
  return `${m.height ?? '?'}-${m.bust ?? '?'}-${m.hips ?? '?'}`
}

// ── Files: the log lives on the sewist's phone and travels as a file ──────

export const FITTING_FILE_FORMAT = 'lecals-fittings'

export interface FittingFile {
  format: typeof FITTING_FILE_FORMAT
  version: 1
  exported: number
  entries: FittingEntry[]
}

export function toFittingFile(entries: FittingEntry[], now = Date.now()): FittingFile {
  return { format: FITTING_FILE_FORMAT, version: 1, exported: now, entries }
}

/** Reads a log file; throws with a message for the user if it is not one. */
export function parseFittingFile(text: string): FittingEntry[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Это не файл журнала: не читается как JSON')
  }
  const f = data as Partial<FittingFile>
  if (!f || f.format !== FITTING_FILE_FORMAT || !Array.isArray(f.entries)) throw new Error('Это не файл журнала примерок')
  if (f.version !== 1) throw new Error(`Файл журнала версии ${String(f.version)} эта версия приложения не читает`)
  return f.entries.filter(isEntry)
}

function isEntry(e: unknown): e is FittingEntry {
  const x = e as Partial<FittingEntry>
  return (
    !!x &&
    typeof x.id === 'string' &&
    typeof x.title === 'string' &&
    typeof x.updated === 'number' &&
    !!x.model &&
    typeof x.model.block === 'string' &&
    typeof x.measurements === 'object' &&
    Array.isArray(x.fixes) &&
    Array.isArray(x.fitMap)
  )
}

/** Merges entries from a file into the log: new ones are added, for the same id the newer one wins. */
export function mergeFittings(own: FittingEntry[], incoming: FittingEntry[]): { entries: FittingEntry[]; added: number; updated: number } {
  const byId = new Map(own.map((e) => [e.id, e]))
  let added = 0
  let updated = 0
  for (const e of incoming) {
    const cur = byId.get(e.id)
    if (!cur) added++
    else if (e.updated > cur.updated) updated++
    else continue
    byId.set(e.id, e)
  }
  return { entries: [...byId.values()].sort((a, b) => b.updated - a.updated), added, updated }
}

// ── Report ────────────────────────────────────────────────────────────────

const cm = (mm: number) => (Math.round(mm) / 10).toLocaleString('ru-RU', { maximumFractionDigits: 1 })
const signedCm = (mm: number) => `${mm > 0 ? '+' : mm < 0 ? '−' : ''}${cm(Math.abs(mm))}`
const day = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

export function fixLine(garment: GarmentKind | undefined, f: FitFix): string {
  const action = FIX_ACTIONS.find((a) => a.id === f.action)?.title.toLowerCase() ?? f.action
  const amount = f.amount !== undefined ? ` ${cm(f.amount)} см` : ''
  const note = f.note?.trim() ? `: ${f.note.trim()}` : ''
  return `${zoneTitle(garment, f.zone)} — ${action}${amount}${note}`
}

const MATCH_TITLE: Record<MapMatch, string> = { match: 'совпало', near: 'почти', off: 'не совпало' }

/** The whole log as Markdown, to send to the developer or keep with the mock-ups. */
export function fittingReport(entries: FittingEntry[], now = Date.now()): string {
  const out: string[] = ['# Журнал примерок', '', `Выгружен ${day(now)}, записей: ${entries.length}.`, '']

  const repeated = repeatedFixes(entries)
  out.push('## Повторяющиеся правки', '')
  if (!repeated.length) out.push('Пока нет: каждая правка встретилась один раз.', '')
  else {
    out.push('Правка, которая повторяется на разных фигурах, скорее всего говорит об ошибке в формулах методики.', '')
    out.push('| Основа | Где | Что | Записей | Фигур | Среднее, см |', '| --- | --- | --- | --- | --- | --- |')
    for (const r of repeated) {
      const b = blockInfo(r.block)
      const action = FIX_ACTIONS.find((a) => a.id === r.action)?.title ?? r.action
      out.push(`| ${b ? `${b.title} · ${METHODS[b.method]}` : r.block} | ${zoneTitle(b?.garment, r.zone)} | ${action} | ${r.entries} | ${r.figures} | ${r.mean !== undefined ? cm(r.mean) : '—'} |`)
    }
    out.push('')
  }

  const checks = entries.flatMap((e) => e.fitMap).filter((c) => c.felt)
  if (checks.length) {
    const n = (m: MapMatch) => checks.filter((c) => mapMatch(c) === m).length
    out.push('## Карта облегания против ощущений', '')
    out.push(`Проверено поясов: ${checks.length}. Совпало: ${n('match')}, почти: ${n('near')}, не совпало: ${n('off')}.`, '')
  }

  for (const e of entries) {
    const b = blockInfo(e.model.block)
    out.push(`## ${e.title || 'Без названия'}`, '')
    out.push(`- ${e.stage === 'mockup' ? 'Макет' : 'Готовое изделие'}${e.fabric?.trim() ? `, ткань: ${e.fabric.trim()}` : ''}; ${day(e.created)}`)
    out.push(`- Модель: «${e.model.name}» — ${b ? `${b.title}, ${METHODS[b.method]}` : e.model.block}, ${SILHOUETTES.find((s) => s.id === e.model.silhouette)?.title.toLowerCase() ?? e.model.silhouette} силуэт`)
    if (e.figureName) out.push(`- Фигура: ${e.figureName}`)
    if (e.verdict) out.push(`- Итог: ${VERDICTS.find((v) => v.id === e.verdict)?.title ?? e.verdict}`)
    if (e.measureMinutes !== undefined) out.push(`- Мерки сняты за ${e.measureMinutes} мин`)
    out.push('')

    out.push('**Правки**', '')
    if (e.fixes.length) for (const f of e.fixes) out.push(`- ${fixLine(b?.garment, f)}`)
    else out.push('- нет')
    out.push('')

    if (e.fitMap.length) {
      out.push('**Карта облегания**', '', '| Пояс | Прибавка, см | Карта | На деле | |', '| --- | --- | --- | --- | --- |')
      for (const c of e.fitMap) {
        const m = mapMatch(c)
        out.push(`| ${c.title} | ${signedCm(c.ease)} | ${EASE_VERDICTS[c.shown].title} | ${c.felt ? EASE_VERDICTS[c.felt].title : '—'} | ${m ? MATCH_TITLE[m] : ''} |`)
      }
      out.push('')
    }

    if (e.interfaceNotes?.trim()) out.push('**Где путалась в интерфейсе**', '', e.interfaceNotes.trim(), '')
    if (e.notes?.trim()) out.push('**Заметки**', '', e.notes.trim(), '')

    const opts = Object.entries(e.model.options)
    const block = BLOCKS.find((x) => x.id === e.model.block)
    if (opts.length && block) {
      const parts = opts
        .map(([id, v]) => {
          const o = block.options.find((x) => x.id === id)
          return o ? `${o.short ?? o.title} ${cm(v)}` : undefined
        })
        .filter(Boolean)
      if (parts.length) out.push(`Изменённые параметры основы, см: ${parts.join(', ')}.`, '')
    }
    const ms = MEASUREMENT_LIST.filter((s) => e.measurements[s.id] !== undefined).map(
      (s) => `${s.short} ${cm(e.measurements[s.id]!)}${e.confirmed.includes(s.id) ? '' : '*'}`,
    )
    if (ms.length) out.push(`Мерки, см: ${ms.join(', ')}. Звёздочка — значение типовой фигуры, а не снятое.`, '')
  }
  return out.join('\n')
}
