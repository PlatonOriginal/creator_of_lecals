import { useEffect, useRef, useState } from 'react'
import {
  BLOCKS,
  EASE_VERDICTS,
  FIX_ACTIONS,
  METHODS,
  VERDICTS,
  blockInfo,
  fitLevels,
  fittingReport,
  fixLine,
  mapMatch,
  mergeFittings,
  parseFittingFile,
  repeatedFixes,
  toFittingFile,
  zoneTitle,
  zonesOf,
  type EaseVerdict,
  type FitFix,
  type FittingEntry,
  type FixAction,
  type MeasurementSet,
  type Verdict,
} from '@lecals/core'
import { CmInput } from './CmInput'
import { draftProfile } from './draftModel'
import type { Figure } from './figureStore'
import { deleteFitting, listFittings, newId, putFitting, type ModelDoc } from './library'

const GUIDE_URL = 'https://github.com/PlatonOriginal/creator_of_lecals/blob/main/docs/m5-sewist-guide.md'

const day = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
const cm = (mm: number) => (Math.round(mm) / 10).toLocaleString('ru-RU', { maximumFractionDigits: 1 })
const signedCm = (mm: number) => `${mm > 0 ? '+' : mm < 0 ? '−' : ''}${cm(Math.abs(mm))}`
const MATCH: Record<string, string> = { match: '✓ совпало', near: '≈ почти', off: '✗ не совпало' }

function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** A log entry for the model open now: snapshot of the measurements, the model and the ease map it gives. */
function newEntry(model: ModelDoc, figure: Figure, count: number): FittingEntry {
  const drafted = draftProfile(model, figure.values)
  const block = BLOCKS.find((b) => b.id === model.block) ?? BLOCKS[0]!
  // The measurements the pattern was drafted with: the block's own, taken or typical, plus anything else she took.
  const measurements: MeasurementSet = { ...figure.values }
  if (drafted) for (const id of block.required) measurements[id] = drafted.m[id]
  const now = Date.now()
  return {
    id: newId(),
    title: `Макет ${count + 1}: ${model.name}`,
    created: now,
    updated: now,
    stage: 'mockup',
    measurements,
    confirmed: [...figure.confirmed],
    model: { name: model.name, block: model.block, silhouette: model.silhouette, options: { ...model.options }, layers: model.layers },
    fitMap: drafted ? fitLevels(drafted.profile, drafted.m).map((l) => ({ id: l.id, title: l.title, ease: l.ease, shown: l.verdict })) : [],
    fixes: [],
  }
}

/**
 * Stage M5: the log of mock-ups. For each one the sewist notes what she had
 * to change and how the fit felt against the ease map; the log goes to the
 * developer as a file or a report.
 */
