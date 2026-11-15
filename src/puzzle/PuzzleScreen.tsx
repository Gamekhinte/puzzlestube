import { useEffect, useRef, useState } from 'react'
import { PuzzleEngine } from './engine'
import { type Game, del, gameId, get, imageInfo, loadImage, put } from '../db'
import { Confirm, Icon, Loading, Modal } from '../ui/common'
import { click, fanfare, setSound, soundOn } from '../sound'

interface Props { imageId: string; cols: number; rows: number; onExit: (to?: 'sammlung') => void }

export function PuzzleScreen({ imageId, cols, rows, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<PuzzleEngine | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [percent, setPercent] = useState(0)
  const [done, setDone] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [preview, setPreview] = useState(false)
  const [edges, setEdges] = useState(false)
  const [menu, setMenu] = useState(false)
  const [askRestart, setAskRestart] = useState(false)
  const [sound, setSnd] = useState(soundOn())
  const [round, setRound] = useState(0) // erhöht sich bei "Neu beginnen"
  const freshRef = useRef(false)

  useEffect(() => {
    let dead = false
    let engine: PuzzleEngine | null = null
    let timer = 0
    let game: Game | null = null
    setLoading(true); setDone(false); setShowDone(false); setPreview(false); setEdges(false)

    const save = () => {
      if (!engine || !game) return
      clearTimeout(timer); timer = 0
      if (game.done) {
        // Fertige Puzzles wandern als Pokal in die Sammlung, der Spielstand wird frei für eine neue Runde.
        void put('games', { ...game, id: 'fertig|' + game.id, state: null, percent: 100, updatedAt: Date.now() })
        void del('games', game.id)
        return
      }
      game.state = engine.serialize()
      game.updatedAt = Date.now()
      void put('games', game)
    }
    const hidden = () => { if (document.visibilityState === 'hidden') save() }

    ;(async () => {
      try {
        const id = gameId(imageId, cols, rows)
        const [img, info, old] = await Promise.all([loadImage(imageId), imageInfo(imageId), get<Game>('games', id)])
        if (dead) return
        // kurz warten, damit die Ladeanzeige sicher zu sehen ist, bevor die Teile geschnitten werden
        await new Promise((r) => setTimeout(r, 60))
        if (dead || !canvasRef.current) return
        const resume = !freshRef.current && old && !old.done && old.state ? old : null
        freshRef.current = false
        game = resume ?? {
          id, imageId, title: info?.title ?? 'Puzzle', thumb: info?.thumb ?? '', cols, rows,
          seed: (Math.random() * 2 ** 31) | 0, state: null, percent: 0, done: false, updatedAt: Date.now(),
        }
        setTitle(game.title)
        let first = true
        engine = new PuzzleEngine(canvasRef.current, img, {
          cols, rows, seed: game.seed, saved: resume?.state,
          onProgress: (p, d) => {
            if (dead) return
            setPercent(p)
            if (game) { game.percent = p; game.done = d }
            if (d && !first) { setDone(true); setShowDone(true); fanfare(); setTimeout(save, 0) }
          },
          onSnap: click,
          onDirty: () => { if (!timer) timer = window.setTimeout(save, 400) },
        })
        first = false
        engineRef.current = engine
        if (import.meta.env.DEV) (window as unknown as { __eng: PuzzleEngine }).__eng = engine // nur zum Testen
        save()
        setLoading(false)
      } catch (e) {
        if (!dead) { setError(e instanceof Error ? e.message : 'Das Puzzle konnte nicht geladen werden.'); setLoading(false) }
      }
    })()

    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('pagehide', save)
    return () => {
      dead = true
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('pagehide', save)
      save()
      engine?.destroy()
      engineRef.current = null
    }
  }, [imageId, cols, rows, round])

  const restart = () => {
    setAskRestart(false); setMenu(false)
    freshRef.current = true
    setRound((n) => n + 1)
  }

  const eng = engineRef.current
  const tool = 'btn flex-1 !px-2 sm:flex-none sm:!px-4'

  return (
    <div className="einblenden tisch fixed inset-0 flex flex-col">
      <header className="safe-t z-10 border-b border-black/15 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 p-2">
          <button className="btn !px-3" onClick={() => onExit()}><Icon name="back" /><span>Zurück</span></button>
          <div className="min-w-0 flex-1 px-1">
            <div className="truncate text-[20px] font-bold leading-tight">{title || 'Puzzle'}</div>
            <div className="text-[18px] text-ink2">{cols * rows} Teile, {percent}% fertig</div>
          </div>
          <button className="btn !px-3" onClick={() => setMenu(true)} aria-label="Menü"><Icon name="menu" /><span className="hidden sm:inline">Menü</span></button>
          <div className="flex w-full gap-2 lg:w-auto">
            <button className={`${tool} ${preview ? 'btn-on' : ''}`} aria-pressed={preview} onClick={() => { const v = !preview; setPreview(v); eng?.setPreview(v) }}>
              <Icon name="eye" /><span>Vorschau</span>
            </button>
            <button className={`${tool} ${edges ? 'btn-on' : ''}`} aria-pressed={edges} onClick={() => { const v = !edges; setEdges(v); eng?.setEdgesOnly(v) }}>
              <Icon name="frame" /><span>Nur Randteile</span>
            </button>
            <button className={tool} onClick={() => eng?.tidy()}>
              <Icon name="tidy" /><span>Aufräumen</span>
            </button>
          </div>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="no-touch absolute inset-0 h-full w-full" aria-label="Puzzlefläche" />
        {!loading && !error && (
          <div className="absolute right-3 top-3 flex flex-col gap-2">
            <button className="btn !px-0" onClick={() => eng?.zoomBy(1.4)} aria-label="Größer"><Icon name="zoomin" /></button>
            <button className="btn !px-0" onClick={() => eng?.zoomBy(1 / 1.4)} aria-label="Kleiner"><Icon name="zoomout" /></button>
            <button className="btn !px-0" onClick={() => eng?.fitAll()} aria-label="Alles zeigen"><Icon name="fit" /></button>
          </div>
        )}
        {loading && <Loading text="Dein Puzzle wird vorbereitet" />}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="h2">{error}</div>
            <button className="btn btn-primary" onClick={() => onExit()}>Zurück zur Auswahl</button>
          </div>
        )}
        {showDone && (
          <div className="rauf card safe-b absolute inset-x-3 bottom-3 mx-auto max-w-xl p-5 text-center">
            <div className="auftauchen mb-1 flex items-center justify-center gap-2 text-gold"><Icon name="trophy" size={36} /></div>
            <div className="h1 mb-1">Geschafft!</div>
            <p className="mb-4 text-[20px]">Das Puzzle ist fertig und liegt jetzt in deiner Sammlung.</p>
            <div className="flex flex-wrap gap-3">
              <button className="btn flex-1" onClick={() => setShowDone(false)}>Bild ansehen</button>
              <button className="btn btn-primary flex-1" onClick={() => onExit('sammlung')}>Zur Sammlung</button>
            </div>
          </div>
        )}
      </div>

      {menu && (
        <Modal title="Menü" onClose={() => setMenu(false)}>
          <div className="flex flex-col gap-3">
            <button className="btn justify-start" onClick={() => { const v = !sound; setSound(v); setSnd(v); if (v) click() }}>
              <Icon name={sound ? 'sound' : 'mute'} /><span>{sound ? 'Ton ist an' : 'Ton ist aus'}</span>
            </button>
            <button className="btn justify-start" onClick={() => { setMenu(false); eng?.fitBoard() }}>
              <Icon name="fit" /><span>Nur das Brett zeigen</span>
            </button>
            <button className="btn btn-danger justify-start" onClick={() => setAskRestart(true)}>
              <Icon name="reset" /><span>Neu beginnen</span>
            </button>
            <p className="text-[18px] text-ink2">Dein Stand wird von selbst gespeichert. Du kannst jederzeit aufhören und später weiterpuzzeln.</p>
            <p className="text-[18px] text-ink2">Die Teile liegen unten in der Leiste. Wische zum Blättern und ziehe ein Teil nach oben aufs Brett. Mit zwei Fingern ziehst du die Fläche größer.</p>
          </div>
        </Modal>
      )}
      {askRestart && (
        <Confirm title="Neu beginnen?" text={done ? 'Die Teile werden neu gemischt.' : 'Dein bisheriger Stand bei diesem Puzzle geht verloren. Die Teile werden neu gemischt.'} yes="Ja, neu beginnen" onYes={restart} onNo={() => setAskRestart(false)} />
      )}
    </div>
  )
}
