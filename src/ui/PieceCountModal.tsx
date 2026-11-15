import { useEffect, useState } from 'react'
import { type Game, all, gameId, imageInfo } from '../db'
import { Modal, SIZES, grid } from './common'

interface Props { imageId: string; onStart: (cols: number, rows: number) => void; onClose: () => void }

/** Auswahl der Teilezahl vor jedem Puzzle. Angefangene Größen zeigen ihren Stand. */
export function PieceCountModal({ imageId, onStart, onClose }: Props) {
  const [info, setInfo] = useState<{ title: string; thumb: string } | null>(null)
  const [aspect, setAspect] = useState(4 / 3)
  const [saved, setSaved] = useState<Record<string, number>>({})

  useEffect(() => {
    let dead = false
    void imageInfo(imageId).then((i) => {
      if (dead || !i) return
      setInfo(i)
      const im = new Image()
      im.onload = () => { if (!dead && im.naturalHeight) setAspect(im.naturalWidth / im.naturalHeight) }
      im.src = i.thumb
    })
    void all<Game>('games').then((gs) => {
      if (dead) return
      const m: Record<string, number> = {}
      for (const g of gs) if (g.imageId === imageId && !g.done && g.state) m[g.id] = g.percent
      setSaved(m)
    })
    return () => { dead = true }
  }, [imageId])

  return (
    <Modal title="Wie viele Teile?" onClose={onClose} wide>
      {info && (
        <div className="mb-4 flex items-center gap-4">
          <img src={info.thumb} alt="" className="h-24 w-32 rounded-lg border border-black/15 object-cover" draggable={false} />
          <div className="min-w-0">
            <div className="truncate text-[22px] font-bold">{info.title}</div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SIZES.map((s) => {
          const [c, r] = grid(s.count, aspect)
          const pct = saved[gameId(imageId, c, r)]
          return (
            <button key={s.count} className={`btn flex-col !gap-0 !py-3 ${pct !== undefined ? 'btn-on' : ''}`} onClick={() => onStart(c, r)}>
              <span className="text-[26px] font-bold leading-tight">{c * r} Teile</span>
              <span className="text-[18px] font-normal opacity-90">{pct !== undefined ? `${pct}% fertig, weiter` : `${c} × ${r}, ${s.level}`}</span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
