import { Suspense, lazy, useState } from 'react'
import { PatternPage } from './PatternPage'

// Three.js and the body model are loaded only when the mannequin tab opens.
const BodyPage = lazy(() => import('./BodyPage').then((m) => ({ default: m.BodyPage })))

type Tab = 'pattern' | 'body'

export function App() {
  const [tab, setTab] = useState<Tab>('pattern')
  return (
    <div className="app">
      <header className="header">
        <h1>Создатель выкроек</h1>
        <span className="badge">прототип M0</span>
      </header>
      <nav className="tabs">
        <button className={tab === 'pattern' ? 'active' : ''} onClick={() => setTab('pattern')}>
          Выкройка
        </button>
        <button className={tab === 'body' ? 'active' : ''} onClick={() => setTab('body')}>
          Манекен
        </button>
      </nav>
      <main>
        <Suspense fallback={<p className="hint">Загрузка…</p>}>
          {tab === 'pattern' ? <PatternPage /> : <BodyPage />}
        </Suspense>
      </main>
    </div>
  )
}
