// Zwanzig weitere 3D-Puzzles. Alles Drehkörper oder Kugeln, das Motiv wird im Code gemalt.
// Die Hilfen (rev, lathe, G, mat ...) kommen aus models.ts und werden nur in den Funktionen benutzt.
import * as THREE from 'three'
import { rng } from '../puzzle/engine'
import { type Built, type C, type Fn, type ModelDef, G, PI, TAU, V, lathe, mat, mesh, poly, rev, speckle } from './models'

// ---------- Hilfen ----------
const back = (color = 0xd9d3c8) => mat(color, 0.9, THREE.BackSide)
/** Kugel mit Radius R, Pole sind fest (Kappen), dazwischen das Puzzle. */
function sphere(count: number, R: number, paint: (c: C, w: number, h: number) => void, capTop: number, capBottom: number, statics: THREE.Object3D[] = [], P = 0.07): Built {
  const r = (t: number) => R * Math.sin(PI * t), y = (t: number) => R * Math.cos(PI * t)
  const { fn, nf } = rev(r, y, P, 1 - P)
  return {
    surfaces: [{ fn, nf, ...G(count, [4, 3], [6, 4], [20, 10]), wrap: true, tw: 2048, th: 1024, thick: 0.05, paint }],
    statics: [lathe(r, y, 0, P + 0.004, mat(capTop, 0.6), 8), lathe(r, y, 1 - P - 0.004, 1, mat(capBottom, 0.6), 8), mesh(new THREE.SphereGeometry(R - 0.06, 40, 24), back()), ...statics],
  }
}
/** Bild Punkt für Punkt malen: f bekommt die Richtung auf der Kugel. */
function pixels(c0: C, W: number, H: number, P: number, f: (x: number, y: number, z: number, u: number, v: number) => [number, number, number]) {
  // halbe Auflösung rechnen und hochskalieren, sonst dauert es auf dem Handy zu lange
  const w = W >> 1, h = H >> 1, off = document.createElement('canvas'); off.width = w; off.height = h
  const c = off.getContext('2d')!
  const img = c.createImageData(w, h), d = img.data
  for (let j = 0; j < h; j++) {
    const th = PI * (P + (1 - 2 * P) * ((j + 0.5) / h)), st = Math.sin(th), ct = Math.cos(th)
    for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w, a = (u - 0.5) * TAU
      const [r, g, b] = f(st * Math.sin(a), ct, st * Math.cos(a), u, j / h)
      const k = (j * w + i) * 4
      d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255
    }
  }
  c.putImageData(img, 0, 0)
  c0.imageSmoothingQuality = 'high'
  c0.drawImage(off, 0, 0, W, H)
}
/** Rundliche Flecken auf einer Kugelkarte (in x gestreckt, damit sie auf der Kugel rund sind). */
function blob(c: C, w: number, h: number, P: number, lon: number, lat: number, rad: number, col: string) {
  const v = ((90 - lat) / 180 - P) / (1 - 2 * P)
  const x = (lon / 360 + 0.5) * w, y = v * h, k = 1 / Math.max(0.2, Math.cos((lat * PI) / 180))
  c.fillStyle = col
  for (const dx of [-w, 0, w]) { c.beginPath(); c.ellipse(x + dx, y, (rad / 360) * w * k, (rad / 180) * h / (1 - 2 * P), 0, 0, TAU); c.fill() }
}
const noise = (seed: number) => { const r = rng(seed); const t = Array.from({ length: 512 }, () => r()); return (x: number) => { const i = Math.floor(x), f = x - i, a = t[i & 511], b = t[(i + 1) & 511]; return a + (b - a) * f * f * (3 - 2 * f) } }

