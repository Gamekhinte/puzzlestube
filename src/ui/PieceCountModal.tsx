import { useEffect, useState } from 'react'
import { type Game, all, gameId, imageInfo } from '../db'
import { Icon, Modal, SIZES, grid } from './common'
import { ImageViewer } from './ImageViewer'

interface Props { imageId: string; onStart: (cols: number, rows: number) => void; onClose: () => void }

/** Auswahl der Teilezahl vor jedem Puzzle. Angefangene Größen zeigen ihren Stand. */
export function PieceCountModal({ imageId, onStart, onClose }: Props) {
  const [info, setInfo] = useState<{ title: string; thumb: string } | null>(null)
  const [aspect, setAspect] = useState(4 / 3)
  const [saved, setSaved] = useState<Record<string, number>>({})
  const [big, setBig] = useState(false)

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
        <div className="mb-4">
          {/* antippen: Bild in voller Größe ansehen */}
          <button className="relative mb-2 block w-full" onClick={() => setBig(true)} aria-label="Bild groß ansehen" title="Bild groß ansehen">
            <img src={info.thumb} alt="" className="max-h-[200px] w-full rounded-xl object-cover" draggable={false} />
            <span className="absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-lg bg-[#fffdf8]/90 text-ink shadow-sm"><Icon name="zoomin" size={22} /></span>
          </button>
          <div className="truncate text-[21px] font-bold">{info.title}</div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SIZES.map((s) => {
          const [c, r] = grid(s.count, aspect)
          const pct = saved[gameId(imageId, c, r)]
          return (
            <button key={s.count} className={`btn flex-col !gap-0 !py-3 ${pct !== undefined ? 'btn-on' : ''}`} onClick={() => onStart(c, r)}>
              <span className="text-[26px] font-bold leading-tight">{c * r} Teile</span>
              <span className="text-[16px] font-normal opacity-90">{pct !== undefined ? `${pct}%, weiter` : s.level}</span>
            </button>
          )
        })}
      </div>
      {big && <ImageViewer imageId={imageId} title={info?.title} onClose={() => setBig(false)} />}
    </Modal>
  )
}
