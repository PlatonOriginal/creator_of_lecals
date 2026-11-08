import { Suspense, lazy, useEffect, useState } from 'react'
import { MeasurePage } from './MeasurePage'
import { PatternPage } from './PatternPage'
import { loadFigure, saveFigure } from './figureStore'

// Three.js and the body model are loaded only when the mannequin tab opens.
const BodyPage = lazy(() => import('./BodyPage').then((m) => ({ default: m.BodyPage })))

type Tab = 'measure' | 'pattern' | 'body'

const TABS: { id: Tab; title: string }[] = [
  { id: 'measure', title: 'Мерки' },
  { id: 'pattern', title: 'Выкройка' },
  { id: 'body', title: 'Манекен' },
]

export function App() {
  const [tab, setTab] = useState<Tab>('measure')
  const [figure, setFigure] = useState(loadFigure)
  useEffect(() => saveFigure(figure), [figure])

  return (
    <div className="app">
      <header className="header">
        <h1>Создатель выкроек</h1>
        <span className="badge">прототип M2</span>
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
          {tab === 'measure' && <MeasurePage figure={figure} onChange={setFigure} />}
          {tab === 'pattern' && <PatternPage figure={figure} onChange={setFigure} />}
          {tab === 'body' && <BodyPage figure={figure} onChange={setFigure} onOpenMeasurements={() => setTab('measure')} />}
        </Suspense>
      </main>
    </div>
  )
}
