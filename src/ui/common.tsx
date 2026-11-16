import type { ReactNode } from 'react'

const P: Record<string, ReactNode> = {
  puzzle: <path d="M9 4h2.2a2 2 0 1 1 3.6 0H17a2 2 0 0 1 2 2v2.2a2 2 0 1 0 0 3.6V15a2 2 0 0 1-2 2h-2.2a2 2 0 1 0-3.6 0H9a2 2 0 0 1-2-2v-2.2a2 2 0 1 1 0-3.6V6a2 2 0 0 1 2-2z" transform="translate(-1 1.5)" />,
  cube: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4v3h-4z" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  frame: <><rect x="3.5" y="3.5" width="17" height="17" rx="1.5" /><rect x="8" y="8" width="8" height="8" strokeDasharray="2 2.4" /></>,
  tidy: <><rect x="4" y="4" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" /></>,
  zoomin: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5M11 8v6M8 11h6" /></>,
  zoomout: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5M8 11h6" /></>,
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  sound: <><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></>,
  mute: <><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></>,
  trash: <path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7M10 10.5v6M14 10.5v6" />,
  bulb: <><path d="M9 17h6M10 20h4" /><path d="M12 3.5a6 6 0 0 0-3.6 10.8c.5.4.8 1 .8 1.7V17h5.6v-1c0-.7.3-1.3.8-1.7A6 6 0 0 0 12 3.5z" /></>,
  reset: <><path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" /><path d="M4.5 4.5v4.2h4.2" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.5 3.5 8.5s-1 5.9-3.5 8.5M12 3.5C9.5 6.1 8.5 9 8.5 12s1 5.9 3.5 8.5" /></>,
  photos: <><rect x="3.5" y="6.5" width="14" height="13" rx="1.5" /><path d="M7 6.5V4.5h13.5V16H17.5M3.5 16l4.5-4 3.5 3 2.5-2 3.5 3" /></>,
}

export function Icon({ name, size = 28 }: { name: keyof typeof P | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      {P[name]}
    </svg>
  )
}

export function Logo({ size = 40, animated = false }: { size?: number; animated?: boolean }) {
  return <img src="logo.jpg" alt="Puzzlestube Logo" width={size} height={size} className={animated ? 'schrei' : ''} style={{ borderRadius: size * 0.22, boxShadow: '0 3px 10px rgba(50,30,10,0.22)' }} draggable={false} />
}

/** Ladeanzeige im screame-Stil: der Mund pulsiert, darunter steht, was gerade passiert. */
export function Loading({ text }: { text: string }) {
  return (
    <div className="einblenden tisch absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 px-6 text-center" role="status">
      <Logo size={Math.round(Math.min(260, Math.min(window.innerWidth * 0.5, window.innerHeight * 0.36)))} animated />
      <div className="h2">{text}</div>
      <div className="text-ink2">Puzzlestube von screame</div>
    </div>
  )
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="abdunkeln fixed inset-0 z-50 flex items-end justify-center bg-[rgba(43,33,24,0.55)] sm:items-center" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className={`rauf card scroll-y max-h-[94dvh] w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-xl'} rounded-b-none p-5 sm:rounded-b-2xl`}
        style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="h2">{title}</h2>
          <button className="btn !px-3" onClick={onClose} aria-label="Schließen"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Confirm({ title, text, yes, onYes, onNo }: { title: string; text: string; yes: string; onYes: () => void; onNo: () => void }) {
  return (
    <Modal title={title} onClose={onNo}>
      <p className="mb-5 text-[20px]">{text}</p>
      <div className="flex flex-wrap gap-3">
        <button className="btn flex-1" onClick={onNo}>Abbrechen</button>
        <button className="btn btn-danger flex-1" onClick={onYes}>{yes}</button>
      </div>
    </Modal>
  )
}

export function Bar({ percent }: { percent: number }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-md bg-wood-dark" aria-hidden="true">
      <div className="h-full bg-green transition-[width] duration-500 ease-out" style={{ width: `${percent}%` }} />
    </div>
  )
}

export const SIZES: { count: number; n: number; level: string }[] = [
  { count: 36, n: 6, level: 'Leicht' },
  { count: 64, n: 8, level: 'Leicht' },
  { count: 100, n: 10, level: 'Mittel' },
  { count: 144, n: 12, level: 'Mittel' },
  { count: 225, n: 15, level: 'Schwer' },
  { count: 400, n: 20, level: 'Schwer' },
  { count: 576, n: 24, level: 'Sehr schwer' },
  { count: 1000, n: 0, level: 'Für Könner' },
]
/** Raster zu einer Teilezahl, passend zum Bildformat (Breite durch Höhe), damit die Teile
 *  ungefähr quadratisch werden und nicht in die Länge gezogen. Die Teilezahl ist danach ungefähr
 *  die gewünschte (z. B. 35 statt 36), angezeigt wird immer die echte. */
export function grid(count: number, aspect: number): [number, number] {
  const a = Math.min(4, Math.max(0.25, aspect || 1))
  let best: [number, number] = [1, count], score = Infinity
  for (let cols = 2; cols <= count; cols++) {
    const rows = Math.max(2, Math.round(count / cols))
    // Abweichung der Teileform von quadratisch plus Abweichung von der Wunschzahl
    const shape = Math.abs(Math.log((a / cols) * rows))
    const off = Math.abs(cols * rows - count) / count
    const sc = shape + off * 3
    if (sc < score) { score = sc; best = [cols, rows] }
  }
  return best
}
