// Holztisch: eine kachelbare Maserung, einmal beim Start gezeichnet.
// Keine Bilddatei nötig, dadurch auch offline sofort da.
import { rng } from './puzzle/engine'

export function makeWood() {
  const S = 512, PL = 4, ph = S / PL
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const c = cv.getContext('2d')!
  const r = rng(20261115)
  for (let p = 0; p < PL; p++) {
    const y0 = p * ph
    // jede Diele hat ihren eigenen Grundton
    const tone = (r() - 0.5) * 10
    c.fillStyle = `rgb(${226 + tone},${207 + tone},${178 + tone})`
    c.fillRect(0, y0, S, ph)
    c.save()
    c.beginPath(); c.rect(0, y0, S, ph); c.clip()
    // breite, weiche Jahresringe
    for (let i = 0; i < 9; i++) {
      const y = y0 + r() * ph, amp = 3 + r() * 9, k = 1 + ((r() * 2) | 0), ph0 = r() * 6.28
      c.strokeStyle = `rgba(150,105,60,${0.05 + r() * 0.08})`
      c.lineWidth = 3 + r() * 9
      c.beginPath()
      for (let x = -8; x <= S + 8; x += 8) c.lineTo(x, y + amp * Math.sin((x / S) * 6.283 * k + ph0))
      c.stroke()
    }
    // feine Fasern
    for (let i = 0; i < 260; i++) {
      const y = y0 + r() * ph, x = r() * S, len = 40 + r() * 220, dark = r() < 0.7
      c.strokeStyle = dark ? `rgba(120,80,40,${0.04 + r() * 0.09})` : `rgba(255,246,228,${0.05 + r() * 0.1})`
      c.lineWidth = 0.6 + r() * 1.1
      for (const off of [0, -S]) { c.beginPath(); c.moveTo(x + off, y); c.lineTo(x + off + len, y + (r() - 0.5) * 2.5); c.stroke() }
    }
    c.restore()
    // Fuge zwischen den Dielen
    c.fillStyle = 'rgba(90,58,28,0.28)'; c.fillRect(0, y0, S, 1.5)
    c.fillStyle = 'rgba(255,248,232,0.35)'; c.fillRect(0, y0 + 1.5, S, 1)
  }
  document.documentElement.style.setProperty('--holz', `url(${cv.toDataURL('image/jpeg', 0.9)})`)
}
