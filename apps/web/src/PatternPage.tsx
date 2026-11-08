import { useEffect, useMemo, useState } from 'react'
import {
  BLOCKS,
  MEASUREMENTS,
  METHODS,
  SAMPLE_MEASUREMENTS,
  SILHOUETTES,
  formatCm,
  prefill,
  validateMeasurements,
  type BlockDef,
  type MeasurementId,
  type Measurements,
  type Silhouette,
} from '@lecals/core'
import { CmInput } from './CmInput'
import type { Figure } from './figureStore'
import { piecesToSvg } from '@lecals/export/svg'
import type { PaperSize } from '@lecals/export/pdf'
import fontUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url'

let fontBytes: Promise<ArrayBuffer> | undefined
function loadFont() {
  fontBytes ??= fetch(fontUrl).then((r) => r.arrayBuffer())
  return fontBytes
}

function download(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** The model being drafted: block, silhouette and option overrides. Kept between visits. */
interface Model {
  block: string
  silhouette: Silhouette
  options: Record<string, number>
}

const MODEL_KEY = 'lecals.model.v1'

function loadModel(): Model {
  try {
    const m = JSON.parse(localStorage.getItem(MODEL_KEY) ?? '') as Model
    if (BLOCKS.some((b) => b.id === m.block)) return { block: m.block, silhouette: m.silhouette ?? 'semi', options: m.options ?? {} }
  } catch {
    // Nothing stored yet or storage blocked.
  }
  return { block: BLOCKS[0]!.id, silhouette: 'semi', options: {} }
}

const cm = (mm: number) => (Math.round(mm) / 10).toLocaleString('ru-RU', { maximumFractionDigits: 1 })

export function PatternPage({ figure, onChange }: { figure: Figure; onChange: (f: Figure) => void }) {
  const [model, setModel] = useState(loadModel)
  useEffect(() => {
    try {
      localStorage.setItem(MODEL_KEY, JSON.stringify(model))
    } catch {
      // Storage blocked: the model lives until the tab closes.
    }
  }, [model])
  const block: BlockDef = BLOCKS.find((b) => b.id === model.block) ?? BLOCKS[0]!
  const options = { ...block.defaults(model.silhouette), ...model.options }

  // The user's measurements; gaps are prefilled from the typical figure (or the sample one).
  const filled = prefill(figure.values)
  const m = Object.fromEntries(
    block.required.map((id) => [id, figure.values[id] ?? filled[id] ?? SAMPLE_MEASUREMENTS[id]]),
  ) as Measurements
  const typicalIds = block.required.filter((id) => figure.values[id] === undefined)
  const key = JSON.stringify([block.id, block.required.map((id) => m[id]), options])

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const issues = validateMeasurements(m, { required: block.required, plausibility: false })
  const errors = issues.filter((i) => i.level === 'error').map((i) => i.message)

  const drafted = useMemo(() => {
    if (errors.length) return undefined
    const t = performance.now()
    const result = block.draft(m, options)
    return { result, svg: piecesToSvg(result.pieces), ms: performance.now() - t }
    // `key` lists every value the draft uses.
  }, [key])

  function setValue(id: MeasurementId, v: number | undefined) {
    const values = { ...figure.values }
    if (v === undefined) delete values[id]
    else values[id] = v
    onChange({ ...figure, values })
  }

  async function makePdf(paperName: 'A4' | 'A0') {
    if (!drafted) return
    setBusy(true)
    setStatus('Готовлю PDF…')
    try {
      const t = performance.now()
      // PDF code (pdf-lib, fonts) is loaded only when needed.
      const { piecesToPdf, A4, A0 } = await import('@lecals/export/pdf')
      const paper: PaperSize = paperName === 'A4' ? A4 : A0
      const res = await piecesToPdf(drafted.result.pieces, {
        fontBytes: await loadFont(),
        paper,
        title: `${block.title} · ${METHODS[block.method]}`,
      })
      download(res.bytes, `${block.id}-${paper.name}.pdf`)
      setStatus(
        `${paper.name}: ${res.pages} ${res.pages === 1 ? 'лист' : 'листов'} (${res.cols} × ${res.rows}), ` +
          `${Math.round(res.bytes.length / 1024)} КБ, ${Math.round(performance.now() - t)} мс`,
      )
    } catch (e) {
      setStatus(`Ошибка: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="page pattern">
      <div className="panel">
        <h2>Основа</h2>
        <label className="field">
          <span>Изделие и методика</span>
          <select value={block.id} onChange={(e) => setModel({ ...model, block: e.target.value, options: {} })}>
            {BLOCKS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} · {METHODS[b.method]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Силуэт</span>
          <select
            value={model.silhouette}
            onChange={(e) => setModel({ ...model, silhouette: e.target.value as Silhouette, options: {} })}
          >
            {SILHOUETTES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>

        <h3>Прибавки и параметры</h3>
        {block.options.map((o) => (
          <label key={o.id} className="field" title={o.hint}>
            <span>
              {o.title}
              {o.short ? ` (${o.short})` : ''}
            </span>
            <CmInput
              label={o.title}
              value={options[o.id]}
              onChange={(v) => {
                const opts = { ...model.options }
                if (v === undefined) delete opts[o.id]
                else opts[o.id] = Math.min(o.max, Math.max(o.min, v))
                setModel({ ...model, options: opts })
              }}
            />
          </label>
        ))}

        <h3>Мерки</h3>
        {typicalIds.length > 0 && (
          <p className="hint">
            Серым — типовые значения, их нет в ваших мерках. Снимите их во вкладке «Мерки» или поправьте здесь.
          </p>
        )}
        {block.required.map((id) => (
          <label key={id} className={typicalIds.includes(id) ? 'field typical' : 'field'}>
            <span>
              {MEASUREMENTS[id].title} ({MEASUREMENTS[id].short})
            </span>
            <CmInput label={MEASUREMENTS[id].title} value={m[id]} onChange={(v) => setValue(id, v)} />
          </label>
        ))}
        {errors.length > 0 && (
          <ul className="errors">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        {drafted && (
          <>
            {drafted.result.warnings.length > 0 && (
              <ul className="errors">
                {drafted.result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <h3>Проверка срезов</h3>
            <dl className="stats">
              {drafted.result.checks.map((c) => (
                <div key={c.id} className="contents">
                  <dt>{c.title}</dt>
                  <dd className={c.ok ? '' : 'bad'}>
                    {c.ok ? '✓' : '✗'} {cm(c.a)} / {cm(c.b)}
                  </dd>
                </div>
              ))}
            </dl>
            <details>
              <summary>Расчёт по формулам</summary>
              <table className="calc">
                <tbody>
                  {drafted.result.steps.map((s) => (
                    <tr key={s.id}>
                      <th>{s.id}</th>
                      <td>{s.formula}</td>
                      <td>{formatCm(s.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
            <p className="hint">Построение: {drafted.ms.toFixed(1)} мс. Детали без припусков на швы: добавьте их при раскрое.</p>
          </>
        )}
        <div className="buttons">
          <button disabled={!drafted || busy} onClick={() => makePdf('A4')}>
            PDF на листах A4
          </button>
          <button disabled={!drafted || busy} onClick={() => makePdf('A0')} className="secondary">
            PDF на A0
          </button>
        </div>
        {status && <p className="status">{status}</p>}
        <p className="hint">
          Печатайте в масштабе 100 % («Фактический размер»). На первом листе контрольный квадрат 10 × 10 см: если он
          другого размера, масштаб печати неверный.
        </p>
      </div>
      <div className="preview" dangerouslySetInnerHTML={{ __html: drafted?.svg ?? '' }} />
    </section>
  )
}
