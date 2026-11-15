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

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('sw.js') })
}