// ================= Weltall =================
function paintMoon(c: C, w: number, h: number) {
  c.fillStyle = '#9d9a94'; c.fillRect(0, 0, w, h)
  speckle(c, w, h, 30000, ['rgba(0,0,0,0.06)', 'rgba(255,255,255,0.07)'], 81, 4)
  const r = rng(82)
  for (let i = 0; i < 9; i++) blob(c, w, h, 0.07, r() * 360 - 180, r() * 100 - 50, 10 + r() * 22, 'rgba(70,68,66,0.35)') // Meere
  for (let i = 0; i < 140; i++) {
    const lon = r() * 360 - 180, lat = r() * 150 - 75, rad = 0.8 + Math.pow(r(), 3) * 9
    blob(c, w, h, 0.07, lon, lat, rad * 1.15, 'rgba(220,218,212,0.35)')
    blob(c, w, h, 0.07, lon + rad * 0.12, lat - rad * 0.1, rad, 'rgba(60,58,55,0.45)')
    blob(c, w, h, 0.07, lon + rad * 0.2, lat - rad * 0.15, rad * 0.75, 'rgba(120,118,112,0.6)')
  }
}
function paintMars(c: C, w: number, h: number) {
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#c9876a'); g.addColorStop(0.5, '#b8552f'); g.addColorStop(1, '#c47a5c')
  c.fillStyle = g; c.fillRect(0, 0, w, h)
  speckle(c, w, h, 30000, ['rgba(80,30,10,0.10)', 'rgba(255,200,160,0.08)'], 91, 5)
  const r = rng(92)
  for (let i = 0; i < 26; i++) blob(c, w, h, 0.07, r() * 360 - 180, r() * 90 - 45, 6 + r() * 18, 'rgba(90,40,25,0.32)')
  c.strokeStyle = 'rgba(70,30,15,0.5)'; c.lineWidth = 10; c.beginPath(); c.moveTo(w * 0.42, h * 0.52); c.bezierCurveTo(w * 0.5, h * 0.5, w * 0.55, h * 0.56, w * 0.64, h * 0.54); c.stroke() // Canyon
  c.fillStyle = '#f3f0ea'; c.fillRect(0, 0, w, h * 0.05); c.fillRect(0, h * 0.96, w, h * 0.04)
  for (let i = 0; i < 40; i++) { c.beginPath(); c.ellipse(r() * w, h * 0.05, 30 + r() * 60, 12 + r() * 18, 0, 0, TAU); c.fill() }
}
function paintJupiter(c: C, w: number, h: number) {
  const bands = ['#e9dcc4', '#c99a6e', '#f1e6d2', '#b07a52', '#e7d4b4', '#9b6a48', '#efe2c8', '#c29266', '#e3d2b6', '#a8785a', '#eee0c8']
  const n = noise(5)
  for (let i = 0; i < bands.length; i++) {
    const y0 = (i / bands.length) * h, y1 = ((i + 1) / bands.length) * h
    c.fillStyle = bands[i]
    c.beginPath(); c.moveTo(0, y1)
    for (let x = 0; x <= w; x += 16) c.lineTo(x, y0 + (n(x / 90 + i * 13) - 0.5) * 34)
    c.lineTo(w, y1); c.closePath(); c.fill()
  }
  speckle(c, w, h, 20000, ['rgba(255,255,255,0.08)', 'rgba(90,50,20,0.07)'], 6, 6)
  c.save(); c.translate(w * 0.5, h * 0.64)
  c.fillStyle = '#d9cbb0'; c.beginPath(); c.ellipse(0, 0, 130, 62, 0, 0, TAU); c.fill()
  c.fillStyle = '#b8523a'; c.beginPath(); c.ellipse(0, 0, 110, 48, 0, 0, TAU); c.fill()
  c.fillStyle = '#cf6c4c'; c.beginPath(); c.ellipse(-8, -4, 70, 28, 0, 0, TAU); c.fill()
  c.restore()
}
function paintSaturn(c: C, w: number, h: number) {
  const bands = ['#efe3c2', '#e3cf9e', '#f3e9cc', '#d9bf88', '#ecdcb2', '#cfb27a', '#f1e5c6', '#dcc391']
  for (let i = 0; i < bands.length; i++) { c.fillStyle = bands[i]; c.fillRect(0, (i / bands.length) * h, w, h / bands.length + 1) }
  speckle(c, w, h, 16000, ['rgba(255,255,255,0.09)', 'rgba(120,90,40,0.06)'], 8, 8)
  c.fillStyle = 'rgba(160,140,100,0.25)'; c.fillRect(0, h * 0.49, w, h * 0.02)
}
function saturnRings() {
  const out: THREE.Object3D[] = []
  for (const [a, b, col, op] of [[1.32, 1.5, 0xcdb88a, 0.75], [1.52, 1.86, 0xe6d3a6, 0.9], [1.9, 1.96, 0xb19c74, 0.6], [2.0, 2.22, 0xd8c69c, 0.75]] as const) {
    const m = mesh(new THREE.RingGeometry(a, b, 96), new THREE.MeshStandardMaterial({ color: col, roughness: 0.8, side: THREE.DoubleSide, transparent: true, opacity: op }))
    m.rotation.x = -PI / 2 + 0.42
    out.push(m)
  }
  return out
}
const RK = (t: number) => (t < 0.32 ? 0.44 * Math.sin((t / 0.32) * PI / 2) ** 0.8 : 0.44)
const RKY = (t: number) => 1.55 - t * 2.9
function paintRocket(c: C, w: number, h: number) {
  const v = (t: number) => ((t - 0.05) / 0.95) * h
  c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, w, h)
  speckle(c, w, h, 6000, ['rgba(0,0,0,0.04)', 'rgba(255,255,255,0.5)'], 101, 3)
  c.fillStyle = '#c8362f'; c.fillRect(0, 0, w, v(0.2))
  for (const t of [0.5, 0.86]) { c.fillStyle = '#c8362f'; c.fillRect(0, v(t), w, h * 0.05) }
  c.fillStyle = '#2c5f8a'; c.fillRect(0, v(0.55), w, h * 0.02)
  // Bullauge vorne
  const x = w / 2, y = v(0.38)
  c.fillStyle = '#8a8f96'; c.beginPath(); c.ellipse(x, y, 92, 66, 0, 0, TAU); c.fill()
  const g = c.createRadialGradient(x - 20, y - 18, 8, x, y, 70); g.addColorStop(0, '#d8ecf6'); g.addColorStop(1, '#3b6f97')
  c.fillStyle = g; c.beginPath(); c.ellipse(x, y, 74, 52, 0, 0, TAU); c.fill()
  // Nieten und Schrift
  c.fillStyle = 'rgba(0,0,0,0.25)'
  for (let k = 0; k < 60; k++) for (const t of [0.3, 0.7]) { c.beginPath(); c.arc((k / 60) * w, v(t), 5, 0, TAU); c.fill() }
  c.fillStyle = '#2c3e55'; c.font = `700 ${Math.round(h * 0.06)}px Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.save(); c.translate(w / 2, v(0.72)); c.fillText('PUZZLE 1', 0, 0); c.restore()
}
function rakete(count: number): Built {
  const { fn, nf } = rev(RK, RKY, 0.05, 1)
  const red = mat(0xc8362f, 0.5)
  const statics: THREE.Object3D[] = [
    lathe(RK, RKY, 0, 0.054, red, 8),
    mesh(new THREE.CylinderGeometry(0.39, 0.39, 2.4, 40, 1, true).translate(0, RKY(0.6), 0), back()),
    mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.24, 32).translate(0, RKY(1) - 0.12, 0), mat(0x6f6f6f, 0.4)),
    mesh(new THREE.ConeGeometry(0.22, 0.5, 24).rotateX(PI).translate(0, RKY(1) - 0.48, 0), new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff7a1a, emissiveIntensity: 0.8, transparent: true, opacity: 0.85 })),
  ]
  for (let k = 0; k < 4; k++) {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.42, -0.35); s.lineTo(0.42, -0.62); s.lineTo(0, -0.45); s.closePath()
    const fin = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false }).translate(0.4, RKY(0.78), -0.02), red)
    fin.rotation.y = (k / 4) * TAU + PI / 4
    statics.push(fin)
  }
  return { surfaces: [{ fn, nf, ...G(count, [4, 3], [6, 4], [10, 20]), wrap: true, tw: 1600, th: 1600, thick: 0.05, paint: paintRocket }], statics }
}

// ================= Bälle =================
// erst bei Bedarf rechnen: V kommt aus models.ts und ist beim Laden noch nicht fertig
let icoCache: { v: THREE.Vector3; ref: THREE.Vector3; side: THREE.Vector3 }[] | null = null
const ico = () => icoCache ??= (() => {
  const p = (1 + Math.sqrt(5)) / 2, out: THREE.Vector3[] = []
  for (const a of [-1, 1]) for (const b of [-p, p]) out.push(V(0, a, b).normalize(), V(a, b, 0).normalize(), V(b, 0, a).normalize())
  return out.map((v) => { const n = out.filter((o) => o !== v).sort((x, y) => x.distanceTo(v) - y.distanceTo(v))[0]; const ref = n.clone().sub(v.clone().multiplyScalar(n.dot(v))).normalize(); return { v, ref, side: v.clone().cross(ref) } })
})()
function paintFootball(c: C, w: number, h: number) {
  const P = 0.07, R0 = 0.3, k = Math.cos(PI / 5), ICO = ico()
  pixels(c, w, h, P, (x, y, z) => {
    const d = V(x, y, z)
    let best = 9, second = 9, bi = 0
    ICO.forEach((o, i) => { const a = Math.acos(Math.min(1, d.dot(o.v))); if (a < best) { second = best; best = a; bi = i } else if (a < second) second = a })
    const o = ICO[bi], phi = Math.atan2(d.dot(o.side), d.dot(o.ref))
    const sector = (((phi % (TAU / 5)) + TAU / 5) % (TAU / 5)) - PI / 5
    const pent = best * Math.cos(sector) / k
    if (pent < R0) return [28, 28, 30]
    // Nähte: Kanten der Sechsecke grob nachgebildet
    if (Math.abs(pent - R0) < 0.016 || Math.abs(second - best) < 0.014) return [150, 150, 150]
    const shade = 236 + ((x * 37 + y * 53) % 1) * 0
    return [shade, shade, shade - 4]
  })
  speckle(c, w, h, 9000, ['rgba(0,0,0,0.03)', 'rgba(255,255,255,0.25)'], 111, 3)
}
function paintBasketball(c: C, w: number, h: number) {
  const e = 0.022
  pixels(c, w, h, 0.07, (x, y, z) => {
    if (Math.abs(x) < e || Math.abs(y) < e || Math.abs(Math.hypot(x, y) - 0.72) < e) return [30, 22, 18]
    const n = ((Math.sin(x * 400) * Math.sin(y * 410) * Math.sin(z * 390)) + 1) * 6
    return [214 - n, 106 - n, 38 - n * 0.4]
  })
}
function paintBeachball(c: C, w: number, h: number) {
  const cols = ['#c8362f', '#f4f1ea', '#2c5f8a', '#f4f1ea', '#e8a531', '#f4f1ea']
  for (let i = 0; i < 6; i++) { c.fillStyle = cols[i]; c.fillRect((i / 6) * w, 0, w / 6 + 1, h) }
  c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 3
  for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo((i / 6) * w, 0); c.lineTo((i / 6) * w, h); c.stroke() }
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.2)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.12)')
  c.fillStyle = g; c.fillRect(0, 0, w, h)
}

// ================= Matroschka =================
const MT = (t: number): [number, number] => {
  if (t < 0.4) { const th = (t / 0.4) * 0.82 * PI; return [0.5 * Math.sin(th), 0.62 + 0.5 * Math.cos(th)] }
  const s = (t - 0.4) / 0.6
  return [0.27 + 0.51 * Math.sin((Math.min(1, s / 0.7) * PI) / 2) - 0.06 * Math.max(0, (s - 0.7) / 0.3), 0.198 - s * 1.2]
}
function paintDoll(c: C, w: number, h: number) {
  const t0 = 0.05, v = (t: number) => ((t - t0) / (1 - t0)) * h
  c.fillStyle = '#c8362f'; c.fillRect(0, 0, w, h)
  // Kopftuch mit Punkten
  c.fillStyle = '#e8a531'; for (let i = 0; i < 70; i++) { const r = rng(i + 5); c.beginPath(); c.arc(r() * w, r() * v(0.36), 9, 0, TAU); c.fill() }
  // Gesicht vorne
  const fx = w / 2, fy = v(0.2)
  c.fillStyle = '#f6dcc4'; c.beginPath(); c.ellipse(fx, fy, w * 0.1, v(0.32) - v(0.2), 0, 0, TAU); c.fill()
  c.fillStyle = '#5a3b26'; c.beginPath(); c.ellipse(fx, fy - (v(0.32) - v(0.2)) * 0.75, w * 0.085, (v(0.32) - v(0.2)) * 0.35, 0, PI, TAU); c.fill() // Haare
  for (const d of [-1, 1]) {
    c.fillStyle = '#2c3e55'; c.beginPath(); c.ellipse(fx + d * w * 0.032, fy - 8, 13, 17, 0, 0, TAU); c.fill()
    c.fillStyle = '#fff'; c.beginPath(); c.arc(fx + d * w * 0.032 + 4, fy - 13, 4, 0, TAU); c.fill()
    c.fillStyle = 'rgba(220,90,90,0.5)'; c.beginPath(); c.arc(fx + d * w * 0.055, fy + 26, 20, 0, TAU); c.fill()
  }
  c.fillStyle = '#c8362f'; c.beginPath(); c.ellipse(fx, fy + 44, 16, 9, 0, 0, TAU); c.fill()
  // Schürze vorne mit Blumen
  const ax = w / 2, ay = v(0.62)
  c.fillStyle = '#f4f1ea'; c.beginPath(); c.ellipse(ax, ay, w * 0.13, v(0.95) - v(0.62), 0, 0, TAU); c.fill()
  const flower = (x: number, y: number, s: number, col: string) => {
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; c.fillStyle = col; c.beginPath(); c.ellipse(x + Math.cos(a) * s, y + Math.sin(a) * s, s * 0.75, s * 0.45, a, 0, TAU); c.fill() }
    c.fillStyle = '#e8a531'; c.beginPath(); c.arc(x, y, s * 0.5, 0, TAU); c.fill()
  }
  flower(ax, ay - 20, 34, '#c8362f')
  for (const [dx, dy, col] of [[-90, 50, '#2c5f8a'], [90, 50, '#2c5f8a'], [0, 120, '#c8362f']] as const) flower(ax + dx, ay + dy, 22, col)
  c.strokeStyle = '#3d7a4a'; c.lineWidth = 7
  for (const d of [-1, 1]) { c.beginPath(); c.moveTo(ax, ay + 10); c.quadraticCurveTo(ax + d * 50, ay + 10, ax + d * 80, ay + 40); c.stroke() }
  // Hände und Saum
  for (const d of [-1, 1]) { c.fillStyle = '#f6dcc4'; c.beginPath(); c.arc(w / 2 + d * w * 0.115, v(0.5), 24, 0, TAU); c.fill() }
  c.fillStyle = '#e8a531'; c.fillRect(0, v(0.97), w, h - v(0.97))
  for (let i = 0; i < 30; i++) { c.fillStyle = '#2c5f8a'; c.beginPath(); c.arc(((i + 0.5) / 30) * w, v(0.985), 8, 0, TAU); c.fill() }
}
function matroschka(count: number): Built {
  const r = (t: number) => MT(t)[0], y = (t: number) => MT(t)[1]
  const { fn, nf } = rev(r, y, 0.05, 1)
  return {
    surfaces: [{ fn, nf, ...G(count, [4, 3], [6, 4], [10, 20]), wrap: true, tw: 1800, th: 1800, thick: 0.05, paint: paintDoll }],
    statics: [lathe(r, y, 0, 0.054, mat(0xe8a531, 0.5), 8), lathe((t) => r(t) - 0.05, y, 0.05, 1, back(0xe7d9c0), 40), mesh(new THREE.CircleGeometry(r(1), 40).rotateX(PI / 2).translate(0, y(1), 0), mat(0xc8362f, 0.5))],
  }
}

// ================= Haus und Küche =================
const TK = (t: number) => 0.95 * Math.sin(0.08 * PI + t * 0.84 * PI) * (1 + 0.08 * t)
const TKY = (t: number) => 0.62 * Math.cos(0.08 * PI + t * 0.84 * PI)
function paintTeapot(c: C, w: number, h: number) {
  c.fillStyle = '#f7f4ec'; c.fillRect(0, 0, w, h)
  speckle(c, w, h, 3000, ['rgba(40,70,130,0.06)', 'rgba(255,255,255,0.6)'], 121, 3)
  c.fillStyle = '#c9a24a'; c.fillRect(0, 0, w, h * 0.04); c.fillRect(0, h * 0.96, w, h * 0.04)
  // Rosen im Kreis
  const rose = (x: number, y: number, s: number) => {
    for (const d of [-1, 1]) { c.fillStyle = '#5f9159'; c.beginPath(); c.ellipse(x + d * s * 1.2, y + s * 0.5, s * 0.8, s * 0.35, d * 0.5, 0, TAU); c.fill() }
    for (let k = 3; k >= 0; k--) { c.fillStyle = ['#b83a4b', '#d45d6c', '#e98a95', '#f4b8c0'][k]; c.beginPath(); c.arc(x, y, s * (0.35 + k * 0.22), 0, TAU); c.fill() }
    c.strokeStyle = 'rgba(120,20,40,0.4)'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, s * 0.5, 0.5, 4); c.stroke()
  }
  for (let i = 0; i < 6; i++) rose(((i + 0.5) / 6) * w, h * (i % 2 ? 0.58 : 0.44), h * 0.1)
  c.strokeStyle = '#c9a24a'; c.lineWidth = 4
  for (const y of [0.18, 0.82]) { c.beginPath(); for (let x = 0; x <= w; x += 8) c.lineTo(x, h * y + Math.sin(x / 30) * 8); c.stroke() }
}
function teekanne(count: number): Built {
  const { fn, nf } = rev(TK, TKY, 0, 1)
  const white = mat(0xf7f4ec, 0.3), gold = mat(0xc9a24a, 0.3)
  const top = TKY(0), rt = TK(0)
  const spout = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V(0.85, -0.15, 0), V(1.35, 0.05, 0), V(1.45, 0.42, 0)), 24, 0.09, 14)
  const statics: THREE.Object3D[] = [
    lathe((t) => TK(t) - 0.05, TKY, 0, 1, back(0xece6da), 30),
    mesh(new THREE.SphereGeometry(rt + 0.03, 32, 12, 0, TAU, 0, PI / 2).scale(1, 0.4, 1).translate(0, top, 0), white), // Deckel
    mesh(new THREE.SphereGeometry(0.09, 16, 12).translate(0, top + (rt + 0.03) * 0.4 + 0.06, 0), gold),
    mesh(new THREE.TorusGeometry(rt + 0.02, 0.025, 10, 48).rotateX(PI / 2).translate(0, top, 0), gold),
    mesh(spout, white),
    mesh(new THREE.TorusGeometry(0.36, 0.07, 14, 36, PI * 1.15).rotateZ(-PI * 0.58).scale(1, 1.1, 1).translate(0.92, 0.02, 0).rotateY(PI), white),
    mesh(new THREE.CylinderGeometry(TK(1) - 0.02, TK(1) - 0.06, 0.06, 40).translate(0, TKY(1) - 0.03, 0), gold),
  ]
  return { surfaces: [{ fn, nf, ...G(count, [6, 2], [8, 3], [25, 8]), wrap: true, tw: 2400, th: 800, thick: 0.05, paint: paintTeapot }], statics }
}

function paintCandle(c: C, w: number, h: number) {
  c.fillStyle = '#a92e2a'; c.fillRect(0, 0, w, h)
  speckle(c, w, h, 5000, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.07)'], 131, 4)
  // Wachsnasen oben
  const r = rng(132)
  c.fillStyle = '#c4433e'
  for (let i = 0; i < 18; i++) { const x = r() * w, len = h * (0.05 + r() * 0.18), ww = 18 + r() * 22; c.fillRect(x - ww / 2, 0, ww, len); c.beginPath(); c.arc(x, len, ww / 2, 0, PI); c.fill() }
  c.fillRect(0, 0, w, h * 0.04)
  // goldene Bänder und Sterne
  for (const y of [0.58, 0.86]) { c.fillStyle = '#d9b04a'; c.fillRect(0, h * y, w, h * 0.025) }
  const star = (x: number, y: number, s: number) => { const p: number[][] = []; for (let k = 0; k < 10; k++) { const a = -PI / 2 + (k / 10) * TAU, rr = k % 2 ? s * 0.42 : s; p.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]) } poly(c, p, '#e8c25a') }
  star(w / 2, h * 0.42, h * 0.09)
  for (let i = 0; i < 12; i++) star(((i + 0.25) / 12) * w, h * 0.72, h * 0.03)
  for (let i = 0; i < 24; i++) if (Math.abs(i / 24 - 0.5) > 0.06) star(((i + 0.5) / 24) * w, h * (0.32 + (i % 3) * 0.08), h * 0.018)
}
function kerze(count: number): Built {
  const H = 1.7, R = 0.42
  const { fn, nf } = rev(() => R, (t) => H / 2 - t * H, 0, 1)
  const flame = new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffb02e, emissiveIntensity: 1.1, transparent: true, opacity: 0.92 })
  const statics: THREE.Object3D[] = [
    mesh(new THREE.CircleGeometry(R, 48).rotateX(-PI / 2).translate(0, H / 2 - 0.02, 0), mat(0xb8403a, 0.5)),
    mesh(new THREE.CylinderGeometry(R - 0.05, R - 0.05, H, 40, 1, true), back(0x8f2a26)),
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8).translate(0, H / 2 + 0.05, 0), mat(0x2a2320, 0.9)),
    mesh(new THREE.SphereGeometry(0.07, 20, 14).scale(1, 2.2, 1).translate(0, H / 2 + 0.2, 0), flame),
    mesh(new THREE.CylinderGeometry(0.72, 0.8, 0.08, 48).translate(0, -H / 2 - 0.04, 0), mat(0xc9a24a, 0.3)),
    mesh(new THREE.TorusGeometry(0.76, 0.04, 10, 56).rotateX(PI / 2).translate(0, -H / 2, 0), mat(0xc9a24a, 0.3)),
  ]
  return { surfaces: [{ fn, nf, ...G(count, [4, 3], [6, 4], [10, 20]), wrap: true, tw: 1600, th: 1600, thick: 0.05, paint: paintCandle }], statics }
}

const GL = (t: number) => 0.36 + 0.12 * t + 0.48 * Math.pow(t, 3.2)
const GLY = (t: number) => 0.95 - t * 1.85
function paintBell(c: C, w: number, h: number) {
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#a77a3a'); g.addColorStop(0.5, '#c79a4e'); g.addColorStop(1, '#8e6430')
  c.fillStyle = g; c.fillRect(0, 0, w, h)
  speckle(c, w, h, 9000, ['rgba(60,35,10,0.10)', 'rgba(255,230,170,0.10)'], 141, 3)
  c.fillStyle = 'rgba(70,45,15,0.55)'
  for (const y of [0.1, 0.16, 0.8, 0.88]) c.fillRect(0, h * y, w, h * 0.012)
  c.font = `700 ${Math.round(h * 0.07)}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.fillStyle = 'rgba(60,35,10,0.7)'
  c.fillText('LAUDATE DOMINUM', w * 0.5, h * 0.3)
  for (let i = 0; i < 8; i++) { const x = ((i + 0.5) / 8) * w; c.beginPath(); c.moveTo(x, h * 0.5); for (let k = 0; k < 4; k++) c.arc(x, h * 0.58, 30, (k / 4) * TAU, ((k + 0.5) / 4) * TAU); c.fill() }
  for (let i = 0; i < 36; i++) { c.beginPath(); c.arc(((i + 0.5) / 36) * w, h * 0.72, 7, 0, TAU); c.fill() }
}
function glocke(count: number): Built {
  const { fn, nf } = rev(GL, GLY, 0, 1)
  const bronze = new THREE.MeshStandardMaterial({ color: 0xb48a46, roughness: 0.35, metalness: 0.55, side: THREE.DoubleSide })
  const statics: THREE.Object3D[] = [
    lathe((t) => GL(t) - 0.06, GLY, 0, 1, back(0x5a4020), 30),
    mesh(new THREE.SphereGeometry(GL(0), 32, 12, 0, TAU, 0, PI / 2).scale(1, 0.45, 1).translate(0, GLY(0), 0), bronze),
    mesh(new THREE.TorusGeometry(0.16, 0.05, 12, 32).translate(0, GLY(0) + 0.3, 0), bronze),
    mesh(new THREE.TorusGeometry(GL(1) + 0.01, 0.04, 10, 64).rotateX(PI / 2).translate(0, GLY(1), 0), bronze),
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8).translate(0, GLY(0.5), 0), mat(0x4a4038, 0.6)),
    mesh(new THREE.SphereGeometry(0.13, 20, 14).translate(0, GLY(1) + 0.05, 0), mat(0x4a4038, 0.6)),
    mesh(new THREE.BoxGeometry(1.4, 0.14, 0.18).translate(0, GLY(0) + 0.48, 0), mat(0x6b4226, 0.8)),
  ]
  return { surfaces: [{ fn, nf, ...G(count, [4, 3], [6, 4], [20, 10]), wrap: true, tw: 2048, th: 1024, thick: 0.05, paint: paintBell }], statics }
}

