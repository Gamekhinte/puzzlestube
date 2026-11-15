// Kleine Töne direkt im Browser erzeugt, keine Sounddateien nötig.
let ac: AudioContext | null = null
let on = localStorage.getItem('ton') !== 'aus'

export const soundOn = () => on
export function setSound(v: boolean) { on = v; localStorage.setItem('ton', v ? 'an' : 'aus') }

function ctx() {
  if (!ac) {
    const A = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!A) return null
    ac = new A()
  }
  if (ac.state === 'suspended') void ac.resume()
  return ac
}

/** Leises, sattes Klicken beim Einrasten. */
export function click() {
  if (!on) return
  const a = ctx(); if (!a) return
  const t = a.currentTime
  const o = a.createOscillator(), g = a.createGain()
  o.type = 'triangle'
  o.frequency.setValueAtTime(880, t)
  o.frequency.exponentialRampToValueAtTime(240, t + 0.07)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11)
  o.connect(g).connect(a.destination)
  o.start(t); o.stop(t + 0.13)
}

/** Kurze Tonfolge, wenn ein Puzzle fertig ist. */
export function fanfare() {
  if (!on) return
  const a = ctx(); if (!a) return
  ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const t = a.currentTime + i * 0.14
    const o = a.createOscillator(), g = a.createGain()
    o.type = 'sine'; o.frequency.value = f
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
    o.connect(g).connect(a.destination)
    o.start(t); o.stop(t + 0.55)
  })
}
