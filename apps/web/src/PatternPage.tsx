import { useEffect, useMemo, useState } from 'react'
import {
  BLOCKS,
  MALE_BLOCKS,
  MEASUREMENTS,
  METHODS,
  SAMPLE_MEASUREMENTS,
  SILHOUETTES,
  applyLayers,
  cutPiece,
  formatCm,
  netPiece,
  prefill,
  validateMeasurements,
  type BlockDef,
  type MeasurementId,
  type MethodId,
  type Measurements,
  type ModelSpec,
  type Silhouette,
} from '@lecals/core'
import { CmInput } from './CmInput'
import type { Figure } from './figureStore'
import { ModelForm } from './ModelForm'
import { putModel, newId, type ModelDoc } from './library'
import { emptyModel, lastLayer, withLastLayer } from './modelStore'
import { piecesToSvg } from '@lecals/export/svg'
import { ZoomView } from './ZoomView'
import type { PaperSize } from '@lecals/export/pdf'
import {
  ALL_BLOCKS,
  MALE_MEASUREMENT_META,
  blocksForGender,
  buildMaleMeasurements,
  isMaleBlockId,
  type GenderMode,
} from './maleUi'
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

const cm = (mm: number) => (Math.round(mm) / 10).toLocaleString('ru-RU', { maximumFractionDigits: 1 })