const FA = (t: number) => 0.62 + 0.14 * Math.sin(PI * t)
const FAY = (t: number) => 0.98 - t * 1.96
function paintBarrel(c: C, w: number, h: number) {
  const n = 22, r = rng(151)
  for (let i = 0; i < n; i++) {
    const x0 = (i / n) * w, ww = w / n, base = ['#a36b3c', '#9a6135', '#b07646', '#8f5a32'][(r() * 4) | 0]
    c.fillStyle = base; c.fillRect(x0, 0, ww + 1, h)
    c.strokeStyle = 'rgba(60,30,10,0.25)'; c.lineWidth = 2
    for (let k = 0; k < 7; k++) { const gx = x0 + ww * (0.15 + 0.7 * r()); c.beginPath(); c.moveTo(gx, 0); for (let y = 0; y <= h; y += 20) c.lineTo(gx + Math.sin(y / 60 + k) * 4, y); c.stroke() }
    c.fillStyle = 'rgba(40,20,5,0.55)'; c.fillRect(x0, 0, 3, h)
  }
  for (const y of [0.06, 0.24, 0.72, 0.9]) {
    c.fillStyle = '#3c3a38'; c.fillRect(0, h * y, w, h * 0.045)
    c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(0, h * y, w, h * 0.008)
    c.fillStyle = '#8d8a86'; for (let i = 0; i < 22; i++) { c.beginPath(); c.arc(((i + 0.5) / 22) * w, h * (y + 0.022), 5, 0, TAU); c.fill() }
  }
  // Brandzeichen vorne
  c.strokeStyle = 'rgba(40,20,5,0.75)'; c.lineWidth = 7
  c.beginPath(); c.ellipse(w / 2, h * 0.48, w * 0.06, h * 0.13, 0, 0, TAU); c.stroke()
  c.fillStyle = 'rgba(40,20,5,0.75)'; c.font = `700 ${Math.round(h * 0.09)}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('1960', w / 2, h * 0.48)
}
function fass(count: number): Built {
  const { fn, nf } = rev(FA, FAY, 0, 1)
  const wood = mat(0x8f5a32, 0.8)
  const statics: THREE.Object3D[] = [
    lathe((t) => FA(t) - 0.05, FAY, 0, 1, back(0x5a3b26), 30),
    mesh(new THREE.CircleGeometry(FA(0) - 0.04, 40).rotateX(-PI / 2).translate(0, FAY(0) - 0.05, 0), wood),
    mesh(new THREE.CircleGeometry(FA(1) - 0.04, 40).rotateX(PI / 2).translate(0, FAY(1) + 0.05, 0), wood),
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 12).rotateX(PI / 2).translate(0, FAY(0.85), FA(0.85) + 0.1), mat(0xc9a24a, 0.3)),
  ]
  return { surfaces: [{ fn, nf, ...G(count, [4, 3], [6, 4], [20, 10]), wrap: true, tw: 2400, th: 1200, thick: 0.05, paint: paintBarrel }], statics }
}

// ================= Feste =================
function paintCake(c: C, w: number, h: number) {
  c.fillStyle = '#f0b7c2'; c.fillRect(0, 0, w, h)
  speckle(c, w, h, 4000, ['rgba(255,255,255,0.25)', 'rgba(160,60,80,0.06)'], 161, 4)
  // Sahne oben und unten
  c.fillStyle = '#fffaf2'; c.fillRect(0, 0, w, h * 0.12)
  for (let i = 0; i < 48; i++) { const x = ((i + 0.5) / 48) * w; c.beginPath(); c.arc(x, h * 0.12, w / 96, 0, PI); c.fill(); if (i % 3 === 0) { c.fillRect(x - 6, h * 0.12, 12, h * 0.15); c.beginPath(); c.arc(x, h * 0.27, 6, 0, TAU); c.fill() } }
  c.fillRect(0, h * 0.88, w, h * 0.12)
  for (let i = 0; i < 60; i++) { c.beginPath(); c.arc(((i + 0.5) / 60) * w, h * 0.88, w / 120, PI, TAU); c.fill() }
  // Schrift vorne und Kirschen
  c.fillStyle = '#b83a4b'; c.font = `italic 700 ${Math.round(h * 0.2)}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.fillText('Alles Gute', w / 2, h * 0.55)
  for (let i = 0; i < 10; i++) if (Math.abs(i / 10 + 0.05 - 0.5) > 0.12) { const x = (i / 10 + 0.05) * w; c.fillStyle = '#c8233a'; c.beginPath(); c.arc(x, h * 0.55, 22, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.arc(x - 7, h * 0.52, 6, 0, TAU); c.fill(); c.strokeStyle = '#3d7a4a'; c.lineWidth = 4; c.beginPath(); c.moveTo(x, h * 0.48); c.quadraticCurveTo(x + 10, h * 0.38, x + 22, h * 0.36); c.stroke() }
}
function torte(count: number): Built {
  const R = 1.05, H = 0.95
  const { fn, nf } = rev(() => R, (t) => H / 2 - t * H, 0, 1)
  const cream = mat(0xfffaf2, 0.6)
  const statics: THREE.Object3D[] = [
    mesh(new THREE.CylinderGeometry(R, R, 0.04, 64).translate(0, H / 2, 0), mat(0xf0b7c2, 0.6)),
    mesh(new THREE.CylinderGeometry(R - 0.05, R - 0.05, H, 48, 1, true), back(0xe8c9a0)),
    mesh(new THREE.CylinderGeometry(R + 0.25, R + 0.28, 0.05, 64).translate(0, -H / 2 - 0.03, 0), mat(0xf4f1ea, 0.3)),
  ]
  for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; statics.push(mesh(new THREE.SphereGeometry(0.1, 14, 10).scale(1, 0.8, 1).translate(Math.sin(a) * (R - 0.15), H / 2 + 0.06, Math.cos(a) * (R - 0.15)), cream)) }
  const flame = new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffb02e, emissiveIntensity: 1.1 })
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU, x = Math.sin(a) * 0.42, z = Math.cos(a) * 0.42
    statics.push(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.36, 12).translate(x, H / 2 + 0.2, z), mat([0x2c5f8a, 0xe8a531, 0x3d7a4a, 0xc8362f, 0xf4f1ea][k], 0.5)))
    statics.push(mesh(new THREE.SphereGeometry(0.04, 12, 10).scale(1, 1.8, 1).translate(x, H / 2 + 0.44, z), flame))
  }
  return { surfaces: [{ fn, nf, ...G(count, [6, 2], [8, 3], [40, 5]), wrap: true, tw: 2800, th: 420, thick: 0.05, paint: paintCake }], statics }
}

