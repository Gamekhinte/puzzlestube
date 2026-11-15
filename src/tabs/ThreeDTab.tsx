import { useEffect, useState } from 'react'
import { MODELS, MODEL_CATS } from '../three/models'
import { modelThumbs } from '../three/stage'
import { type Game3D, all } from '../db'

export function ThreeDTab({ onPlay }: { onPlay: (model: string, count: number) => void }) {
  const [count, setCount] = useState<number>(() => { try { const n = Number(localStorage.getItem('stufe3d')); return [12, 24, 200].includes(n) ? n : 12 } catch { return 12 } })
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, number>>({})

  useEffect(() => {
    let live = true
    const t = setTimeout(() => setThumbs(modelThumbs((r) => { if (live) setThumbs(r) })), 30)
    void all<Game3D>('games3d').then((gs) => {
      const m: Record<string, number> = {}
      for (const g of gs) if (!g.done && g.placed.length) m[g.id] = Math.round((g.placed.length / 2 / g.count) * 100)
      if (live) setSaved(m)
    })
    return () => { live = false; clearTimeout(t) }
  }, [])

  const pick = (n: number) => { setCount(n); try { localStorage.setItem('stufe3d', String(n)) } catch { /* egal */ } }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-5">
      <h1 className="h1 mb-1">3D Puzzles</h1>
      <p className="mb-5 text-[19px] text-ink2">Baue ein Modell aus einzelnen Teilen zusammen. Mit einem Finger drehst du es.</p>

      <div className="mb-6">
        <div className="mb-2 text-[20px] font-semibold">Schwierigkeit</div>
        <div className="grid max-w-2xl grid-cols-3 gap-3" role="radiogroup" aria-label="Schwierigkeit">
          {[[12, 'Einfach'], [24, 'Mittel'], [200, 'Schwer']].map(([n, label]) => (
            <button key={n} role="radio" aria-checked={count === n} className={`btn flex-col !gap-0 !py-3 ${count === n ? 'btn-on' : ''}`} onClick={() => pick(n as number)}>
              <span className="text-[22px] font-bold">{label}</span>
              <span className="text-[18px] font-normal">{n} Teile</span>
            </button>
          ))}
        </div>
      </div>

      {MODEL_CATS.map((cat) => (
        <section key={cat} className="mb-8">
          <h2 className="h2 mb-3">{cat}</h2>
          <div className="reihe grid grid-cols-2 gap-4 lg:grid-cols-4">
            {MODELS.filter((m) => m.cat === cat).map((m) => {
              const pct = saved[`${m.id}|${count}`]
              return (
                <button key={m.id} className="kachel card overflow-hidden p-0 text-left" onClick={() => onPlay(m.id, count)}>
                  <div className="aspect-[4/3] w-full bg-wood">
                    {thumbs[m.id] && <img src={thumbs[m.id]} alt="" className="bild h-full w-full object-contain" draggable={false} onLoad={(e) => e.currentTarget.classList.add('da')} ref={(el) => { if (el?.complete && el.naturalWidth) el.classList.add('da') }} />}
                  </div>
                  <div className="px-3 py-2.5">
                    <div className="text-[20px] font-semibold leading-tight">{m.name}</div>
                    <div className="text-[18px] text-ink2">{pct !== undefined ? `${pct}% fertig, weiterbauen` : m.text}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
