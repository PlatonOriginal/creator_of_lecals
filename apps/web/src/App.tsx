import { Suspense, lazy, useEffect, useState } from 'react'
import { MeasurePage } from './MeasurePage'
import { PatternPage } from './PatternPage'
import { loadFigure, saveFigure } from './figureStore'
import { LibraryPage } from './LibraryPage'
import { FittingsPage } from './FittingsPage'
import { loadCurrentModel, saveCurrentModel } from './modelStore'
import type { GenderMode } from './maleUi'

// Three.js and the body model are loaded only when the mannequin tab opens.
const BodyPage = lazy(() => import('./BodyPage').then((m) => ({ default: m.BodyPage })))

type Tab = 'measure' | 'pattern' | 'body' | 'library' | 'fittings'

const TABS: { id: Tab; title: string }[] = [
  { id: 'measure', title: 'Мерки' },
  { id: 'pattern', title: 'Выкройка' },
  { id: 'body', title: 'Манекен' },
  { id: 'library', title: 'Библиотека' },
  { id: 'fittings', title: 'Журнал' },
]

export function App() {
  const [tab, setTab] = useState<Tab>('measure')
  const [gender, setGender] = useState<GenderMode>('female')
  const [figure, setFigure] = useState(loadFigure)
  useEffect(() => saveFigure(figure), [figure])
  const [model, setModel] = useState(loadCurrentModel)
  useEffect(() => saveCurrentModel(model), [model])

  return (
    <div className="app">
      <header className="header">
        <h1>Создатель выкроек</h1>
        <span className="badge">прототип M5</span>
        <div className="gender-switch" role="group" aria-label="Пол фигуры">
          <button
            type="button"
            className={gender === 'female' ? 'active' : ''}
            onClick={() => setGender('female')}
          >
            Женский
          </button>
          <button
            type="button"
            className={gender === 'male' ? 'active' : ''}
            onClick={() => setGender('male')}
          >
            Мужской
          </button>
        </div>
      </header>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.title}
          </button>
        ))}
      </nav>
      <main>
        <Suspense fallback={<p className="hint">Загрузка…</p>}>
          {tab === 'measure' && <MeasurePage figure={figure} onChange={setFigure} gender={gender} />}
          {tab === 'pattern' && (
            <PatternPage
              figure={figure}
              onChange={setFigure}
              model={model}
              onModelChange={setModel}
              gender={gender}
              onGenderChange={setGender}
            />
          )}
          {tab === 'library' && (
            <LibraryPage
              figure={figure}
              model={model}
              onOpenFigure={(f) => {
                setFigure(f)
                setTab('measure')
              }}
              onOpenModel={(m) => {
                setModel(m)
                setTab('pattern')
              }}
            />
          )}
          {tab === 'fittings' && <FittingsPage figure={figure} model={model} />}
          {tab === 'body' && <BodyPage figure={figure} onChange={setFigure} onOpenMeasurements={() => setTab('measure')} model={model} />}
        </Suspense>
      </main>
    </div>
  )
}