const TB = (t: number) => 0.06 + 0.9 * t + 0.05 * Math.abs(Math.sin(t * PI * 5))
const TBY = (t: number) => 1.45 - t * 2.3
function paintTree(c: C, w: number, h: number) {
  c.fillStyle = '#2f6a3a'; c.fillRect(0, 0, w, h)
  // Zweigschichten
  const r = rng(171)
  for (let layer = 0; layer < 5; layer++) {
    const y0 = (layer / 5) * h
    for (let i = 0; i < 40; i++) { c.fillStyle = ['#3f8046', '#2a5e33', '#4b8f50'][(r() * 3) | 0]; c.beginPath(); c.ellipse(((i + r()) / 40) * w, y0 + h * 0.16, w / 60, h * 0.08, 0, 0, TAU); c.fill() }
  }
  speckle(c, w, h, 12000, ['rgba(20,50,25,0.3)', 'rgba(120,190,120,0.15)'], 172, 4)
  // Girlande als Spirale
  c.strokeStyle = '#e8c25a'; c.lineWidth = 8
  for (let k = -1; k < 4; k++) { c.beginPath(); for (let x = 0; x <= w; x += 10) c.lineTo(x, h * (k * 0.25 + 0.1) + (x / w) * h * 0.25 + Math.sin(x / 40) * 6); c.stroke() }
  // Kugeln
  const cols = ['#c8362f', '#e8a531', '#2c5f8a', '#f4f1ea', '#b83a8a']
  for (let i = 0; i < 46; i++) {
    const x = r() * w, y = h * (0.12 + r() * 0.82), s = 16 + r() * 14, col = cols[i % cols.length]
    c.fillStyle = col; c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill()
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(x - s * 0.35, y - s * 0.35, s * 0.28, 0, TAU); c.fill()
    c.fillStyle = '#c9a24a'; c.fillRect(x - 5, y - s - 6, 10, 8)
  }
}
function tannenbaum(count: number): Built {
  const { fn, nf } = rev(TB, TBY, 0.04, 1)
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2c94c, emissive: 0xc99a20, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.4 })
  const statics: THREE.Object3D[] = [
    lathe(TB, TBY, 0, 0.044, mat(0x2f6a3a, 0.7), 6),
    lathe((t) => TB(t) - 0.05, TBY, 0.04, 1, back(0x1f4a28), 30),
    mesh(new THREE.CircleGeometry(TB(1) - 0.02, 40).rotateX(PI / 2).translate(0, TBY(1) + 0.02, 0), mat(0x1f4a28, 0.8)),
    mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.35, 16).translate(0, TBY(1) - 0.17, 0), mat(0x6b4226, 0.8)),
    mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.4, 32).translate(0, TBY(1) - 0.5, 0), mat(0xa8352e, 0.6)),
    mesh(new THREE.OctahedronGeometry(0.17).scale(1, 1.3, 0.45).translate(0, TBY(0) + 0.14, 0), gold),
  ]
  return { surfaces: [{ fn, nf, ...G(count, [4, 3], [6, 4], [20, 10]), wrap: true, tw: 2048, th: 1100, thick: 0.05, paint: paintTree }], statics }
}

