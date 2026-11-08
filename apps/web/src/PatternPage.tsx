import { useMemo, useState } from 'react'
import {
  MEASUREMENTS,
  type MeasurementId,
  type Measurements,
  SAMPLE_MEASUREMENTS,
  draftTestPanel,
  validateMeasurements,
} from '@lecals/core'
import { pieceToSvg } from '@lecals/export/svg'
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

export function PatternPage() {
  const [m, setM] = useState<Measurements>(SAMPLE_MEASUREMENTS)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const errors = validateMeasurements(m)

  const drafted = useMemo(() => {
    if (validateMeasurements(m).length) return undefined
    const t = performance.now()
    const piece = draftTestPanel(m)
    return { piece, svg: pieceToSvg(piece), ms: performance.now() - t }
  }, [m])

  async function makePdf(paperName: 'A4' | 'A0') {
    if (!drafted) return
    setBusy(true)
    setStatus('Готовлю PDF…')
    try {
      const t = performance.now()
      // PDF code (pdf-lib, fonts) is loaded only when needed.
      const { piecesToPdf, A4, A0 } = await import('@lecals/export/pdf')
      const paper: PaperSize = paperName === 'A4' ? A4 : A0
      const res = await piecesToPdf([drafted.piece], {
        fontBytes: await loadFont(),
        paper,
        title: drafted.piece.title,
      })
      download(res.bytes, `test-panel-${paper.name}.pdf`)
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
        <h2>Мерки</h2>
        <p className="hint">Тестовая деталь, а не методика: проверяем чертёжный движок и печать.</p>
        {(Object.keys(MEASUREMENTS) as MeasurementId[]).map((id) => (
          <label key={id} className="field">
            <span>{MEASUREMENTS[id].title}</span>
            <span className="input">
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={m[id] / 10}
                onChange={(e) => setM({ ...m, [id]: Math.round(Number(e.target.value) * 10) })}
              />
              см
            </span>
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
          <dl className="stats">
            <dt>Ширина вытачки</dt>
            <dd>{(drafted.piece.seams.dartWidth! / 10).toFixed(1)} см</dd>
            <dt>Длина бокового среза</dt>
            <dd>{(drafted.piece.seams.side! / 10).toFixed(1)} см</dd>
            <dt>Построение</dt>
            <dd>{drafted.ms.toFixed(1)} мс</dd>
          </dl>
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
