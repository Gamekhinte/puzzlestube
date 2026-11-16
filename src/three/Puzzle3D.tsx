import { useEffect, useRef, useState } from 'react'
import { Stage3D, type ThumbSheet } from './stage'
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
  const [sheet, setSheet] = useState<ThumbSheet | null>(null)
  // Bildgröße in der Leiste: im flachen Querformat kleiner (passt zu .teil3d in index.css)
  const flachQuery = '(orientation: landscape) and (max-height: 520px)'
  const [teilPx, setTeilPx] = useState(() => (window.matchMedia(flachQuery).matches ? 58 : 80))
  useEffect(() => { const mq = window.matchMedia(flachQuery); const on = () => setTeilPx(mq.matches ? 58 : 80); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on) }, [])
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
  // echte Teilezahl kann um ein, zwei Teile abweichen (sehr kleine Reste fallen weg)
  const [total, setTotal] = useState(count)

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
        stage = await Stage3D.create(canvasRef.current, model.id, count)
        if (dead) { stage.dispose(); stage = null; return }
        const n = stage.count
        setTotal(n)
        stageRef.current = stage
        if (import.meta.env.DEV) (window as unknown as { __stage: Stage3D }).__stage = stage
        setSheet(stage.thumbs(n > 60 ? 112 : 180))
        const placed = old && !old.done ? old.placed : []
        for (let i = 0; i + 1 < placed.length; i += 2) if (placed[i] < n && placed[i] === placed[i + 1]) stage.fill(placed[i], placed[i], false)
        const used = new Set(stage.slots.filter((s): s is number => s !== null))
        const order = Array.from({ length: n }, (_, i) => i).filter((i) => !used.has(i))
        const r = rng(count * 7919 + model.id.length * 131 + round)
        await new Promise((ok) => setTimeout(ok, 0))
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
            click(); try { navigator.vibrate?.(15) } catch { /* nicht überall */ }
            select(null); setMsg('')
            setTray((t) => t.filter((p) => p !== piece))
            const finished = stage.slots.every((s) => s !== null)
            save(finished)
            if (finished) { setDone(true); stage.celebrate(); fanfare() }
          } else if (res === 'wrong') {
            setMsg('Passt hier nicht. Die Glühbirne zeigt die Stelle.'); setBad((n) => n + 1)
          } else {
            setMsg('Auf das Modell tippen.')
          }
        }
        stage.onTap = (x, y) => {
          const p = selRef.current
          if (p === null) setMsg('Erst unten ein Teil wählen.')
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

  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(''), 3500); return () => clearTimeout(t) }, [msg, bad])

  const placedCount = total - tray.length
  const hintText = done ? '' : msg

  return (
    <div className="einblenden tisch fixed inset-0 flex flex-col">
      {/* schlanke Kopfzeile direkt auf dem Holz, Werkzeuge nur als Icons */}
      <header className="safe-t z-10">
        <div className="flex items-center gap-2 px-2 pb-1 pt-2">
          <button className="ibtn" onClick={() => onExit()} aria-label="Zurück" title="Zurück"><Icon name="back" /></button>
          <div className="min-w-0 flex-1 px-1">
            <div className="truncate text-[19px] font-bold leading-tight">{model.name}</div>
            <div className="text-[16px] leading-tight text-ink2">{loading ? `${total} Teile` : `${placedCount} / ${total}`}</div>
          </div>
          <button className="ibtn" disabled={sel === null || done} aria-label="Tipp" title="Tipp" onClick={() => { if (sel !== null) { stageRef.current?.hint(sel); setMsg('') } }}><Icon name="bulb" /></button>
          <button className="ibtn" onClick={() => stageRef.current?.resetView()} aria-label="Ansicht zurücksetzen" title="Ansicht zurücksetzen"><Icon name="fit" /></button>
          <button className="ibtn" onClick={() => setAsk(true)} aria-label="Neu beginnen" title="Neu beginnen"><Icon name="reset" /></button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="no-touch absolute inset-0 h-full w-full" aria-label="3D-Modell" />
        {hintText && !loading && !error && (
          <div key={bad} className={`pointer-events-none absolute left-1/2 top-2 max-w-[90%] -translate-x-1/2 rounded-xl bg-white/90 px-4 py-2 text-center text-[18px] shadow-sm ${msg && bad ? 'wackel' : ''}`} role="status">{hintText}</div>
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
            <div className="h1 mb-4">Geschafft!</div>
            <div className="flex flex-wrap gap-3">
              <button className="btn flex-1" onClick={() => onExit()}>Weitere 3D-Puzzles</button>
              <button className="btn btn-primary flex-1" onClick={() => onExit('sammlung')}>Zur Sammlung</button>
            </div>
          </div>
        )}
      </div>

      {!done && !error && (
        <div className="safe-b bg-[rgba(248,240,228,0.55)] shadow-[0_-6px_10px_-8px_rgba(40,24,10,0.35)]">
          <div className="ohne-leiste flex gap-2 overflow-x-auto p-2" style={{ touchAction: 'pan-x', overscrollBehavior: 'contain' }}>
            {tray.map((p) => (
              <button key={p} onPointerDown={(e) => startDrag(p, e)} aria-label={`Teil ${p + 1}`} aria-pressed={sel === p}
                className={`teil3d flex flex-none items-center justify-center rounded-xl border-[3px] bg-white/60 transition-colors ${sel === p ? 'border-green bg-white' : 'border-transparent'}`} style={{ touchAction: 'pan-x' }}>
                {sheet && <Teilbild sheet={sheet} i={p} px={teilPx} />}
              </button>
            ))}
            
          </div>
        </div>
      )}

      {drag && sheet && (
        <div className="pointer-events-none fixed z-50" style={{ left: drag.x - 60, top: drag.y - 96 }}><Teilbild sheet={sheet} i={drag.piece} px={120} /></div>
      )}
      {ask && (
        <Confirm title="Neu beginnen?" text="Alle Teile kommen zurück in die Leiste." yes="Ja, neu beginnen" onNo={() => setAsk(false)}
          onYes={() => { setAsk(false); freshRef.current = true; void put('games3d', { id, model: model.id, count, placed: [], done: false, updatedAt: Date.now() } satisfies Game3D); setRound((n) => n + 1) }} />
      )}
    </div>
  )
}

/** Bild eines Teils, direkt vom Bogen abgezeichnet (ohne Umweg über eine Bilddatei). */
function Teilbild({ sheet, i, px }: { sheet: ThumbSheet; i: number; px: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = Math.round(px * dpr); cv.height = Math.round(px * dpr)
    const c = cv.getContext('2d')!
    c.imageSmoothingQuality = 'high'
    c.drawImage(sheet.canvas, (i % sheet.cols) * sheet.size, Math.floor(i / sheet.cols) * sheet.size, sheet.size, sheet.size, 0, 0, cv.width, cv.height)
  }, [sheet, i, px])
  return <canvas ref={ref} className="teilbild pointer-events-none block" style={{ width: px, height: px }} />
}
