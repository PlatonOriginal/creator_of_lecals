import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type AnnyBody,
  type BodyRegions,
  type FitKey,
  type FitResult,
  type FitTarget,
  type FullMeasures,
  type Landmarks,
  type LocalChanges,
  type Phenotypes,
  type ClothStats,
  type Shell,
  FEMALE_BASE,
  SkirtCloth,
  FIT_LOCAL,
  bodyLandmarks,
  bodyRegions,
  fitBody,
  garmentShell,
  loadAnnyBody,
} from '@lecals/body'
import { EASE_VERDICTS, MEASUREMENTS, easeVerdict, fitLevels, formatCm, leadingOf, type FitLevel } from '@lecals/core'
import { type BodyViewer, type ViewName, type ViewerBand, createBodyViewer } from '@lecals/viewer'
import { CmInput } from './CmInput'
import type { Figure } from './figureStore'
import type { ModelDoc } from './library'
import { draftProfile, filledMeasurements } from './draftModel'

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

/**
 * The measurements the mannequin is fitted to, or undefined without a height.
 * With height, bust and hips the gaps are filled from the typical figure,
 * as the «Выкройка» tab drafts with them; otherwise only what was entered.
 */
function fitTarget(f: Figure): FitTarget | undefined {
  if (f.values.height === undefined) return undefined
  const src = leadingOf(f.values) ? filledMeasurements(f.values) : f.values
  const t: FitTarget = { height: f.values.height }
  for (const k of Object.keys(FIT_LOCAL) as FitKey[]) if (src[k] !== undefined) t[k] = src[k]
  return t
}

type FitRowId = 'height' | FitKey

/** Rows of the table: what is fitted, in the order of the measurement wizard. Editable: the leading ones. */
const FIT_ROWS: { id: FitRowId; edit?: boolean; approx?: boolean }[] = [
  { id: 'height', edit: true },
  { id: 'bust', edit: true },
  { id: 'waist', edit: true },
  { id: 'hips', edit: true },
  { id: 'underbust' },
  { id: 'neck' },
  { id: 'shoulderLength', approx: true },
  { id: 'backLength' },
  { id: 'upperArm' },
  { id: 'waistToHips', approx: true },
  { id: 'thigh' },
]

const VIEWS: { id: ViewName; title: string }[] = [
  { id: 'front', title: 'Спереди' },
  { id: 'side', title: 'Сбоку' },
  { id: 'back', title: 'Сзади' },
  { id: 'top', title: 'Верх' },
  { id: 'bottom', title: 'Низ' },
]