export function FittingsPage({ figure, model }: { figure: Figure; model: ModelDoc }) {
  const [entries, setEntries] = useState<FittingEntry[]>([])
  const [openId, setOpenId] = useState<string>()
  const [status, setStatus] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const reload = () =>
    listFittings()
      .then(setEntries)
      .catch((e: Error) => setStatus(`Журнал недоступен в этом браузере: ${e.message}`))
  useEffect(() => {
    void reload()
  }, [])

  const open = entries.find((e) => e.id === openId)

  // Edits are saved at once: the sewist may close the tab in the middle of a fitting.
  function update(e: FittingEntry) {
    const next = { ...e, updated: Date.now() }
    setEntries((l) => l.map((x) => (x.id === e.id ? next : x)))
    putFitting(next).catch((err: Error) => setStatus(`Не удалось сохранить: ${err.message}`))
  }

  async function create() {
    const e = newEntry(model, figure, entries.length)
    try {
      await putFitting(e)
      setEntries((l) => [e, ...l])
      setOpenId(e.id)
      setStatus('')
    } catch (err) {
      setStatus(`Не удалось сохранить: ${(err as Error).message}`)
    }
  }

  async function remove(e: FittingEntry) {
    if (!window.confirm(`Удалить запись «${e.title}»?`)) return
    await deleteFitting(e.id)
    if (openId === e.id) setOpenId(undefined)
    await reload()
  }

  async function importFile(file: File) {
    try {
      const incoming = parseFittingFile(await file.text())
      const merged = mergeFittings(entries, incoming)
      for (const e of merged.entries) if (incoming.includes(e)) await putFitting(e)
      setEntries(merged.entries)
      setStatus(`Из файла: новых записей ${merged.added}, обновлено ${merged.updated}.`)
    } catch (err) {
      setStatus((err as Error).message)
    }
  }

  const stamp = new Date().toISOString().slice(0, 10)
  const repeated = repeatedFixes(entries)
  const block = BLOCKS.find((b) => b.id === model.block)

  return (
    <section className="page library fittings">
      <div className="panel">
        <h2>Журнал примерок</h2>
        <p className="hint">
          Для каждого макета записывайте, что пришлось исправить: где и на сколько сантиметров. Запись сохраняет мерки,
          модель и карту облегания на момент создания, поэтому её можно заполнять и после примерки. Порядок работы —
          в <a href={GUIDE_URL} target="_blank" rel="noreferrer">инструкции для швеи</a>.
        </p>
        <div className="buttons">
          <button onClick={() => void create()}>Новая запись по текущей модели</button>
        </div>
        <p className="hint">
          Сейчас открыта «{model.name}»{block ? ` (${block.title}, ${METHODS[block.method]})` : ''}. Другую модель откройте
          в «Библиотеке», затем вернитесь сюда.
        </p>
        <ul className="lib">
          {entries.map((e) => {
            const b = blockInfo(e.model.block)
            return (
              <li key={e.id} className={e.id === openId ? 'current' : ''}>
                <div>
                  <b>{e.title}</b>
                  <span className="hint">
                    {' '}
                    {b ? `${b.title} · ${METHODS[b.method]}` : e.model.block} · правок: {e.fixes.length}
                    {e.verdict ? ` · ${VERDICTS.find((v) => v.id === e.verdict)?.title.toLowerCase()}` : ''} · {day(e.updated)}
                  </span>
                </div>
                <div className="row-buttons">
                  <button onClick={() => setOpenId(e.id === openId ? undefined : e.id)}>{e.id === openId ? 'Свернуть' : 'Открыть'}</button>
                  <button className="secondary" onClick={() => void remove(e)}>
                    Удалить
                  </button>
                </div>
              </li>
            )
          })}
          {!entries.length && <li className="hint">Пока нет записей.</li>}
        </ul>

        <h3>Отправить разработчику</h3>
        <p className="hint">
          Журнал хранится только на этом устройстве. Отчёт — текст для чтения, файл журнала — данные, которые можно
          загрузить в приложение на другом устройстве.
        </p>
        <div className="buttons">
          <button className="secondary" disabled={!entries.length} onClick={() => download(fittingReport(entries), `журнал-примерок-${stamp}.md`, 'text/markdown')}>
            Скачать отчёт
          </button>
          <button
            className="secondary"
            disabled={!entries.length}
            onClick={() => download(JSON.stringify(toFittingFile(entries), null, 1), `журнал-примерок-${stamp}.json`, 'application/json')}
          >
            Скачать файл журнала
          </button>
          <button className="secondary" onClick={() => fileRef.current?.click()}>
            Загрузить файл журнала
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void importFile(f)
            }}
          />
        </div>
        {status && <p className="status">{status}</p>}

        {repeated.length > 0 && (
          <>
            <h3>Повторяющиеся правки</h3>
            <p className="hint">Правка, которая повторяется на разных фигурах, скорее всего говорит об ошибке в формулах.</p>
            <ul className="lib">
              {repeated.map((r) => {
                const b = blockInfo(r.block)
                return (
                  <li key={`${r.block}-${r.zone}-${r.action}`}>
                    <div>
                      <b>
                        {zoneTitle(b?.garment, r.zone)} — {FIX_ACTIONS.find((a) => a.id === r.action)?.title.toLowerCase()}
                        {r.mean !== undefined ? `, в среднем ${cm(r.mean)} см` : ''}
                      </b>
                      <span className="hint">
                        {' '}
                        {b ? `${b.title} · ${METHODS[b.method]}` : r.block} · записей {r.entries}, фигур {r.figures}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      {open && <EntryEditor key={open.id} entry={open} onChange={update} />}
    </section>
  )
}

function EntryEditor({ entry: e, onChange }: { entry: FittingEntry; onChange: (e: FittingEntry) => void }) {
  const b = blockInfo(e.model.block)
  const zones = b ? zonesOf(b.garment) : zonesOf('dress')
  const set = (patch: Partial<FittingEntry>) => onChange({ ...e, ...patch })
  const setFix = (f: FitFix) => set({ fixes: e.fixes.map((x) => (x.id === f.id ? f : x)) })
  const [zone, setZone] = useState(zones[0]!.id)

  return (
    <div className="panel">
      <h2>{e.title || 'Запись'}</h2>
      <p className="hint">
        Модель «{e.model.name}»{b ? `: ${b.title}, ${METHODS[b.method]}` : ''}. Создана {day(e.created)}
      </p>
      <label className="field">
        <span>Название</span>
        <input className="text" value={e.title} onChange={(x) => set({ title: x.target.value })} />
      </label>
      <label className="field">
        <span>Для кого (фигура)</span>
        <input className="text" placeholder="Например, Анна" value={e.figureName ?? ''} onChange={(x) => set({ figureName: x.target.value })} />
      </label>
      <label className="field">
        <span>Что шили</span>
        <select value={e.stage} onChange={(x) => set({ stage: x.target.value as FittingEntry['stage'] })}>
          <option value="mockup">Макет</option>
          <option value="garment">Готовое изделие</option>
        </select>
      </label>
      <label className="field">
        <span>Ткань</span>
        <input className="text" placeholder="Бязь, хлопок…" value={e.fabric ?? ''} onChange={(x) => set({ fabric: x.target.value })} />
      </label>
      <label className="field">
        <span>Мерки сняты за, мин</span>
        <input
          inputMode="numeric"
          value={e.measureMinutes ?? ''}
          onChange={(x) => {
            const v = parseInt(x.target.value, 10)
            set({ measureMinutes: Number.isFinite(v) && v >= 0 ? v : undefined })
          }}
        />
      </label>

      <h3>Правки</h3>
      <p className="hint">Для ширины пишите, на сколько изменился весь обхват изделия; для длины и смещений — величину как есть.</p>
      <ul className="lib fixes">
        {e.fixes.map((f) => (
          <li key={f.id}>
            <label className="field">
              <span>Где</span>
              <select value={f.zone} onChange={(x) => setFix({ ...f, zone: x.target.value })}>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Что сделали</span>
              <select value={f.action} onChange={(x) => setFix({ ...f, action: x.target.value as FixAction })}>
                {FIX_ACTIONS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>На сколько, см</span>
              <CmInput label="На сколько" value={f.amount} onChange={(mm) => setFix(mm === undefined ? { ...f, amount: undefined } : { ...f, amount: mm })} />
            </label>
            <label className="field">
              <span>Подробнее</span>
              <input className="text" placeholder="Например, по боковому шву" value={f.note ?? ''} onChange={(x) => setFix({ ...f, note: x.target.value })} />
            </label>
            <div className="row-buttons">
              <span className="hint">{fixLine(b?.garment, f)}</span>
              <button className="secondary" onClick={() => set({ fixes: e.fixes.filter((x) => x.id !== f.id) })}>
                Убрать правку
              </button>
            </div>
          </li>
        ))}
        {!e.fixes.length && <li className="hint">Правок нет. Если вещь села без правок, так и отметьте в итоге.</li>}
      </ul>
      <label className="field">
        <span>Новая правка</span>
        <select value={zone} onChange={(x) => setZone(x.target.value)}>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.title}
            </option>
          ))}
        </select>
      </label>
      <div className="buttons">
        <button onClick={() => set({ fixes: [...e.fixes, { id: newId(), zone, action: 'take' }] })}>Добавить правку</button>
      </div>

      {e.fitMap.length > 0 && (
        <>
          <h3>Карта облегания против ощущений</h3>
          <p className="hint">
            Что показывала карта на манекене и как макет сидит на самом деле. Прибавка — разница между изделием и телом.
          </p>
          <table className="calc fitcheck">
            <tbody>
              {e.fitMap.map((c, i) => {
                const m = mapMatch(c)
                return (
                  <tr key={c.id}>
                    <th>{c.title}</th>
                    <td>
                      {signedCm(c.ease)} см, {EASE_VERDICTS[c.shown].title}
                    </td>
                    <td>
                      <select
                        aria-label={`${c.title}: на деле`}
                        value={c.felt ?? ''}
                        onChange={(x) =>
                          set({
                            fitMap: e.fitMap.map((y, j) => {
                              if (j !== i) return y
                              const felt = x.target.value as EaseVerdict | ''
                              const rest = { ...y }
                              delete rest.felt
                              return felt ? { ...rest, felt } : rest
                            }),
                          })
                        }
                      >
                        <option value="">на деле…</option>
                        {(Object.keys(EASE_VERDICTS) as EaseVerdict[]).map((v) => (
                          <option key={v} value={v}>
                            {EASE_VERDICTS[v].title}
                          </option>
                        ))}
                      </select>
                      {m && <div className={`match is-${m}`}>{MATCH[m]}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      <h3>Итог</h3>
      <label className="field">
        <span>Посадка</span>
        <select value={e.verdict ?? ''} onChange={(x) => set({ verdict: (x.target.value || undefined) as Verdict | undefined })}>
          <option value="">не отмечено</option>
          {VERDICTS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </select>
      </label>
      <label className="area">
        <span>Где путалась в приложении</span>
        <textarea
          rows={3}
          placeholder="Что было непонятно, что искала и не нашла"
          value={e.interfaceNotes ?? ''}
          onChange={(x) => set({ interfaceNotes: x.target.value })}
        />
      </label>
      <label className="area">
        <span>Заметки</span>
        <textarea rows={3} value={e.notes ?? ''} onChange={(x) => set({ notes: x.target.value })} />
      </label>
    </div>
  )
}
