import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadImage } from '../db'
import { Icon, Loading } from './common'

/** Bild in voller Größe ansehen: mit zwei Fingern (oder Mausrad) zoomen, mit einem Finger verschieben,
 *  Doppeltipp wechselt zwischen ganzem Bild und Nahansicht. */
export function ImageViewer({ imageId, title, onClose }: { imageId: string; title?: string; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const holder = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)
  const view = useRef({ s: 1, x: 0, y: 0, fit: 1, w: 1, h: 1 })
  const cvRef = useRef<HTMLCanvasElement | null>(null)

  const apply = () => {
    const cv = cvRef.current
    if (!cv) return
    const v = view.current
    cv.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.s})`
  }
  const clamp = () => {
    const v = view.current, b = box.current!.getBoundingClientRect()
    v.s = Math.max(v.fit, Math.min(v.fit * 8, v.s))
    const w = v.w * v.s, h = v.h * v.s
    v.x = w <= b.width ? (b.width - w) / 2 : Math.min(0, Math.max(b.width - w, v.x))
    v.y = h <= b.height ? (b.height - h) / 2 : Math.min(0, Math.max(b.height - h, v.y))
  }
  const fit = () => {
    const v = view.current, b = box.current!.getBoundingClientRect()
    v.fit = Math.min(b.width / v.w, b.height / v.h)
    v.s = v.fit; clamp(); apply()
  }
  const zoomAt = (f: number, cx: number, cy: number) => {
    const v = view.current, b = box.current!.getBoundingClientRect()
    const px = cx - b.left, py = cy - b.top
    const wx = (px - v.x) / v.s, wy = (py - v.y) / v.s
    v.s *= f; v.s = Math.max(v.fit, Math.min(v.fit * 8, v.s))
    v.x = px - wx * v.s; v.y = py - wy * v.s
    clamp(); apply()
  }

  useEffect(() => {
    let dead = false
    loadImage(imageId).then((cv) => {
      if (dead || !holder.current) return
      cv.style.position = 'absolute'; cv.style.left = '0'; cv.style.top = '0'
      cv.style.transformOrigin = '0 0'; cv.style.width = `${cv.width}px`; cv.style.height = `${cv.height}px`
      cv.style.maxWidth = 'none'
      holder.current.appendChild(cv)
      cvRef.current = cv
      view.current.w = cv.width; view.current.h = cv.height
      fit(); setReady(true)
    }).catch(() => { if (!dead) setError(true) })
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const ro = new ResizeObserver(() => { if (cvRef.current) fit() })
    if (box.current) ro.observe(box.current)
    return () => { dead = true; window.removeEventListener('keydown', onKey); ro.disconnect(); cvRef.current?.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId])

  // Gesten
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef(0)
  const lastTap = useRef(0)
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId)
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.current.size === 2) { const [a, b] = [...pts.current.values()]; pinch.current = Math.hypot(a.x - b.x, a.y - b.y) }
    if (pts.current.size === 1) {
      const now = performance.now()
      if (now - lastTap.current < 300) {
        const v = view.current
        if (v.s > v.fit * 1.2) fit(); else zoomAt(3, e.clientX, e.clientY)
        lastTap.current = 0
      } else lastTap.current = now
    }
  }
  const onMove = (e: React.PointerEvent) => {
    const p = pts.current.get(e.pointerId)
    if (!p) return
    const dx = e.clientX - p.x, dy = e.clientY - p.y
    p.x = e.clientX; p.y = e.clientY
    if (pts.current.size >= 2) {
      const [a, b] = [...pts.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch.current) zoomAt(d / pinch.current, (a.x + b.x) / 2, (a.y + b.y) / 2)
      pinch.current = d
    } else {
      view.current.x += dx; view.current.y += dy; clamp(); apply()
    }
  }
  const onUp = (e: React.PointerEvent) => { pts.current.delete(e.pointerId); if (pts.current.size < 2) pinch.current = 0 }

  // direkt in den body, damit es über allem liegt (auch wenn das Fenster darunter verschoben ist)
  return createPortal(
    <div onClick={(e) => e.stopPropagation()} className="einblenden fixed inset-0 z-[60] flex flex-col bg-[#1f1913]">
      <div ref={box} className="no-touch relative min-h-0 flex-1 overflow-hidden" style={{ touchAction: 'none' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onWheel={(e) => zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY)}>
        <div ref={holder} className="absolute inset-0" />
        {!ready && !error && <Loading text="Bild wird geladen" />}
        {error && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[20px] text-white">Das Bild konnte nicht geladen werden.</div>}
      </div>
      <button className="ibtn safe-t absolute right-2 top-2 z-10 !h-11 !min-h-0 !w-11 !min-w-0" onClick={onClose} aria-label="Schließen" title="Schließen"><Icon name="close" size={20} /></button>
      {title && <div className="safe-b pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-4 pb-3 pt-8 text-[18px] font-semibold text-white">{title}</div>}
    </div>,
    document.body,
  )
}