const SB: [number, number][] = [[0.36, 1.16], [0.5, 0.42], [0.68, -0.48]] // Radius, Mitte
const SMY = (t: number) => 1.5 - t * 2.66
const SMR = (t: number) => { const y = SMY(t); let r = 0; for (const [R, cy] of SB) { const d = R * R - (y - cy) ** 2; if (d > 0) r = Math.max(r, Math.sqrt(d)) } return Math.max(0.02, r) }
function paintSnowman(c: C, w: number, h: number) {
  const t0 = 0.03, v = (y: number) => (((1.5 - y) / 2.66 - t0) / (1 - t0)) * h
  c.fillStyle = '#f6f8fb'; c.fillRect(0, 0, w, h)
  speckle(c, w, h, 14000, ['rgba(140,170,200,0.12)', 'rgba(255,255,255,0.9)'], 181, 4)
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(180,200,225,0)'); g.addColorStop(1, 'rgba(160,185,215,0.25)')
  c.fillStyle = g; c.fillRect(0, 0, w, h)
  // Gesicht
  const fy = v(1.2)
  for (const d of [-1, 1]) { c.fillStyle = '#1d1a18'; c.beginPath(); c.arc(w / 2 + d * w * 0.035, fy, 14, 0, TAU); c.fill() }
  for (let k = -3; k <= 3; k++) { c.beginPath(); c.arc(w / 2 + k * w * 0.012, v(1.02) - Math.cos(k * 0.4) * 14, 7, 0, TAU); c.fill() }
  // Schal
  c.fillStyle = '#c8362f'; c.fillRect(0, v(0.9), w, v(0.75) - v(0.9))
  c.fillStyle = '#f4f1ea'; for (let i = 0; i < 24; i++) c.fillRect(((i + 0.25) / 24) * w, v(0.9), w / 96, v(0.75) - v(0.9))
  c.fillStyle = '#c8362f'; c.fillRect(w * 0.56, v(0.75), w * 0.04, v(0.3) - v(0.75))
  // Knöpfe
  for (const y of [0.55, 0.32, -0.25, -0.55]) { c.fillStyle = '#1d1a18'; c.beginPath(); c.arc(w / 2, v(y), 16, 0, TAU); c.fill() }
}
function schneemann(count: number): Built {
  const { fn, nf } = rev(SMR, SMY, 0.03, 1)
  const black = mat(0x1d1a18, 0.7), stick = mat(0x5a3b26, 0.9)
  const arm = (side: number) => { const m = mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.8, 8), stick); m.position.set(side * 0.78, 0.6, 0); m.rotation.z = side * -1.0; return m }
  const statics: THREE.Object3D[] = [
    lathe(SMR, SMY, 0, 0.034, mat(0xf6f8fb, 0.7), 6),
    lathe((t) => Math.max(0.01, SMR(t) - 0.05), SMY, 0.03, 1, back(0xdfe6ee), 60),
    mesh(new THREE.ConeGeometry(0.06, 0.34, 16).rotateX(PI / 2).translate(0, 1.13, 0.5), mat(0xe8762b, 0.6)), // Karottennase
    mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.36, 32).translate(0, 1.66, 0), black), // Hut
    mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 32).translate(0, 1.47, 0), black),
    mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.07, 32).translate(0, 1.52, 0), mat(0xc8362f, 0.6)),
    arm(1), arm(-1),
    mesh(new THREE.CylinderGeometry(1.0, 1.05, 0.08, 48).translate(0, -1.16, 0), mat(0xeef3f8, 0.9)),
  ]
  return { surfaces: [{ fn, nf, ...G(count, [4, 3], [6, 4], [10, 20]), wrap: true, tw: 1600, th: 1600, thick: 0.05, paint: paintSnowman }], statics }
}

