import { useMemo, useState } from 'react'
import {
  LEADING_IDS,
  MEASUREMENTS,
  MEASUREMENT_GROUPS,
  MEASUREMENT_IDS,
  type MeasurementId,
  type MeasurementIssue,
  formatCm,
  issuesFor,
  leadingOf,
  nearestTypicalFigure,
  prefill,
  typicalValue,
  validateMeasurements,
} from '@lecals/core'
import { CmInput } from './CmInput'
import { FigureSketch } from './FigureSketch'
import { type Figure, confirmedCount } from './figureStore'

type Mode = { kind: 'start' } | { kind: 'step'; index: number } | { kind: 'summary' }

/** Measurements the wizard walks through after the start screen. */
const STEP_IDS = MEASUREMENT_IDS.filter((id) => !LEADING_IDS.includes(id) || id === 'waist')

const GROUP_NAMES = ['нулевая', 'первая', 'вторая', 'третья', 'четвёртая', 'пятая']

export function MeasurePage({ figure, onChange }: { figure: Figure; onChange: (f: Figure) => void }) {
  const [mode, setMode] = useState<Mode>(() =>
    leadingOf(figure.values) && confirmedCount(figure) > 4 ? { kind: 'summary' } : { kind: 'start' },
  )
  const issues = useMemo(() => validateMeasurements(figure.values), [figure.values])

  function setValue(id: MeasurementId, v: number | undefined) {
    const values = { ...figure.values }
    if (v === undefined) delete values[id]
    else values[id] = v
    onChange({ ...figure, values })
  }
  function confirm(id: MeasurementId) {
    if (!figure.confirmed.includes(id)) onChange({ ...figure, confirmed: [...figure.confirmed, id] })
  }

  if (mode.kind === 'start')
    return (
      <StartScreen
        figure={figure}
        issues={issues}
        setValue={setValue}
        onNext={() => {
          // The leading ones (and the waist, if entered) count as measured. Values that
          // were only prefilled are recomputed: height or girths may have changed.
          const entered: MeasurementId[] = ['height', 'bust', 'hips']
          if (figure.values.waist !== undefined) entered.push('waist')
          const confirmed = [...new Set([...figure.confirmed, ...entered])]
          const kept = Object.fromEntries(confirmed.map((id) => [id, figure.values[id]]))
          onChange({ values: prefill(kept), confirmed })
          setMode({ kind: 'step', index: 0 })
        }}
        onSummary={() => setMode({ kind: 'summary' })}
      />
    )

  if (mode.kind === 'summary')
    return (
      <Summary
        figure={figure}
        issues={issues}
        onEdit={(id) =>
          LEADING_IDS.includes(id) && id !== 'waist'
            ? setMode({ kind: 'start' })
            : setMode({ kind: 'step', index: STEP_IDS.indexOf(id) })
        }
        onRestart={() => setMode({ kind: 'start' })}
      />
    )

  const id = STEP_IDS[mode.index]!
  const spec = MEASUREMENTS[id]
  const lead = leadingOf(figure.values)
  const typical = lead ? typicalValue(id, lead).value : undefined
  const own = issuesFor(id, issues)
  const hasError = own.some((i) => i.level === 'error') || figure.values[id] === undefined
  const isLast = mode.index === STEP_IDS.length - 1
  const go = (index: number) => setMode(index >= STEP_IDS.length ? { kind: 'summary' } : { kind: 'step', index })
  const groupTitle = MEASUREMENT_GROUPS.find((g) => g.id === spec.group)!.title

  return (
    <section className="page measure">
      <div className="progress" aria-label={`Мерка ${mode.index + 1} из ${STEP_IDS.length}`}>
        <div style={{ width: `${((mode.index + 1) / STEP_IDS.length) * 100}%` }} />
      </div>
      <div className="panel step">
        <p className="step-meta">
          {groupTitle} · {mode.index + 1} из {STEP_IDS.length}
          {'gost' in spec && spec.gost && <> · признак {spec.gost} по ГОСТ 31396-2009</>}
        </p>
        <h2>
          {spec.title} <span className="short">{spec.short}</span>
        </h2>
        <div className="step-body">
          <FigureSketch id={id} />
          <p className="how">{spec.hint}</p>
        </div>
        <div className="step-input">
          <CmInput key={id} big label={spec.title} value={figure.values[id]} onChange={(v) => setValue(id, v)} />
          {typical !== undefined && id !== 'skirtLength' && (
            <p className="hint">
              Типично для вашей фигуры: {formatCm(typical)}
              {!figure.confirmed.includes(id) && figure.values[id] === typical && ' (подставлено, измерьте)'}
            </p>
          )}
        </div>
        <Issues issues={own} />
        <div className="buttons nav">
          <button className="secondary" onClick={() => (mode.index === 0 ? setMode({ kind: 'start' }) : go(mode.index - 1))}>
            Назад
          </button>
          <button
            disabled={hasError}
            onClick={() => {
              confirm(id)
              go(mode.index + 1)
            }}
          >
            {isLast ? 'Готово' : 'Дальше'}
          </button>
        </div>
        <button className="link" onClick={() => setMode({ kind: 'summary' })}>
          Все мерки
        </button>
      </div>
    </section>
  )
}

