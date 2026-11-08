import { useEffect, useRef, useState } from 'react'
import { type AnnyBody, type LocalChanges, type Phenotypes, loadAnnyBody } from '@lecals/body'
import { type BodyViewer, createBodyViewer } from '@lecals/viewer'

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

const DEFAULT_PHENOTYPES: Phenotypes = {
  gender: 1,
  age: 0.72,
  height: 0.45,
  weight: 0.5,
  muscle: 0.45,
  proportions: 0.5,
  cupsize: 0.5,
  firmness: 0.5,
}

interface Stats {
  bytes: number
  loadMs: number
  recomputeMs: number
  benchMs?: number
}

export function BodyPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<BodyViewer | null>(null)
  const bodyRef = useRef<AnnyBody | null>(null)
  const bufRef = useRef<Float32Array | null>(null)
  const [phen, setPhen] = useState<Phenotypes>(DEFAULT_PHENOTYPES)
  const [local, setLocal] = useState<LocalChanges>({})
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
    body.restVertices(phen, local, bufRef.current)
    viewer.updatePositions(bufRef.current)
    const ms = performance.now() - t
    setStats((s) => (s ? { ...s, recomputeMs: ms } : s))
  }, [phen, local])

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
        {error && <div className="overlay error">{error}</div>}
      </div>
      <div className="panel">
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
              onChange={(e) => setPhen({ ...phen, [s.id]: Number(e.target.value) })}
            />
          </label>
        ))}
        <h2>Местные изменения</h2>
        <p className="hint">Эти параметры потом подбираются автоматически, чтобы обхваты совпали с мерками (этап M4).</p>
        {LOCAL_SLIDERS.map((s) => (
          <label key={s.id} className="slider">
            <span>{s.title}</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={local[s.id] ?? 0}
              onChange={(e) => setLocal({ ...local, [s.id]: Number(e.target.value) })}
            />
          </label>
        ))}
        <button className="secondary" onClick={() => (setPhen(DEFAULT_PHENOTYPES), setLocal({}))}>
          Сбросить
        </button>
        <p className="hint">
          Модель тела Anny (NAVER Labs, Apache 2.0) на ресурсах MakeHuman (CC0).
        </p>
      </div>
    </section>
  )
}