export function PatternPage({
  figure,
  onChange,
  model,
  onModelChange,
  gender = 'female',
  onGenderChange,
}: {
  figure: Figure
  onChange: (f: Figure) => void
  model: ModelDoc
  onModelChange: (m: ModelDoc) => void
  gender?: GenderMode
  onGenderChange?: (g: GenderMode) => void
}) {
  const setModel = (m: ModelDoc) => onModelChange({ ...m, updated: Date.now() })
  const availableBlocks = blocksForGender(gender)
  const block: BlockDef =
    availableBlocks.find((b) => b.id === model.block) ??
    ALL_BLOCKS.find((b) => b.id === model.block) ??
    availableBlocks[0]!

  useEffect(() => {
    if (!availableBlocks.some((b) => b.id === block.id)) {
      const next = availableBlocks[0]!
      setModel({ ...model, block: next.id, options: {}, layers: [{}] })
    }
  }, [gender])

  const options = { ...block.defaults(model.silhouette), ...model.options }
  const allow = model.allowances
  const male = gender === 'male' || isMaleBlockId(block.id)

  const filled = prefill(figure.values)
  const maleBuilt = useMemo(() => buildMaleMeasurements(figure.values), [figure.values])
  const m = useMemo(() => {
    if (male) {
      return Object.fromEntries(
        block.required.map((id) => [id, (maleBuilt as Record<string, number>)[id] ?? 0]),
      ) as unknown as Measurements
    }
    return Object.fromEntries(
      block.required.map((id) => [id, figure.values[id] ?? filled[id] ?? SAMPLE_MEASUREMENTS[id]]),
    ) as Measurements
  }, [male, block.required, maleBuilt, figure.values, filled])

  const typicalIds = block.required.filter((id) => (figure.values as Record<string, number | undefined>)[id] === undefined)
  const key = JSON.stringify([block.id, block.required.map((id) => (m as Record<string, number>)[id]), options, model.layers, allow, model.name, male])

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const issues = male ? [] : validateMeasurements(m, { required: block.required, plausibility: false })
  const errors = issues.filter((i) => i.level === 'error').map((i) => i.message)

  const drafted = useMemo(() => {
    if (errors.length) return undefined
    const t = performance.now()
    const result = block.draft(m as never, options)
    const modelled = applyLayers(block, result, model.layers, m as never)
    const info = { model: model.name, figure: figureLine(m as Record<string, number | undefined>) }
    const pieces = modelled.panels.map((p) => (allow.on ? cutPiece(p, allow, info) : netPiece(p)))
    return { result, modelled, pieces, svg: piecesToSvg(pieces, 20, 5, 1.6), ms: performance.now() - t }
  }, [key])

  function setValue(id: MeasurementId, v: number | undefined) {
    const values = { ...figure.values } as Record<string, number | undefined>
    if (v === undefined) delete values[id]
    else values[id] = v
    onChange({ ...figure, values: values as Figure['values'] })
  }

  async function makePdf(paperName: 'A4' | 'A0') {
    if (!drafted) return
    setBusy(true)
    setStatus('Готовлю PDF…')
    try {
      const t = performance.now()
      const { piecesToPdf, A4, A0 } = await import('@lecals/export/pdf')
      const paper: PaperSize = paperName === 'A4' ? A4 : A0
      const res = await piecesToPdf(drafted.pieces, {
        fontBytes: await loadFont(),
        paper,
        title: `${model.name} · ${block.title} · ${METHODS[block.method]}`,
      })
      download(res.bytes, `${fileName(model.name)}-${paper.name}.pdf`)
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

  async function save(kind: 'base' | 'model') {
    try {
      const doc: ModelDoc =
        kind === 'model'
          ? { ...model, gender, kind: model.layers.some(hasSteps) ? 'model' : 'base' }
          : { ...model, id: newId(), gender, kind: 'base', name: `${model.name} (основа)` }
      await putModel({ ...doc, updated: Date.now() })
      if (kind === 'model') setModel(doc)
      setStatus(`Сохранено в библиотеку: «${doc.name}»`)
    } catch (e) {
      setStatus(`Не удалось сохранить: ${(e as Error).message}`)
    }
  }

  const garmentChanges = (id: string) => ALL_BLOCKS.find((b) => b.id === id)?.garment !== block.garment
  const own = lastLayer(model)
  const methodsForGender = Array.from(new Set(availableBlocks.map((b) => b.method))) as MethodId[]

  return (
    <section className="page pattern">
      <div className="panel">
        <h2>Модель</h2>
        <label className="field">
          <span>Название</span>
          <input className="text" value={model.name} onChange={(e) => setModel({ ...model, name: e.target.value })} />
        </label>
        {onGenderChange && (
          <label className="field">
            <span>Режим</span>
            <select
              value={gender}
              onChange={(e) => {
                const nextGender = e.target.value as GenderMode
                onGenderChange(nextGender)
                const pool = blocksForGender(nextGender)
                const nextBlock = pool[0] ?? BLOCKS[0] ?? MALE_BLOCKS[0]!
                setModel({ ...model, gender: nextGender, block: nextBlock.id, options: {}, layers: [{}] })
              }}
            >
              <option value="female">Женский</option>
              <option value="male">Мужской</option>
            </select>
          </label>
        )}
        {model.baseName && <p className="hint">Построена на модели «{model.baseName}»: её приёмы уже применены, ниже — свои.</p>}
        <label className="field">
          <span>Методика</span>
          <select
            value={block.method}
            disabled={model.layers.length > 1}
            onChange={(e) => {
              const method = e.target.value as MethodId
              const next =
                availableBlocks.find((b) => b.method === method && b.garment === block.garment) ??
                availableBlocks.find((b) => b.method === method) ??
                availableBlocks[0]!
              setModel({ ...model, block: next.id, options: {}, ...(garmentChanges(next.id) ? { layers: [{}] } : {}) })
            }}
          >
            {methodsForGender.map((mId) => (
              <option key={mId} value={mId}>
                {METHODS[mId]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Изделие</span>
          <select
            value={block.id}
            disabled={model.layers.length > 1}
            onChange={(e) =>
              setModel({ ...model, block: e.target.value, options: {}, ...(garmentChanges(e.target.value) ? { layers: [{}] } : {}) })
            }
          >
            {availableBlocks
              .filter((b) => b.method === block.method)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
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

        <details>
          <summary>Прибавки и параметры основы</summary>
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
        </details>

        <h3>Моделирование</h3>
        <ModelForm
          garment={block.garment}
          spec={own}
          onChange={(spec) => setModel(withLastLayer(model, spec))}
          gender={gender}
        />
        {model.layers.some(hasSteps) && (
          <button className="link" onClick={() => setModel(withLastLayer(model, {}))}>
            Сбросить приёмы
          </button>
        )}

        <h3>Припуски</h3>
        <label className="field">
          <span>Печатать с припусками</span>
          <input type="checkbox" checked={allow.on} onChange={(e) => setModel({ ...model, allowances: { ...allow, on: e.target.checked } })} />
        </label>
        {allow.on && (
          <>
            <label className="field">
              <span>На швы</span>
              <CmInput label="Припуск на швы" value={allow.seam} onChange={(v) => setModel({ ...model, allowances: { ...allow, seam: v ?? 0 } })} />
            </label>
            <label className="field">
              <span>На подгибку низа</span>
              <CmInput label="Припуск на подгибку" value={allow.hem} onChange={(v) => setModel({ ...model, allowances: { ...allow, hem: v ?? 0 } })} />
            </label>
            {block.garment === 'dress' && (
              <label className="field">
                <span>По горловине</span>
                <CmInput
                  label="Припуск по горловине"
                  value={allow.byEdge?.neck}
                  onChange={(v) => {
                    const byEdge = { ...allow.byEdge }
                    if (v === undefined) delete byEdge.neck
                    else byEdge.neck = v
                    setModel({ ...model, allowances: { ...allow, byEdge } })
                  }}
                />
              </label>
            )}
          </>
        )}

        <h3>Мерки</h3>
        {typicalIds.length > 0 && (
          <p className="hint">
            Серым — типовые значения, их нет в ваших мерках. Снимите их во вкладке «Мерки» или поправьте здесь.
          </p>
        )}
        <details open={typicalIds.length > 0}>
          <summary>Мерки для этой основы ({block.required.length})</summary>
          {block.required.map((id) => {
            const maleMeta = MALE_MEASUREMENT_META[id as keyof typeof MALE_MEASUREMENT_META]
            const femaleMeta = MEASUREMENTS[id as MeasurementId]
            const title = maleMeta?.title ?? femaleMeta?.title ?? id
            const short = maleMeta?.short ?? femaleMeta?.short ?? id
            const val = (m as Record<string, number>)[id]
            return (
              <label key={id} className={typicalIds.includes(id) ? 'field typical' : 'field'}>
                <span>
                  {title} ({short})
                </span>
                <CmInput label={title} value={val} onChange={(v) => setValue(id as MeasurementId, v)} />
              </label>
            )
          })}
        </details>
        {errors.length > 0 && (
          <ul className="errors">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        {drafted && (
          <>
            {[...drafted.result.warnings, ...drafted.modelled.warnings].length > 0 && (
              <ul className="errors">
                {[...drafted.result.warnings, ...drafted.modelled.warnings].map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <h3>Проверка срезов</h3>
            <dl className="stats">
              {(model.layers.some(hasSteps) ? drafted.modelled.checks : drafted.result.checks).map((c) => (
                <div key={c.id} className="contents">
                  <dt>{c.title}</dt>
                  <dd className={c.ok ? '' : 'bad'}>
                    {c.ok ? '✓' : '✗'} {cm(c.a)} / {cm(c.b)}
                  </dd>
                </div>
              ))}
            </dl>
            <details>
              <summary>Расчёт основы по формулам</summary>
              <table className="calc">
                <tbody>
                  {drafted.result.steps.map((s) => (
                    <tr key={s.id}>
                      <th>{s.id}</th>
                      <td>{s.formula}</td>
                      <td>{s.unit === '°' ? `${s.value.toFixed(1).replace('.', ',')}°` : formatCm(s.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
            <p className="hint">
              Построение: {drafted.ms.toFixed(0)} мс.{' '}
              {allow.on ? 'Сплошная линия — линия кроя, пунктир — линия шва.' : 'Детали без припусков: добавьте их при раскрое.'}
            </p>
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
        <div className="buttons">
          <button onClick={() => save('model')} className="secondary">
            Сохранить в библиотеку
          </button>
          <button onClick={() => save('base')} className="secondary">
            Сохранить как свою основу
          </button>
          <button onClick={() => setModel(emptyModel(block.id))} className="secondary">
            Новая модель
          </button>
        </div>
        {status && <p className="status">{status}</p>}
        <p className="hint">
          Печатайте в масштабе 100 % («Фактический размер»). На первом листе контрольный квадрат 10 × 10 см: если он
          другого размера, масштаб печати неверный. Листы A4 склеиваются по меткам: буква — ряд, цифра — столбец.
        </p>
      </div>
      <ZoomView
        svg={drafted?.svg ?? ''}
        banner={
          drafted && drafted.modelled.warnings.length > 0 ? (
            <ul className="errors banner">
              {drafted.modelled.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : undefined
        }
      />
    </section>
  )
}

/** Does a layer change anything? */
export function hasSteps(s: ModelSpec): boolean {
  const any = (o: object | undefined) => !!o && Object.values(o).some((v) => typeof v === 'number' && v !== 0)
  const nk = s.neckline
  return !!(
    s.frontDart ||
    s.backDart ||
    s.princess?.front ||
    s.princess?.back ||
    (nk && (nk.shape !== 'round' || any(nk))) ||
    s.length ||
    any(s.flare) ||
    any(s.sleeve)
  )
}

function figureLine(m: Partial<Measurements & Record<string, number>>): string {
  const chest = m.bust ?? m.chest3
  const p = [
    m.height && `рост ${cm(m.height)}`,
    chest && `Ог ${cm(chest)}`,
    m.waist && `От ${cm(m.waist)}`,
    m.hips && `Об ${cm(m.hips)}`,
  ]
  return p.filter(Boolean).join(', ')
}

function fileName(s: string): string {
  return s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'model'
}
