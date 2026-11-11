import { useEffect, useState } from 'react'
import { BLOCKS, METHODS } from '@lecals/core'
import type { Figure } from './figureStore'
import {
  deleteFigure,
  deleteModel,
  listFigures,
  listModels,
  newId,
  putFigure,
  type FigureDoc,
  type ModelDoc,
} from './library'

const date = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
const cm = (mm?: number) => (mm === undefined ? '—' : (Math.round(mm) / 10).toLocaleString('ru-RU'))

/**
 * Personal library on this device: figures, own blocks and models. Opening a
 * figure makes it the current one; «взять как основу» starts a new model on
 * top of a saved one.
 */
export function LibraryPage({
  figure,
  model,
  onOpenFigure,
  onOpenModel,
}: {
  figure: Figure
  model: ModelDoc
  onOpenFigure: (f: Figure) => void
  onOpenModel: (m: ModelDoc) => void
}) {
  const [figures, setFigures] = useState<FigureDoc[]>([])
  const [models, setModels] = useState<ModelDoc[]>([])
  const [error, setError] = useState('')
  const [name, setName] = useState('')

  const reload = () =>
    Promise.all([listFigures(), listModels()])
      .then(([f, m]) => {
        setFigures(f)
        setModels(m)
      })
      .catch((e: Error) => setError(`Библиотека недоступна в этом браузере: ${e.message}`))
  useEffect(() => {
    void reload()
  }, [])

  async function saveFigure() {
    const n = name.trim() || `Фигура: рост ${cm(figure.values.height)}, Ог ${cm(figure.values.bust)}`
    await putFigure({ id: newId(), name: n, figure, updated: Date.now() })
    setName('')
    await reload()
  }

  function asBase(m: ModelDoc) {
    onOpenModel({
      ...m,
      id: newId(),
      name: `${m.name} — новая`,
      kind: 'model',
      layers: [...m.layers, {}],
      baseName: m.name,
      updated: Date.now(),
    })
  }

  const blockTitle = (id: string) => {
    const b = BLOCKS.find((x) => x.id === id)
    return b ? `${b.title} · ${METHODS[b.method]}` : id
  }

  return (
    <section className="page library">
      <div className="panel">
        <h2>Фигуры</h2>
        {error && <p className="errors">{error}</p>}
        <label className="field">
          <span>Сохранить текущие мерки как</span>
          <input className="text" placeholder="Имя (например, Анна)" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="buttons">
          <button onClick={() => void saveFigure()} disabled={!Object.keys(figure.values).length}>
            Сохранить фигуру
          </button>
        </div>
        <ul className="lib">
          {figures.map((f) => (
            <li key={f.id}>
              <div>
                <b>{f.name}</b>
                <span className="hint">
                  {' '}
                  рост {cm(f.figure.values.height)}, Ог {cm(f.figure.values.bust)}, Об {cm(f.figure.values.hips)} · {date(f.updated)}
                </span>
              </div>
              <div className="row-buttons">
                <button onClick={() => onOpenFigure(f.figure)}>Открыть</button>
                <button className="secondary" onClick={() => void deleteFigure(f.id).then(reload)}>
                  Удалить
                </button>
              </div>
            </li>
          ))}
          {!figures.length && <li className="hint">Пока нет сохранённых фигур.</li>}
        </ul>
      </div>

      <div className="panel">
        <h2>Свои основы и модели</h2>
        <p className="hint">
          Модель хранится как основа, методика, приёмы и параметры, а не как готовый чертёж: при открытии она
          пересчитывается по текущим меркам. Сейчас открыта «{model.name}». Сохранить её можно во вкладке «Выкройка».
        </p>
        {(['base', 'model'] as const).map((kind) => (
          <div key={kind}>
            <h3>{kind === 'base' ? 'Основы' : 'Модели'}</h3>
            <ul className="lib">
              {models
                .filter((m) => m.kind === kind)
                .map((m) => (
                  <li key={m.id}>
                    <div>
                      <b>{m.name}</b>
                      <span className="hint">
                        {' '}
                        {blockTitle(m.block)}
                        {m.baseName ? ` · на основе «${m.baseName}»` : ''} · {date(m.updated)}
                      </span>
                    </div>
                    <div className="row-buttons">
                      <button onClick={() => onOpenModel(m)}>Открыть</button>
                      <button className="secondary" onClick={() => asBase(m)}>
                        Взять как основу
                      </button>
                      <button className="secondary" onClick={() => void deleteModel(m.id).then(reload)}>
                        Удалить
                      </button>
                    </div>
                  </li>
                ))}
              {!models.some((m) => m.kind === kind) && <li className="hint">Пока пусто.</li>}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
