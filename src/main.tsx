import { Component, type ReactNode, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { makeWood } from './wood'
import { cleanOldGames } from './db'

makeWood()
void cleanOldGames()

// Den screame-Startbildschirm kurz stehen lassen, dann die App zeigen.
const started = performance.now()
const root = document.getElementById('root')!
class Fehlergrenze extends Component<{ children: ReactNode }, { err: string }> {
  state = { err: '' }
  static getDerivedStateFromError(e: unknown) { return { err: String((e as Error)?.message || e) } }
  componentDidCatch(e: unknown) { (window as unknown as { __zeigeFehler?: (m: string) => void }).__zeigeFehler?.('App: ' + String((e as Error)?.message || e)) }
  render() { return this.state.err ? <div style={{ padding: 24, fontSize: 20 }}>Die Puzzlestube konnte nicht starten.</div> : this.props.children }
}
const show = () => createRoot(root).render(<StrictMode><Fehlergrenze><App /></Fehlergrenze></StrictMode>)
setTimeout(show, Math.max(0, 900 - (performance.now() - started)))

// Kein Zoomen der ganzen Seite per Doppeltipp oder Geste, das stört beim Puzzeln.
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener('contextmenu', (e) => e.preventDefault())
document.addEventListener('dblclick', (e) => e.preventDefault())
// Zoomen mit zwei Fingern nur im Puzzle selbst, nicht für die ganze Seite
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 && e.cancelable) e.preventDefault() }, { passive: false })

// Nur beim Entwickeln: ?vorschauBauen rendert alle 3D-Vorschaubilder neu und legt sie in public/modelle ab.
if (import.meta.env.DEV && location.search.includes('vorschauBauen')) {
  void (async () => {
    const [{ MODELS }, { renderPreview }] = await Promise.all([import('./three/models'), import('./three/stage')])
    for (const m of MODELS) {
      const blob = await renderPreview(m.id)
      if (blob) await fetch(`/__vorschau/${m.id}`, { method: 'POST', body: blob })
    }
    document.title = 'Vorschau fertig'
  })()
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('sw.js').then((r) => r.update()).catch(() => {}) })
  // Nach einem Update übernimmt der neue Service Worker: einmal neu laden, damit alles zusammenpasst.
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !navigator.serviceWorker.controller) return
    reloaded = true
    location.reload()
  })
}