// Kürbis: Rippen hängen vom Winkel ab, deshalb eigene Fläche (Normale wird gerechnet)
const KP = 0.08
const rib = (u: number) => 1 - 0.07 * Math.pow(Math.abs(Math.cos(u * PI * 8)), 0.5)
const kuerbisFn: Fn = (u, v) => { const t = KP + (1 - 2 * KP) * v, a = (u - 0.5) * TAU, r = 1.0 * Math.sin(PI * t) * rib(u); return V(r * Math.sin(a), 0.72 * Math.cos(PI * t), r * Math.cos(a)) }
function paintPumpkin(c: C, w: number, h: number) {
  const img = c.createImageData(w, h), d = img.data
  for (let i = 0; i < w; i++) {
    const s = Math.pow(Math.abs(Math.cos(((i + 0.5) / w) * PI * 8)), 0.5)
    for (let j = 0; j < h; j++) { const k = (j * w + i) * 4, vv = j / h, edge = 1 - 0.25 * Math.pow(Math.abs(vv - 0.5) * 2, 3); d[k] = (190 + 50 * s) * edge; d[k + 1] = (85 + 45 * s) * edge; d[k + 2] = (20 + 15 * s) * edge; d[k + 3] = 255 }
  }
  c.putImageData(img, 0, 0)
  speckle(c, w, h, 14000, ['rgba(120,50,0,0.10)', 'rgba(255,220,150,0.12)'], 191, 4)
  c.strokeStyle = 'rgba(110,50,10,0.25)'; c.lineWidth = 3
  for (let i = 0; i < 16; i++) { const x = ((i + 0.5) / 16) * w; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke() }
}
function kuerbis(count: number): Built {
  const capR = (t: number) => Math.sin(PI * t), capY = (t: number) => 0.72 * Math.cos(PI * t)
  const statics: THREE.Object3D[] = [
    lathe((t) => capR(t) * 0.93, capY, 0, KP + 0.01, mat(0x9a5a1c, 0.7), 6),
    lathe((t) => capR(t) * 0.93, capY, 1 - KP - 0.01, 1, mat(0x9a5a1c, 0.7), 6),
    mesh(new THREE.SphereGeometry(0.86, 40, 24).scale(1, 0.66, 1), back(0xe9b46a)),
    mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.34, 10).translate(0.03, 0.86, 0).rotateZ(-0.12), mat(0x5a6a32, 0.8)), // Stiel
  ]
  const leaf = new THREE.Shape(); leaf.moveTo(0, 0); leaf.quadraticCurveTo(0.22, 0.16, 0.42, 0); leaf.quadraticCurveTo(0.22, -0.16, 0, 0)
  const lm = mesh(new THREE.ShapeGeometry(leaf), mat(0x4f8a3e, 0.7)); lm.position.set(0.06, 0.76, 0.05); lm.rotation.set(-0.9, 0.4, 0.2); statics.push(lm)
  return { surfaces: [{ fn: kuerbisFn, ...G(count, [4, 3], [8, 3], [20, 10]), wrap: true, tw: 2048, th: 900, thick: 0.05, paint: paintPumpkin }], statics }
}

