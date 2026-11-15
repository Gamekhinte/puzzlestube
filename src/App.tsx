import { useEffect, useState } from 'react'
import { PuzzlesTab } from './tabs/PuzzlesTab'
import { ThreeDTab } from './tabs/ThreeDTab'
import { CollectionTab } from './tabs/CollectionTab'
import { PuzzleScreen } from './puzzle/PuzzleScreen'
import { Puzzle3D } from './three/Puzzle3D'
import { PieceCountModal } from './ui/PieceCountModal'
import { Icon } from './ui/common'

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

  if (play?.kind === '2d') return <PuzzleScreen imageId={play.imageId} cols={play.cols} rows={play.rows} onExit={exit} />
  if (play?.kind === '3d') return <Puzzle3D modelId={play.model} count={play.count} onExit={exit} />

  return (
    <div className="tisch flex h-full flex-col flach:flex-row-reverse">
      <main className="einblenden scroll-y safe-t min-h-0 min-w-0 flex-1" key={`${tab}-${visit}`}>
        {tab === 'puzzles' && <PuzzlesTab onPick={setPick} />}
        {tab === '3d' && <ThreeDTab onPlay={(model, count) => start({ kind: '3d', model, count })} />}
        {tab === 'sammlung' && (
          <CollectionTab
            onResume={(g) => start({ kind: '2d', imageId: g.imageId, cols: g.cols, rows: g.rows })}
            onPick={setPick}
            onResume3D={(model, count) => start({ kind: '3d', model, count })}
            goPuzzles={() => setTab('puzzles')}
          />
        )}
      </main>

      <nav className="safe-b flex flex-none bg-[rgba(248,240,228,0.72)] shadow-[0_-6px_12px_-10px_rgba(40,24,10,0.4)] backdrop-blur-sm flach:w-[92px] flach:flex-col flach:shadow-[6px_0_12px_-10px_rgba(40,24,10,0.4)]" aria-label="Bereiche">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}
            className={`flex min-h-[68px] flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-center text-[17px] font-semibold leading-tight transition-colors duration-200 flach:text-[14px] ${tab === t.id ? 'bg-green text-white' : 'text-ink'}`}>
            <Icon name={t.icon} size={32} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {pick && <PieceCountModal imageId={pick} onClose={() => setPick(null)} onStart={(cols, rows) => start({ kind: '2d', imageId: pick, cols, rows })} />}
    </div>
  )
}
