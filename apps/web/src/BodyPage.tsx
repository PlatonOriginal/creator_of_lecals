import { useEffect, useRef, useState } from 'react'
import {
  type AnnyBody,
  type BodyMeasures,
  type FitResult,
  type FitTarget,
  type LocalChanges,
  type Phenotypes,
  FEMALE_BASE,
  fitBody,
  measureBody,
  loadAnnyBody,
} from '@lecals/body'
import { formatCm } from '@lecals/core'
import { type BodyViewer, createBodyViewer } from '@lecals/viewer'
import { CmInput } from './CmInput'
import type { Figure } from './figureStore'

const PHENOTYPE_SLIDERS: { id: keyof Phenotypes; title: string }[] = [
  { id: 'height', title: 'Рост' },
  { id: 'weight', title: 'Вес' },
  { id: 'muscle', title: 'Мышцы' },
  { id: 'proportions', title: 'Пропорции' },
  { id: 'cupsize', title: 'Грудь (объём)' },
  { id: 'age', title: 'Возраст' },
  { id: 'gender', title: 'Пол (м — ж)' },
]

const LOCAL_SLIDERS: { id: string; title: string }[] = [
  { id: 'measure-bust-circ-incr', title: 'Обхват груди' },
  { id: 'measure-underbust-circ-incr', title: 'Обхват под грудью' },
  { id: 'measure-waist-circ-incr', title: 'Обхват талии' },
  { id: 'measure-hips-circ-incr', title: 'Обхват бёдер' },
  { id: 'measure-shoulder-dist-incr', title: 'Ширина плеч' },
  { id: 'measure-napetowaist-dist-incr', title: 'Длина спины до талии' },
  { id: 'measure-waisttohip-dist-incr', title: 'Высота бёдер' },
  { id: 'stomach-pregnant-incr', title: 'Живот' },
  { id: 'buttocks-volume-incr', title: 'Ягодицы' },
]

const DEFAULT_PHENOTYPES: Phenotypes = FEMALE_BASE

/** The measurements the mannequin is fitted to, or undefined without a height. */
function fitTarget(f: Figure): FitTarget | undefined {
  const { height, bust, waist, hips } = f.values
  if (height === undefined) return undefined
  return { height, bust, waist, hips }
}

const FIT_ROWS = [
  { id: 'height', title: 'Рост' },
  { id: 'bust', title: 'Обхват груди Ог3' },
  { id: 'waist', title: 'Обхват талии' },
  { id: 'hips', title: 'Обхват бёдер' },
] as const

interface Stats {
  bytes: number
  loadMs: number
  recomputeMs: number
  benchMs?: number
}

