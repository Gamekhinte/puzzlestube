import { useEffect, useRef, useState } from 'react'
import { Stage3D } from './stage'
import { MODELS } from './models'
import { type Game3D, get, put } from '../db'
import { rng } from '../puzzle/engine'
import { Confirm, Icon, Loading } from '../ui/common'
import { click, fanfare } from '../sound'

interface Props { modelId: string; count: number; onExit: (to?: 'sammlung') => void }

export function Puzzle3D({ modelId, count, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<Stage3D | null>(null)
  const selRef = useRef<number | null>(null)
  const placeRef = useRef<(piece: number, x: number, y: number) => void>(() => {})
  const [thumbs, setThumbs] = useState<string[]>([])
  const [tray, setTray] = useState<number[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [bad, setBad] = useState(0)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState<{ piece: number; x: number; y: number } | null>(null)
  const [ask, setAsk] = useState(false)
  const [round, setRound] = useState(0)
  const freshRef = useRef(false)
  const model = MODELS.find((m) => m.id === modelId) ?? MODELS[0]
  const id = `${model.id}|${count}`
  const total = count

  const select = (p: number | null) => { selRef.current = p; setSel(p) }

  useEffect(() => {
    let dead = false
    let stage: Stage3D | null = null
    setLoading(true); setDone(false); setMsg(''); select(null)
    ;(async () => {
      try {
        const old = freshRef.current ? undefined : await get<Game3D>('games3d', id)
        freshRef.current = false
        await new Promise((r) => setTimeout(r, 40))
        if (dead || !canvasRef.current) return
        stage = new Stage3D(canvasRef.current, model.build(count))
        const n = stage.count
        stageRef.current = stage
        setThumbs(stage.thumbs(n > 60 ? 128 : 200))
        const placed = old && !old.done ? old.placed : []
        for (let i = 0; i + 1 < placed.length; i += 2) if (placed[i] < n && placed[i] === placed[i + 1]) stage.fill(placed[i], placed[i], false)
        const used = new Set(stage.slots.filter((s): s is number => s !== null))
        const order = Array.from({ length: n }, (_, i) => i).filter((i) => !used.has(i))
        const r = rng(count * 7919 + model.id.length * 131 + round)
        for (let i = order.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]] }
        setTray(order)

        const save = (isDone: boolean) => {
          const flat: number[] = []
          stage!.slots.forEach((p, s) => { if (p !== null) flat.push(s, p) })
          // Fertige Modelle bekommen einen eigenen Eintrag (Pokal), der Spielstand wird frei für eine neue Runde.
          if (isDone) void put('games3d', { id: 'fertig|' + id, model: model.id, count, placed: flat, done: true, updatedAt: Date.now() } satisfies Game3D)
          void put('games3d', { id, model: model.id, count, placed: isDone ? [] : flat, done: false, updatedAt: Date.now() } satisfies Game3D)
        }
        placeRef.current = (piece, x, y) => {
          if (!stage) return
          const res = stage.tryPlace(piece, x, y)
          if (res === 'ok') {
            click()
            select(null); setMsg('')
            setTray((t) => t.filter((p) => p !== piece))
            const finished = stage.slots.every((s) => s !== null)
            save(finished)
            if (finished) { setDone(true); stage.celebrate(); fanfare() }
          } else if (res === 'wrong') {
            setMsg('Hier passt das Teil nicht. Drehe das Modell, bis die richtige Stelle vorne ist. Der Knopf Tipp hilft dir.'); setBad((n) => n + 1)
          } else {
            setMsg('Tippe auf das Modell, dort wo das Teil hingehört.')
          }
        }
        stage.onTap = (x, y) => {
          const p = selRef.current
          if (p === null) setMsg('Wähle zuerst unten ein Teil aus.')
          else placeRef.current(p, x, y)
        }
        setLoading(false)
      } catch {
        if (!dead) { setError('Die 3D-Ansicht konnte auf diesem Gerät nicht gestartet werden.'); setLoading(false) }
      }
    })()
    return () => { dead = true; stage?.dispose(); stageRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, round])

  // Ziehen aus der Leiste aufs Modell
  const startDrag = (piece: number, e: React.PointerEvent) => {
    select(piece); setMsg('')
    const sx = e.clientX, sy = e.clientY, mouse = e.pointerType === 'mouse'
    let active = false
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy
      if (!active && (dy < -16 || (mouse && Math.hypot(dx, dy) > 10))) active = true
      if (active) setDrag({ piece, x: ev.clientX, y: ev.clientY })
    }
    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      setDrag(null)
      if (active && ev.type === 'pointerup') placeRef.current(piece, ev.clientX, ev.clientY - 36)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  const placedCount = total - tray.length
  const hintText = done ? '' : msg || (sel === null ? 'Tippe unten ein Teil an oder ziehe es auf das Modell. Mit einem Finger drehst du das Modell.' : 'Tippe jetzt auf die Stelle am Modell, an die das Teil gehört.')

  return (
    <div className="einblenden tisch fixed inset-0 flex flex-col">
      <header className="safe-t z-10 border-b border-black/15 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 p-2">
          <button className="btn !px-3" onClick={() => onExit()}><Icon name="back" /><span>Zurück</span></button>
          <div className="min-w-0 flex-1 px-1">
            <div className="truncate text-[20px] font-bold leading-tight">{model.name}</div>
            <div className="text-[18px] text-ink2">{loading ? `${total} Teile` : `${placedCount} von ${total} Teilen`}</div>
          </div>
          <button className="btn !px-3" disabled={sel === null || done} style={{ opacity: sel === null || done ? 0.45 : 1 }} onClick={() => { if (sel !== null) { stageRef.current?.hint(sel); setMsg('Das Modell dreht sich zur richtigen Stelle, sie leuchtet gelb.') } }}>
            <Icon name="bulb" /><span>Tipp</span>
          </button>
          <button className="btn !px-3" onClick={() => setAsk(true)} aria-label="Neu beginnen"><Icon name="reset" /><span className="hidden sm:inline">Neu</span></button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="no-touch absolute inset-0 h-full w-full" aria-label="3D-Modell" />
        {hintText && !loading && !error && (
          <div key={bad} className={`pointer-events-none absolute inset-x-3 top-3 mx-auto max-w-2xl rounded-xl border border-black/15 bg-white shadow-sm px-4 py-2.5 text-center text-[19px] ${msg && bad ? 'wackel' : ''}`} role="status">{hintText}</div>
        )}
        {!loading && !error && (
          <button className="btn absolute bottom-3 right-3 !px-3" onClick={() => stageRef.current?.resetView()} aria-label="Ansicht zurücksetzen"><Icon name="fit" /></button>
        )}
        {loading && <Loading text="Dein 3D-Puzzle wird vorbereitet" />}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="h2">{error}</div>
            <button className="btn btn-primary" onClick={() => onExit()}>Zurück zur Auswahl</button>
          </div>
        )}
        {done && (
          <div className="rauf card absolute inset-x-3 bottom-3 mx-auto max-w-xl p-5 text-center">
            <div className="auftauchen mb-1 flex justify-center text-gold"><Icon name="trophy" size={36} /></div>
            <div className="h1 mb-1">Geschafft!</div>
            <p className="mb-4 text-[20px]">{model.name} ist fertig gebaut.</p>
            <div className="flex flex-wrap gap-3">
              <button className="btn flex-1" onClick={() => onExit()}>Weitere 3D-Puzzles</button>
              <button className="btn btn-primary flex-1" onClick={() => onExit('sammlung')}>Zur Sammlung</button>
            </div>
          </div>
        )}
      </div>

      {!done && !error && (
        <div className="safe-b border-t border-black/15 bg-white">
          <div className="flex gap-3 overflow-x-auto p-3" style={{ touchAction: 'pan-x', overscrollBehavior: 'contain' }}>
            {tray.map((p) => (
              <button key={p} onPointerDown={(e) => startDrag(p, e)} aria-label={`Teil ${p + 1}`} aria-pressed={sel === p}
                className={`flex h-[104px] w-[104px] flex-none items-center justify-center rounded-xl border-4 bg-wood ${sel === p ? 'border-green' : 'border-line'}`} style={{ touchAction: 'pan-x' }}>
                {thumbs[p] && <img src={thumbs[p]} alt="" className="pointer-events-none h-[88px] w-[88px]" draggable={false} />}
              </button>
            ))}
            {!loading && tray.length === 0 && <div className="py-6 text-[19px] text-ink2">Alle Teile sind verbaut.</div>}
          </div>
        </div>
      )}

      {drag && thumbs[drag.piece] && (
        <img src={thumbs[drag.piece]} alt="" className="pointer-events-none fixed z-50 h-[120px] w-[120px]" style={{ left: drag.x - 60, top: drag.y - 96 }} />
      )}
      {ask && (
        <Confirm title="Neu beginnen?" text="Alle Teile kommen zurück in die Leiste." yes="Ja, neu beginnen" onNo={() => setAsk(false)}
          onYes={() => { setAsk(false); freshRef.current = true; void put('games3d', { id, model: model.id, count, placed: [], done: false, updatedAt: Date.now() } satisfies Game3D); setRound((n) => n + 1) }} />
      )}
    </div>
  )
}
