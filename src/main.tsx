import { StrictMode } from 'react'
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
const show = () => createRoot(root).render(<StrictMode><App /></StrictMode>)
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