// ================= Draußen =================
const WM = (t: number) => 0.5 + 0.26 * t
const WMY = (t: number) => 1.0 - t * 2.2
function paintMill(c: C, w: number, h: number) {
  c.fillStyle = '#e9e1d0'; c.fillRect(0, 0, w, h)
  const r = rng(201)
  for (let y = 0; y < h; y += h / 26) for (let x = (y / (h / 26)) % 2 ? -30 : 0; x < w; x += 60) { c.fillStyle = ['#ddd3be', '#e9e1d0', '#d2c7b0', '#efe8da'][(r() * 4) | 0]; c.fillRect(x + 2, y + 2, 56, h / 26 - 4) }
  c.fillStyle = '#6b4226'; c.fillRect(0, h * 0.3, w, h * 0.03) // Umgang
  const door = (x: number) => { c.fillStyle = '#2f6f62'; c.fillRect(x - w * 0.035, h * 0.78, w * 0.07, h * 0.22); c.beginPath(); c.arc(x, h * 0.78, w * 0.035, PI, 0); c.fill() }
  door(w / 2)
  const win = (x: number, y: number) => { c.fillStyle = '#fffaf0'; c.fillRect(x - 34, y - 44, 68, 88); c.fillStyle = '#5d8fae'; c.fillRect(x - 26, y - 36, 52, 72); c.fillStyle = '#fffaf0'; c.fillRect(x - 3, y - 36, 6, 72); c.fillRect(x - 26, y - 2, 52, 4); c.fillStyle = '#2f6f62'; c.fillRect(x - 60, y - 44, 24, 88); c.fillRect(x + 36, y - 44, 24, 88) }
  win(w / 2, h * 0.16); win(w / 2, h * 0.5); win(w * 0.0, h * 0.5); win(w, h * 0.5); win(w * 0.25, h * 0.62); win(w * 0.75, h * 0.62)
  for (let i = 0; i < 14; i++) { c.fillStyle = ['#d43d3d', '#f2b632', '#e86aa0'][i % 3]; c.beginPath(); c.arc(w * 0.44 + (i / 13) * w * 0.12, h * 0.97, 12, 0, TAU); c.fill() }
}
function windmuehle(count: number): Built {
  const { fn, nf } = rev(WM, WMY, 0, 1)
  const cap = mat(0x7a3b2a, 0.7), wood = mat(0x6b4226, 0.8), sail = mat(0xf4f1ea, 0.8)
  const top = WMY(0)
  const statics: THREE.Object3D[] = [
    mesh(new THREE.CylinderGeometry(WM(0) - 0.05, WM(1) - 0.05, 2.2, 40, 1, true).translate(0, WMY(0.5), 0), back()),
    mesh(new THREE.SphereGeometry(WM(0) + 0.06, 32, 14, 0, TAU, 0, PI / 2).scale(1, 0.9, 1).translate(0, top, 0), cap),
    mesh(new THREE.CylinderGeometry(WM(0.3) + 0.22, WM(0.3) + 0.22, 0.05, 40).translate(0, WMY(0.3) - 0.02, 0), wood), // Umgang
    mesh(new THREE.TorusGeometry(WM(0.3) + 0.2, 0.015, 6, 48).rotateX(PI / 2).translate(0, WMY(0.3) + 0.2, 0), wood),
    mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 16).rotateX(PI / 2).translate(0, top + 0.2, WM(0) + 0.2), wood),
    mesh(new THREE.CylinderGeometry(1.3, 1.4, 0.08, 48).translate(0, WMY(1) - 0.04, 0), mat(0x6f9c58, 0.9)),
  ]
  const hub = new THREE.Group(); hub.position.set(0, top + 0.2, WM(0) + 0.42)
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group(); arm.rotation.z = (k / 4) * TAU + 0.3
    arm.add(mesh(new THREE.BoxGeometry(0.06, 1.25, 0.05).translate(0, 0.65, 0), wood))
    arm.add(mesh(new THREE.BoxGeometry(0.3, 0.95, 0.02).translate(0.18, 0.78, 0), sail))
    for (let s = 0; s < 6; s++) arm.add(mesh(new THREE.BoxGeometry(0.32, 0.02, 0.03).translate(0.18, 0.34 + s * 0.17, 0.015), wood))
    hub.add(arm)
  }
  statics.push(hub)
  return { surfaces: [{ fn, nf, ...G(count, [4, 3], [6, 4], [20, 10]), wrap: true, tw: 2048, th: 1100, thick: 0.05, paint: paintMill }], statics }
}

const PC = 0.06
const pilzR = (t: number) => 1.02 * Math.sin(t * 0.56 * PI), pilzY = (t: number) => 0.32 + 0.68 * Math.cos(t * 0.56 * PI)
const stielR = (t: number) => 0.27 + 0.06 * t, stielY = (t: number) => pilzY(1) - 0.02 - t * 1.25
function paintCap(c: C, w: number, h: number) {
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#d2332b'); g.addColorStop(1, '#b52620')
  c.fillStyle = g; c.fillRect(0, 0, w, h)
  speckle(c, w, h, 6000, ['rgba(80,0,0,0.08)', 'rgba(255,200,180,0.08)'], 211, 4)
  const r = rng(212)
  for (let i = 0; i < 46; i++) { const vv = 0.08 + r() * 0.86, t = PC + (1 - PC) * vv, k = 1 / Math.max(0.35, Math.sin(t * 0.56 * PI)), s = 14 + r() * 22; c.fillStyle = '#fbf6ea'; c.beginPath(); c.ellipse(r() * w, vv * h, s * k * 0.55, s, 0, 0, TAU); c.fill() }
}
function paintStem(c: C, w: number, h: number) {
  c.fillStyle = '#f1ead8'; c.fillRect(0, 0, w, h)
  speckle(c, w, h, 5000, ['rgba(120,100,60,0.12)', 'rgba(255,255,255,0.5)'], 221, 4)
  c.fillStyle = '#e6dcc2'; c.fillRect(0, h * 0.12, w, h * 0.1)
  for (let i = 0; i < 60; i++) { c.fillStyle = 'rgba(160,140,100,0.35)'; c.fillRect(((i + 0.5) / 60) * w, h * 0.12, 3, h * 0.12) }
}
function fliegenpilz(count: number): Built {
  const cap = rev(pilzR, pilzY, PC, 1), stem = rev(stielR, stielY, 0, 1)
  const [cg, sg] = count === 12 ? [[4, 2], [4, 1]] : count === 24 ? [[6, 3], [6, 1]] : [[20, 7], [20, 3]]
  const statics: THREE.Object3D[] = [
    lathe(pilzR, pilzY, 0, PC + 0.004, mat(0xd2332b, 0.5), 6),
    mesh(new THREE.RingGeometry(stielR(0), pilzR(1), 64, 1).rotateX(PI / 2).translate(0, pilzY(1), 0), mat(0xeadfc4, 0.8)), // Lamellen
    lathe((t) => pilzR(t) - 0.05, pilzY, 0, 1, back(0xeadfc4), 20),
    mesh(new THREE.CylinderGeometry(stielR(0) - 0.04, stielR(1) - 0.04, 1.25, 30, 1, true).translate(0, stielY(0.5), 0), back(0xe6dcc2)),
    mesh(new THREE.CylinderGeometry(1.1, 1.15, 0.1, 40).translate(0, stielY(1) - 0.05, 0), mat(0x4f8a3e, 0.9)),
  ]
  for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU, rr = 0.55 + (k % 3) * 0.15; statics.push(mesh(new THREE.ConeGeometry(0.03, 0.2 + (k % 4) * 0.05, 5).translate(Math.sin(a) * rr, stielY(1) + 0.08, Math.cos(a) * rr), mat(0x5f9c4a, 0.8))) }
  return {
    surfaces: [
      { fn: cap.fn, nf: cap.nf, cols: cg[0], rows: cg[1], wrap: true, tw: 2048, th: 800, thick: 0.05, paint: paintCap },
      { fn: stem.fn, nf: stem.nf, cols: sg[0], rows: sg[1], wrap: true, tw: 1200, th: 800, thick: 0.05, paint: paintStem },
    ],
    statics,
  }
}