export function BodyPage({
  figure,
  onChange,
  onOpenMeasurements,
}: {
  figure: Figure
  onChange: (f: Figure) => void
  onOpenMeasurements: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<BodyViewer | null>(null)
  const bodyRef = useRef<AnnyBody | null>(null)
  const bufRef = useRef<Float32Array | null>(null)
  const [phen, setPhen] = useState<Phenotypes>(DEFAULT_PHENOTYPES)
  const [local, setLocal] = useState<LocalChanges>({})
  const [scale, setScale] = useState(1)
  const [fit, setFit] = useState<FitResult | null>(null)
  const [fitting, setFitting] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [refit, setRefit] = useState(0)
  const [current, setCurrent] = useState<BodyMeasures | null>(null)
  const target = fitTarget(figure)
  // Refit only once typing has paused: a fit takes a second or more on a phone.
  const targetKey = useDebounced(JSON.stringify(target ?? null), 800)
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const [fps, setFps] = useState(0)

  useEffect(() => {
    const viewer = createBodyViewer(canvasRef.current!)
    viewerRef.current = viewer
    let cancelled = false
    const t = performance.now()
    let bytes = 0
    const countingFetch: typeof fetch = async (input, init) => {
      const res = await fetch(input, init)
      const len = Number(res.headers.get('content-length') ?? 0)
      bytes += len
      return res
    }
    loadAnnyBody(new URL('./body/', document.baseURI).href, countingFetch)
      .then((body) => {
        if (cancelled) return
        bodyRef.current = body
        const t2 = performance.now()
        const v = body.restVertices(DEFAULT_PHENOTYPES)
        const recomputeMs = performance.now() - t2
        bufRef.current = v
        viewer.setMesh(new Float32Array(v), body.faces)
        setStats({ bytes, loadMs: performance.now() - t, recomputeMs })
        setLoaded(true)
      })
      .catch((e: Error) => setError(e.message))
    const timer = setInterval(() => {
      const ft = viewer.frameTime()
      setFps(ft > 0 ? 1000 / ft : 0)
    }, 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
      viewer.dispose()
    }
  }, [])

  useEffect(() => {
    const body = bodyRef.current
    const viewer = viewerRef.current
    if (!body || !viewer || !bufRef.current) return
    const t = performance.now()
    const v = body.restVertices(phen, local, bufRef.current)
    if (scale !== 1) for (let i = 0; i < v.length; i++) v[i]! *= scale
    viewer.updatePositions(v)
    const ms = performance.now() - t
    setStats((s) => (s ? { ...s, recomputeMs: ms } : s))
    // Measure the mannequin as it is now, after the sliders settle.
    const timer = setTimeout(() => {
      try {
        setCurrent(measureBody({ vertices: v, faces: body.faces }))
      } catch {
        setCurrent(null)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [phen, local, scale, loaded])

  // Fit the mannequin to the measurements once the body is loaded and whenever they change.
  useEffect(() => {
    const body = bodyRef.current
    if (!loaded || !body) return
    const t = JSON.parse(targetKey) as FitTarget | null
    if (!t) return
    setFitting(true)
    // Let the «Подбираю…» overlay paint before the fit blocks the main thread.
    const timer = setTimeout(() => {
      const r = fitBody(body, t)
      setPhen(r.phenotypes)
      setLocal(r.local)
      setScale(r.scale)
      setFit(r)
      setFitting(false)
    }, 30)
    return () => clearTimeout(timer)
  }, [loaded, targetKey, refit])

  function manual(update: () => void) {
    update()
    setFit(null)
  }

  function setMeasurement(id: (typeof FIT_ROWS)[number]['id'], v: number | undefined) {
    const values = { ...figure.values }
    if (v === undefined) delete values[id]
    else values[id] = v
    const confirmed = figure.confirmed.includes(id) ? figure.confirmed : [...figure.confirmed, id]
    onChange({ values, confirmed })
  }

  function bench() {
    const body = bodyRef.current
    if (!body || !bufRef.current) return
    const n = 30
    const t = performance.now()
    for (let i = 0; i < n; i++) body.restVertices({ ...phen, weight: (i % 10) / 10 }, local, bufRef.current)
    const ms = (performance.now() - t) / n
    body.restVertices(phen, local, bufRef.current)
    setStats((s) => (s ? { ...s, benchMs: ms } : s))
  }

  return (
    <section className="page body">
      <div className="viewport">
        <canvas ref={canvasRef} />
        {!stats && !error && <div className="overlay">Загружаю манекен…</div>}
        {fitting && <div className="overlay">Подбираю фигуру по меркам…</div>}
        {error && <div className="overlay error">{error}</div>}
      </div>
      <div className="panel">
        <h2>Манекен по меркам</h2>
        {!target && (
          <p className="hint">
            Введите рост (и, если есть, обхваты) здесь или во вкладке «Мерки», и манекен подстроится под них.{' '}
            <button className="link" onClick={onOpenMeasurements}>
              Все мерки
            </button>
          </p>
        )}
        <table className="fit">
          <thead>
            <tr>
              <th />
              <th>Мерка</th>
              <th>Манекен</th>
            </tr>
          </thead>
          <tbody>
            {FIT_ROWS.map((r) => {
              const want = figure.values[r.id]
              const have = current?.[r.id]
              return (
                <tr key={r.id}>
                  <td>{r.title}</td>
                  <td>
                    <CmInput label={r.title} value={want} onChange={(v) => setMeasurement(r.id, v)} />
                  </td>
                  <td className={want !== undefined && have !== undefined && Math.abs(have - want) > 10 ? 'off' : ''}>
                    {have === undefined ? '—' : formatCm(have)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {target && fit && (
          <p className="hint">
            Манекен подобран по меркам за {Math.round(fit.ms)} мс. Обхваты на нём меряются как сантиметровой лентой. Пока
            подгоняются рост и три главных обхвата; остальные мерки (спина, плечи, руки, ноги) добавятся на этапе M4.
          </p>
        )}
        {target && !fit && !fitting && loaded && (
          <p className="hint">
            Фигура изменена вручную, в столбце «Манекен» её текущие размеры.{' '}
            <button className="link" onClick={() => setRefit((n) => n + 1)}>
              Вернуть по меркам
            </button>
          </p>
        )}
        {stats && (
          <dl className="stats">
            <dt>Загрузка</dt>
            <dd>
              {stats.bytes ? `${(stats.bytes / 1e6).toFixed(1)} МБ, ` : ''}
              {Math.round(stats.loadMs)} мс
            </dd>
            <dt>Пересчёт формы</dt>
            <dd>{stats.recomputeMs.toFixed(1)} мс</dd>
            {stats.benchMs !== undefined && (
              <>
                <dt>Тест, среднее из 30</dt>
                <dd>{stats.benchMs.toFixed(1)} мс</dd>
              </>
            )}
            <dt>Кадров в секунду</dt>
            <dd>{fps ? Math.round(fps) : '—'}</dd>
          </dl>
        )}
        <button onClick={bench} disabled={!stats} className="secondary">
          Замерить скорость пересчёта
        </button>
        <details className="manual">
        <summary>Ручная настройка</summary>
        <p className="hint">
          Значения в процентах: у параметров фигуры 0–100, у местных изменений 0 — без изменений, 100 — полное
          изменение модели, больше 100 — с запасом для крупных фигур.
        </p>
        <h2>Фигура</h2>
        {PHENOTYPE_SLIDERS.map((s) => (
          <Slider
            key={s.id}
            title={s.title}
            min={s.id === 'age' ? 0.55 : 0}
            max={1}
            value={phen[s.id] ?? 0.5}
            onChange={(v) => manual(() => setPhen({ ...phen, [s.id]: v }))}
          />
        ))}
        <h2>Местные изменения</h2>
        <p className="hint">Обхваты груди, талии и бёдер подбираются по меркам автоматически.</p>
        {LOCAL_SLIDERS.map((s) => (
          <Slider
            key={s.id}
            title={s.title}
            min={-1}
            max={2.5}
            value={local[s.id] ?? 0}
            onChange={(v) => manual(() => setLocal({ ...local, [s.id]: v }))}
          />
        ))}
        <button className="secondary" onClick={() => manual(() => (setPhen(DEFAULT_PHENOTYPES), setLocal({}), setScale(1)))}>
          Сбросить
        </button>
        </details>
        <p className="hint">
          Модель тела Anny (NAVER Labs, Apache 2.0) на ресурсах MakeHuman (CC0).
        </p>
      </div>
    </section>
  )
}

/** A slider with a number box: shows the current value in percent and accepts typed values. */
function Slider({
  title,
  min,
  max,
  value,
  onChange,
}: {
  title: string
  min: number
  max: number
  value: number
  onChange: (v: number) => void
}) {
  const pct = Math.round(value * 100)
  const [text, setText] = useState(String(pct))
  useEffect(() => {
    if (Number(text) !== pct) setText(String(pct))
    // Only follow outside changes; typing is handled below.
  }, [pct])
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  return (
    <label className="slider">
      <span>{title}</span>
      <input type="range" min={min} max={max} step={0.01} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <input
        type="text"
        inputMode="numeric"
        className="num"
        aria-label={`${title}, %`}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const v = Number(e.target.value.replace(',', '.'))
          if (e.target.value.trim() !== '' && Number.isFinite(v)) onChange(clamp(v / 100))
        }}
        onBlur={() => setText(String(Math.round(clamp(Number(text) / 100 || 0) * 100)))}
        onFocus={(e) => e.target.select()}
      />
    </label>
  )
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