function StartScreen({
  figure,
  issues,
  setValue,
  onNext,
  onSummary,
}: {
  figure: Figure
  issues: MeasurementIssue[]
  setValue: (id: MeasurementId, v: number | undefined) => void
  onNext: () => void
  onSummary: () => void
}) {
  const lead = leadingOf(figure.values)
  const typ = lead && nearestTypicalFigure(lead)
  const leadIssues = issues.filter((i) => i.level === 'error' && LEADING_IDS.includes(i.ids[0]!))
  const ready = lead && leadIssues.length === 0
  const started = confirmedCount(figure) > 3

  return (
    <section className="page measure">
      <div className="panel">
        <h2>Мерки фигуры</h2>
        <p className="hint">
          Начните с роста и трёх обхватов. По ним приложение подставит типовые значения остальных мерок по ГОСТ 31396-2009, а
          дальше мастер проведёт по каждой мерке: картинка, как снимать, проверка. Нужны сантиметровая лента и тесьма
          на талию, лучше с помощником. Займёт около 15 минут.
        </p>
        {(['height', 'bust', 'hips', 'waist'] as const).map((id) => (
          <label key={id} className="field">
            <span>
              {MEASUREMENTS[id].title} <span className="short">{MEASUREMENTS[id].short}</span>
              {id === 'waist' && <span className="hint"> — можно позже</span>}
            </span>
            <CmInput label={MEASUREMENTS[id].title} value={figure.values[id]} onChange={(v) => setValue(id, v)} />
          </label>
        ))}
        <Issues issues={leadIssues} />
        {typ && ready && (
          <p className="typical">
            {typ.matches ? 'Ваша типовая фигура' : 'Ближайшая типовая фигура'}: <b>{typ.label}</b>,{' '}
            {GROUP_NAMES[typ.group]} полнотная группа по ГОСТ 31396-2009
            {!typ.matches && '. Ваши мерки между типовыми фигурами, это нормально: выкройка строится по вашим меркам.'}
          </p>
        )}
        <div className="buttons">
          <button disabled={!ready} onClick={onNext}>
            {started ? 'Продолжить по шагам' : 'Подставить типовые и начать'}
          </button>
          {started && (
            <button className="secondary" onClick={onSummary}>
              Все мерки
            </button>
          )}
        </div>
        <details className="hint more">
          <summary>Как снимать мерки</summary>
          <p>
            Мерки снимают в белье, в котором будут носить вещь, без обуви. Стойте прямо и дышите спокойно, не втягивайте
            живот. Лента лежит плотно, но не стягивает. Завяжите на талии тесьму: от неё отсчитываются длины. Обхваты
            вводите полностью, а не половину.
          </p>
        </details>
      </div>
    </section>
  )
}

function Summary({
  figure,
  issues,
  onEdit,
  onRestart,
}: {
  figure: Figure
  issues: MeasurementIssue[]
  onEdit: (id: MeasurementId) => void
  onRestart: () => void
}) {
  const errors = issues.filter((i) => i.level === 'error').length
  const warnings = issues.length - errors
  const missing = MEASUREMENT_IDS.filter((id) => figure.values[id] === undefined || !figure.confirmed.includes(id))
  const lead = leadingOf(figure.values)
  const typ = lead && nearestTypicalFigure(lead)

  return (
    <section className="page measure">
      <div className="panel">
        <h2>Все мерки</h2>
        <p className="hint">
          {typ && <>Типовая фигура {typ.label}. </>}
          Измерено {MEASUREMENT_IDS.length - missing.length} из {MEASUREMENT_IDS.length}
          {errors > 0 && `, ошибок: ${errors}`}
          {warnings > 0 && `, предупреждений: ${warnings}`}. Нажмите на мерку, чтобы изменить.
        </p>
        {MEASUREMENT_GROUPS.map((g) => (
          <div key={g.id}>
            <h3>{g.title}</h3>
            <ul className="summary">
              {MEASUREMENT_IDS.filter((id) => MEASUREMENTS[id].group === g.id).map((id) => {
                const own = issuesFor(id, issues)
                const level = own.some((i) => i.level === 'error') ? 'error' : own.length ? 'warning' : ''
                const v = figure.values[id]
                return (
                  <li key={id}>
                    <button className={`row ${level}`} onClick={() => onEdit(id)}>
                      <span>
                        {MEASUREMENTS[id].title} <span className="short">{MEASUREMENTS[id].short}</span>
                      </span>
                      <span className="val">
                        {v === undefined ? '—' : formatCm(v)}
                        {v !== undefined && !figure.confirmed.includes(id) && <span className="tag">типовое</span>}
                      </span>
                    </button>
                    {own.length > 0 && <Issues issues={own} />}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
        <div className="buttons">
          <button className="secondary" onClick={onRestart}>
            Рост и обхваты
          </button>
        </div>
      </div>
    </section>
  )
}

function Issues({ issues }: { issues: MeasurementIssue[] }) {
  if (!issues.length) return null
  return (
    <ul className="issues">
      {issues.map((i) => (
        <li key={i.message} className={i.level}>
          {i.message}
        </li>
      ))}
    </ul>
  )
}
