import { Suspense, lazy, useEffect, useState } from 'react'
import { PuzzlesTab } from './tabs/PuzzlesTab'
import { PieceCountModal } from './ui/PieceCountModal'
import { Icon, Loading } from './ui/common'

// Der 3D-Teil (three.js) ist groß. Er wird erst geladen, wenn man ihn braucht, damit die App schnell startet.
const ThreeDTab = lazy(() => import('./tabs/ThreeDTab').then((m) => ({ default: m.ThreeDTab })))
const CollectionTab = lazy(() => import('./tabs/CollectionTab').then((m) => ({ default: m.CollectionTab })))
const PuzzleScreen = lazy(() => import('./puzzle/PuzzleScreen').then((m) => ({ default: m.PuzzleScreen })))
const Puzzle3D = lazy(() => import('./three/Puzzle3D').then((m) => ({ default: m.Puzzle3D })))

type Tab = 'puzzles' | '3d' | 'sammlung'
type Play = { kind: '2d'; imageId: string; cols: number; rows: number } | { kind: '3d'; model: string; count: number }

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'puzzles', label: 'Puzzles', icon: 'puzzle' },
  { id: '3d', label: '3D Puzzles', icon: 'cube' },
  { id: 'sammlung', label: 'Meine Sammlung', icon: 'trophy' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('puzzles')
  const [play, setPlay] = useState<Play | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  const [visit, setVisit] = useState(0) // lädt die Tabs neu, wenn man aus einem Puzzle zurückkommt

  // Die Zurück-Taste des Geräts führt aus dem Puzzle in die Auswahl, nicht aus der App.
  useEffect(() => {
    const back = () => { setPlay(null); setPick(null); setVisit((n) => n + 1) }
    window.addEventListener('popstate', back)
    return () => window.removeEventListener('popstate', back)
  }, [])

  const start = (p: Play) => { setPick(null); history.pushState({ spiel: true }, ''); setPlay(p) }
  const exit = (to?: 'sammlung') => { if (to) setTab(to); history.back() }

  if (play?.kind === '2d') return <Suspense fallback={<div className="tisch fixed inset-0"><Loading text="Dein Puzzle wird vorbereitet" /></div>}><PuzzleScreen imageId={play.imageId} cols={play.cols} rows={play.rows} onExit={exit} /></Suspense>
  if (play?.kind === '3d') return <Suspense fallback={<div className="tisch fixed inset-0"><Loading text="Dein 3D-Puzzle wird vorbereitet" /></div>}><Puzzle3D modelId={play.model} count={play.count} onExit={exit} /></Suspense>

  return (
    <div className="tisch flex h-full flex-col flach:flex-row">
      <main className="einblenden scroll-y safe-t min-h-0 min-w-0 flex-1" key={`${tab}-${visit}`}>
        {tab === 'puzzles' && <PuzzlesTab onPick={setPick} onResume={(g) => start({ kind: '2d', imageId: g.imageId, cols: g.cols, rows: g.rows })} />}
        <Suspense fallback={<div className="relative h-[60vh]"><Loading text="Einen Moment" /></div>}>
          {tab === '3d' && <ThreeDTab onPlay={(model, count) => start({ kind: '3d', model, count })} />}
          {tab === 'sammlung' && (
            <CollectionTab
              onResume={(g) => start({ kind: '2d', imageId: g.imageId, cols: g.cols, rows: g.rows })}
              onPick={setPick}
              onResume3D={(model, count) => start({ kind: '3d', model, count })}
              goPuzzles={() => setTab('puzzles')}
            />
          )}
        </Suspense>
      </main>

      <nav className="safe-b flex flex-none border-t border-black/10 bg-[#f6eddf] flach:w-[calc(96px+env(safe-area-inset-right,0px))] flach:flex-col flach:border-l flach:border-t-0 flach:pr-[env(safe-area-inset-right,0px)]" aria-label="Bereiche">
        {TABS.map((t) => {
          const on = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)} aria-current={on ? 'page' : undefined}
              className={`relative flex min-h-[66px] flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-center text-[16px] leading-tight transition-colors duration-200 flach:text-[14px] ${on ? 'font-bold text-green' : 'font-semibold text-ink2'}`}>
              <span className={`absolute left-1/2 top-0 h-[3px] w-10 -translate-x-1/2 bg-green transition-opacity duration-200 flach:left-0 flach:top-1/2 flach:h-10 flach:w-[3px] flach:-translate-y-1/2 flach:translate-x-0 ${on ? 'opacity-100' : 'opacity-0'}`} />
              <Icon name={t.icon} size={28} />
              <span>{t.label}</span>
            </button>
          )
        })}
      </nav>

      {pick && <PieceCountModal imageId={pick} onClose={() => setPick(null)} onStart={(cols, rows) => start({ kind: '2d', imageId: pick, cols, rows })} />}
    </div>
  )
}