const BK = (t: number) => 0.86 * Math.pow(Math.sin(Math.min(1, t / 0.75) * PI / 2), 0.7) + 0.03 * Math.abs(Math.sin(t * PI * 11))
const BKY = (t: number) => 1.05 - t * 1.9
function paintSkep(c: C, w: number, h: number) {
  const t0 = 0.06
  const rows = 11
  for (let j = 0; j < h; j++) { const t = t0 + (1 - t0) * (j / h), s = Math.abs(Math.sin(t * PI * 11)); c.fillStyle = `rgb(${170 + s * 50},${125 + s * 45},${55 + s * 25})`; c.fillRect(0, j, w, 1) }
  const r = rng(231)
  c.strokeStyle = 'rgba(110,70,20,0.35)'; c.lineWidth = 2
  for (let i = 0; i < 900; i++) { const x = r() * w, y = r() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 20 + r() * 20, y + (r() - 0.5) * 3); c.stroke() }
  c.fillStyle = 'rgba(120,75,25,0.5)'
  for (let k = 0; k < rows * 6; k++) { const row = k % rows, x = ((k / rows) | 0) / 6 * w + row * 37; c.fillRect(x % w, (row / rows) * h, 6, h / rows) } // Bindungen
  // Flugloch vorne unten
  c.fillStyle = '#2a1c10'; c.beginPath(); c.ellipse(w / 2, h, w * 0.05, h * 0.09, 0, PI, TAU); c.fill()
  // Bienen
  const bee = (x: number, y: number, a: number) => {
    c.save(); c.translate(x, y); c.rotate(a)
    c.fillStyle = 'rgba(230,240,255,0.8)'; c.beginPath(); c.ellipse(-6, -16, 12, 8, -0.5, 0, TAU); c.ellipse(8, -16, 12, 8, 0.5, 0, TAU); c.fill()
    c.fillStyle = '#e8b030'; c.beginPath(); c.ellipse(0, 0, 22, 14, 0, 0, TAU); c.fill()
    c.fillStyle = '#1d1a18'; c.fillRect(-8, -13, 6, 26); c.fillRect(4, -12, 6, 24); c.beginPath(); c.arc(-22, 0, 8, 0, TAU); c.fill()
    c.restore()
  }
  for (let i = 0; i < 9; i++) bee(r() * w, h * (0.2 + r() * 0.65), r() * TAU)
}
function bienenkorb(count: number): Built {
  const { fn, nf } = rev(BK, BKY, 0.06, 1)
  const statics: THREE.Object3D[] = [
    lathe(BK, BKY, 0, 0.064, mat(0xc89a55, 0.9), 6),
    lathe((t) => Math.max(0.01, BK(t) - 0.05), BKY, 0.06, 1, back(0x3a2814), 30),
    mesh(new THREE.BoxGeometry(2.0, 0.1, 2.0).translate(0, BKY(1) - 0.05, 0), mat(0x8f6a44, 0.8)),
  ]
  const yellow = mat(0xe8b030, 0.6), dark = mat(0x1d1a18, 0.6)
  for (const [x, y, z] of [[0.6, 0.6, 0.9], [-0.9, 0.2, 0.7], [0.2, 1.2, 0.5]]) {
    const b = new THREE.Group(); b.position.set(x, y, z)
    b.add(mesh(new THREE.SphereGeometry(0.06, 12, 8).scale(1.5, 1, 1), yellow), mesh(new THREE.SphereGeometry(0.035, 10, 8).translate(-0.09, 0, 0), dark))
    b.add(mesh(new THREE.CircleGeometry(0.05, 12).rotateX(-PI / 2.6).translate(0, 0.05, 0.03), new THREE.MeshStandardMaterial({ color: 0xeaf2ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide })))
    statics.push(b)
  }
  return { surfaces: [{ fn, nf, ...G(count, [4, 3], [6, 4], [20, 10]), wrap: true, tw: 2048, th: 1100, thick: 0.05, paint: paintSkep }], statics }
}

// ================= Liste =================
export const MODELS2: ModelDef[] = [
  { id: 'mond', name: 'Mond', cat: 'Weltall', text: 'Grauer Mond mit Kratern', build: (n) => sphere(n, 1.15, paintMoon, 0x9d9a94, 0x9d9a94) },
  { id: 'mars', name: 'Mars', cat: 'Weltall', text: 'Der rote Planet mit Polkappen', build: (n) => sphere(n, 1.1, paintMars, 0xf3f0ea, 0xf3f0ea) },
  { id: 'jupiter', name: 'Jupiter', cat: 'Weltall', text: 'Gestreifter Riese mit rotem Fleck', build: (n) => sphere(n, 1.2, paintJupiter, 0xd9c6a6, 0xd9c6a6) },
  { id: 'saturn', name: 'Saturn', cat: 'Weltall', text: 'Planet mit großen Ringen', build: (n) => sphere(n, 1.0, paintSaturn, 0xe3cf9e, 0xdcc391, saturnRings()) },
  { id: 'rakete', name: 'Rakete', cat: 'Weltall', text: 'Weiß-rote Rakete mit Flossen', build: rakete },
  { id: 'fussball', name: 'Fußball', cat: 'Bälle und Spielzeug', text: 'Klassischer Ball mit Fünfecken', build: (n) => sphere(n, 1.1, paintFootball, 0xececec, 0xececec) },
  { id: 'basketball', name: 'Basketball', cat: 'Bälle und Spielzeug', text: 'Oranger Ball mit Linien', build: (n) => sphere(n, 1.1, paintBasketball, 0xd66a26, 0xd66a26) },
  { id: 'wasserball', name: 'Wasserball', cat: 'Bälle und Spielzeug', text: 'Bunter Ball für den Strand', build: (n) => sphere(n, 1.1, paintBeachball, 0xf4f1ea, 0xf4f1ea) },
  { id: 'matroschka', name: 'Matroschka', cat: 'Bälle und Spielzeug', text: 'Bemalte Holzpuppe', build: matroschka },
  { id: 'teekanne', name: 'Teekanne', cat: 'Haus und Küche', text: 'Porzellankanne mit Rosen', build: teekanne },
  { id: 'kerze', name: 'Kerze', cat: 'Haus und Küche', text: 'Rote Kerze mit Sternen', build: kerze },
  { id: 'glocke', name: 'Glocke', cat: 'Haus und Küche', text: 'Alte Kirchenglocke aus Bronze', build: glocke },
  { id: 'fass', name: 'Holzfass', cat: 'Haus und Küche', text: 'Fass mit Eisenringen', build: fass },
  { id: 'torte', name: 'Geburtstagstorte', cat: 'Feste', text: 'Torte mit Kerzen und Kirschen', build: torte },
  { id: 'tannenbaum', name: 'Tannenbaum', cat: 'Feste', text: 'Geschmückter Baum mit Stern', build: tannenbaum },
  { id: 'schneemann', name: 'Schneemann', cat: 'Feste', text: 'Mit Hut, Schal und Karotte', build: schneemann },
  { id: 'kuerbis', name: 'Kürbis', cat: 'Feste', text: 'Dicker Herbstkürbis', build: kuerbis },
  { id: 'windmuehle', name: 'Windmühle', cat: 'Draußen', text: 'Mühle mit vier Flügeln', build: windmuehle },
  { id: 'fliegenpilz', name: 'Fliegenpilz', cat: 'Draußen', text: 'Roter Pilz mit weißen Punkten', build: fliegenpilz },
  { id: 'bienenkorb', name: 'Bienenkorb', cat: 'Draußen', text: 'Strohkorb mit Bienen', build: bienenkorb },
]
