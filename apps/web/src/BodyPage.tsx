import { useEffect, useRef, useState } from 'react'
import {
  type AnnyBody,
  type FitResult,
  type FitTarget,
  type LocalChanges,
  type Phenotypes,
  FEMALE_BASE,
  fitBody,
  loadAnnyBody,
} from '@lecals/body'
import { formatCm } from '@lecals/core'
import { type BodyViewer, createBodyViewer } from '@lecals/viewer'
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

export function BodyPage({ figure, onOpenMeasurements }: { figure: Figure; onOpenMeasurements: () => void }) {
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
  const target = fitTarget(figure)
  const targetKey = JSON.stringify(target ?? null)
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
  }, [phen, local, scale])

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
            Введите рост и обхваты во вкладке «Мерки», и манекен подстроится под них.{' '}
            <button className="link" onClick={onOpenMeasurements}>
              Перейти к меркам
            </button>
          </p>
        )}
        {target && fit && (
          <>
            <table className="fit">
              <thead>
                <tr>
                  <th />
                  <th>Мерка</th>
                  <th>Манекен</th>
                </tr>
              </thead>
              <tbody>
                {FIT_ROWS.map((r) =>
                  target[r.id] === undefined ? null : (
                    <tr key={r.id}>
                      <td>{r.title}</td>
                      <td>{formatCm(target[r.id]!)}</td>
                      <td className={Math.abs(fit.measured[r.id] - target[r.id]!) > 10 ? 'off' : ''}>
                        {formatCm(fit.measured[r.id])}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            <p className="hint">
              Обхваты на манекене меряются как сантиметровой лентой. Пока подгоняются рост и три главных обхвата;
              остальные мерки (спина, плечи, руки, ноги) манекен возьмёт на этапе M4. Подбор занял{' '}
              {Math.round(fit.ms)} мс.
            </p>
          </>
        )}
        {target && !fit && !fitting && loaded && (
          <p className="hint">
            Фигура изменена вручную.{' '}
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
        <h2>Фигура</h2>
        {PHENOTYPE_SLIDERS.map((s) => (
          <label key={s.id} className="slider">
            <span>{s.title}</span>
            <input
              type="range"
              min={s.id === 'age' ? 0.55 : 0}
              max={1}
              step={0.01}
              value={phen[s.id] ?? 0.5}
              onChange={(e) => manual(() => setPhen({ ...phen, [s.id]: Number(e.target.value) }))}
            />
          </label>
        ))}
        <h2>Местные изменения</h2>
        <p className="hint">Обхваты груди, талии и бёдер подбираются по меркам автоматически.</p>
        {LOCAL_SLIDERS.map((s) => (
          <label key={s.id} className="slider">
            <span>{s.title}</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={local[s.id] ?? 0}
              onChange={(e) => manual(() => setLocal({ ...local, [s.id]: Number(e.target.value) }))}
            />
          </label>
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