const hexRgb = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]
const easeColor = (ease: number) => hexRgb(EASE_VERDICTS[easeVerdict(ease)].color)
const signedCm = (mm: number) => `${mm >= 0 ? '+' : '−'}${formatCm(Math.abs(mm))}`

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
  model,
}: {
  figure: Figure
  onChange: (f: Figure) => void
  onOpenMeasurements: () => void
  model: ModelDoc
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<BodyViewer | null>(null)
  const bodyRef = useRef<AnnyBody | null>(null)
  const regionsRef = useRef<BodyRegions | null>(null)
  const bufRef = useRef<Float32Array | null>(null)
  const [phen, setPhen] = useState<Phenotypes>(DEFAULT_PHENOTYPES)
  const [local, setLocal] = useState<LocalChanges>({})
  const [scale, setScale] = useState(1)
  const [fit, setFit] = useState<FitResult | null>(null)
  const [fitting, setFitting] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [refit, setRefit] = useState(0)
  const [current, setCurrent] = useState<FullMeasures | null>(null)
  const [landmarks, setLandmarks] = useState<Landmarks | null>(null)
  const [showModel, setShowModel] = useState(true)
  const [showShell, setShowShell] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const shellRef = useRef<Shell | null>(null)
  const [cloth, setCloth] = useState(false)
  const [clothStats, setClothStats] = useState<ClothStats | null>(null)
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
        regionsRef.current = bodyRegions(body)
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
        const L = bodyLandmarks({ vertices: v, faces: body.faces }, regionsRef.current!)
        setLandmarks(L)
        setCurrent(L.measures)
      } catch {
        setLandmarks(null)
        setCurrent(null)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [phen, local, scale, loaded])

  // Fit the mannequin to the measurements once the body is loaded and whenever
  // they change, in a worker (a few seconds on a phone); on the main thread
  // if workers are not available.
  const workerRef = useRef<Worker | null>(null)
  useEffect(() => {
    try {
      workerRef.current = new Worker(new URL('./fitWorker.ts', import.meta.url), { type: 'module' })
    } catch {
      workerRef.current = null
    }
    return () => workerRef.current?.terminate()
  }, [])
  useEffect(() => {
    const body = bodyRef.current
    if (!loaded || !body) return
    const t = JSON.parse(targetKey) as FitTarget | null
    if (!t) return
    setFitting(true)
    let cancelled = false
    const apply = (r: FitResult) => {
      if (cancelled) return
      setPhen(r.phenotypes)
      setLocal(r.local)
      setScale(r.scale)
      setFit(r)
      setFitting(false)
    }
    const worker = workerRef.current
    const id = Math.random()
    let timer = 0
    const onMessage = (e: MessageEvent<{ id: number; result?: FitResult; error?: string }>) => {
      if (e.data.id !== id) return
      if (e.data.result) apply(e.data.result)
      else apply(fitBody(body, t))
    }
    if (worker) {
      worker.addEventListener('message', onMessage)
      worker.postMessage({ id, baseUrl: new URL('./body/', document.baseURI).href, target: t })
    } else {
      // Let the «Подбираю…» overlay paint before the fit blocks the main thread.
      timer = window.setTimeout(() => apply(fitBody(body, t)), 30)
    }
    return () => {
      cancelled = true
      clearTimeout(timer)
      worker?.removeEventListener('message', onMessage)
    }
  }, [loaded, targetKey, refit])

  // The model on the mannequin: rings of the pattern, the ease map and the shell.
  const drafted = useMemo(() => {
    try {
      return showModel ? draftProfile(model, figure.values) : undefined
    } catch {
      return undefined
    }
  }, [showModel, model, figure.values])
  const levels: FitLevel[] = useMemo(() => (drafted ? fitLevels(drafted.profile, drafted.m) : []), [drafted])

  useEffect(() => {
    const viewer = viewerRef.current
    const body = bodyRef.current
    const v = bufRef.current
    if (!viewer || !body || !v || !landmarks) return
    setCloth(false)
    if (!drafted) {
      shellRef.current = null
      viewer.setShell(null)
      // Without a model: the girth lines of the body.
      const lines: [keyof Landmarks['rings'], string][] = [
        ['bust', 'Ог3'],
        ['waist', 'От'],
        ['hips', 'Об'],
      ]
      viewer.setBands(
        lines.map(([id, short]) => {
          const r = landmarks.rings[id]
          const front = r.points.reduce((a, p) => (p[2] > a[2] ? p : a), r.points[0]!)
          return { points: r.points, color: '#555555', label: `${short} ${formatCm(r.length)}`, labelAt: front }
        }),
      )
      return
    }
    const shell = garmentShell({ vertices: v, faces: body.faces }, landmarks, drafted.profile, { color: easeColor })
    shellRef.current = shell
    viewer.setShell(shell)
    const bands: ViewerBand[] = []
    for (const b of shell.bands) {
      const l = levels.find((x) => x.id === b.id)
      if (!l) continue
      bands.push({ points: b.points, labelAt: b.labelAt, color: EASE_VERDICTS[l.verdict].color, label: `${l.title} ${signedCm(l.ease)}` })
    }
    viewer.setBands(bands)
  }, [landmarks, drafted, levels])

  useEffect(() => viewerRef.current?.setShellVisible(showShell), [showShell])

  // Cloth experiment: the skirt part of the shell falls under gravity, one step a frame, for 5 s.
  useEffect(() => {
    const viewer = viewerRef.current
    const shell = shellRef.current
    if (!viewer || !shell) return
    if (!cloth || !shell.grid) {
      viewer.updateShell(shell.positions, true)
      return
    }
    const sim = new SkirtCloth(shell.positions.slice(), shell.grid)
    let raf = 0
    let n = 0
    const tick = () => {
      sim.step()
      viewer.updateShell(sim.pos)
      if (++n % 30 === 0) setClothStats(sim.stats())
      if (n < 300) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [cloth])
  useEffect(() => viewerRef.current?.setLabelsVisible(showLabels), [showLabels])

  function manual(update: () => void) {
    update()
    setFit(null)
  }

  function setMeasurement(id: FitRowId, v: number | undefined) {
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
        <div className="views">
          {VIEWS.map((v) => (
            <button key={v.id} onClick={() => viewerRef.current?.setView(v.id)}>
              {v.title}
            </button>
          ))}
        </div>
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
        <FitMap
          model={model}
          drafted={drafted !== undefined}
          showModel={showModel}
          setShowModel={setShowModel}
          showShell={showShell}
          setShowShell={setShowShell}
          showLabels={showLabels}
          setShowLabels={setShowLabels}
          levels={levels}
        />
        {showModel && drafted && (
          <div className="toggles">
            <label>
              <input type="checkbox" checked={cloth} disabled={!shellRef.current?.grid} onChange={(e) => setCloth(e.target.checked)} />{' '}
              Ткань (эксперимент)
            </label>
            {cloth && clothStats && (
              <span className="hint">
                {clothStats.particles} точек, шаг {clothStats.stepMs.toFixed(1)} мс
              </span>
            )}
          </div>
        )}
        <h2>Мерки и манекен</h2>
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
              const spec = MEASUREMENTS[r.id]
              const want = target?.[r.id]
              const own = figure.values[r.id] !== undefined
              const have = current?.[r.id]
              const off = want !== undefined && have !== undefined && Math.abs(have - want) > (r.approx ? 25 : 10)
              return (
                <tr key={r.id}>
                  <td>
                    {spec.title} <span className="short">{spec.short}</span>
                    {r.approx && <span className="short"> ≈</span>}
                  </td>
                  <td>
                    {r.edit ? (
                      <CmInput label={spec.title} value={figure.values[r.id]} onChange={(v) => setMeasurement(r.id, v)} />
                    ) : want === undefined ? (
                      '—'
                    ) : (
                      <span className={own ? '' : 'typical'} title={own ? '' : 'По типовой фигуре'}>
                        {formatCm(want)}
                      </span>
                    )}
                  </td>
                  <td className={off ? 'off' : ''}>{have === undefined ? '—' : formatCm(have)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {target && fit && (
          <p className="hint">
            Манекен подобран по меркам за {Math.round(fit.ms)} мс. Обхваты на нём меряются как сантиметровой лентой. Серым
            показаны мерки по типовой фигуре (их можно уточнить во вкладке «Мерки»). Значок ≈: ширину плеча и высоту бёдер
            манекен повторяет приблизительно, расхождение до 2,5 см (по высоте бёдер у модели Anny бывает и больше).
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
        <p className="hint">По меркам подбираются автоматически все изменения, кроме живота и ягодиц.</p>
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

/** The ease map panel: the model on the mannequin, level by level. */
function FitMap({
  model,
  drafted,
  showModel,
  setShowModel,
  showShell,
  setShowShell,
  showLabels,
  setShowLabels,
  levels,
}: {
  model: ModelDoc
  drafted: boolean
  showModel: boolean
  setShowModel: (v: boolean) => void
  showShell: boolean
  setShowShell: (v: boolean) => void
  showLabels: boolean
  setShowLabels: (v: boolean) => void
  levels: FitLevel[]
}) {
  return (
    <>
      <h2>Примерка: «{model.name}»</h2>
      <div className="toggles">
        <label>
          <input type="checkbox" checked={showModel} onChange={(e) => setShowModel(e.target.checked)} /> Модель на манекене
        </label>
        <label>
          <input type="checkbox" checked={showShell} disabled={!showModel} onChange={(e) => setShowShell(e.target.checked)} /> Чехол
        </label>
        <label>
          <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Подписи
        </label>
      </div>
      {showModel && !drafted && <p className="hint">Модель не строится по этим меркам: проверьте их во вкладке «Выкройка».</p>}
      {showModel && drafted && (
        <>
          <table className="fit ease">
            <thead>
              <tr>
                <th />
                <th>Изделие</th>
                <th>Тело</th>
                <th>Свобода</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((l) => (
                <tr key={l.id}>
                  <td>{l.title}</td>
                  <td>{formatCm(l.garment)}</td>
                  <td>{formatCm(l.body)}</td>
                  <td>
                    <span className="dot" style={{ background: EASE_VERDICTS[l.verdict].color }} />
                    {signedCm(l.ease)}
                    <div className="verdict">{EASE_VERDICTS[l.verdict].title}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="legend">
            {Object.values(EASE_VERDICTS).map((v) => (
              <span key={v.title}>
                <span className="dot" style={{ background: v.color }} />
                {v.title}
              </span>
            ))}
          </p>
          <p className="hint">
            Свобода = обхват изделия по чертежу минус мерка: тесно — меньше нуля, впритык — до 1 см, по фигуре — до 6 см,
            свободно — до 12 см. Чехол — грубая оболочка изделия без складок ткани: он показывает силуэт и длину, цвет на нём —
            свобода на этой высоте. Модель меняется во вкладке «Выкройка».
          </p>
        </>
      )}
    </>
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
