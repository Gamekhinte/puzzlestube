// Vier eingebaute 3D-Puzzles. Wie bei 3D-Puzzles aus dem Laden ist das Motiv
// auf die Oberfläche gedruckt und in Puzzleteile mit Nasen geschnitten.
// Jede Oberfläche wird über (u, v) von 0 bis 1 beschrieben; das Motiv wird
// hier im Code gemalt (keine Modelldateien, keine fremden Texturen).
import * as THREE from 'three'
import { rng } from '../puzzle/engine'
import { MODELS2 } from './models2'

export type C = CanvasRenderingContext2D
export type Fn = (u: number, v: number) => THREE.Vector3
export interface Surface {
  fn: Fn
  nf?: Fn
  cols: number
  rows: number
  wrap: boolean // läuft in u rundherum
  tw: number
  th: number
  thick: number
  paint: (c: C, w: number, h: number) => void
}
export interface Built { surfaces: Surface[]; statics: THREE.Object3D[] }
export interface ModelDef { id: string; name: string; text: string; cat?: string; build: (count: number) => Built }

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
export const TAU = Math.PI * 2
export const PI = Math.PI
export const mat = (color: number, rough = 0.6, side: THREE.Side = THREE.DoubleSide) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02, side })
export const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => new THREE.Mesh(g, m)
/** Raster je Schwierigkeit: 12, 24 oder 200 Teile. */
export const G = (count: number, a: [number, number], b: [number, number], c: [number, number]) => { const [cols, rows] = count === 12 ? a : count === 24 ? b : c; return { cols, rows } }

/** Drehkörper: Profil r(t), y(t) mit t von oben (0) nach unten (1), nur der Bereich t0 bis t1 wird zum Puzzle. u = 0.5 zeigt nach vorn. */
export function rev(r: (t: number) => number, y: (t: number) => number, t0: number, t1: number): { fn: Fn; nf: Fn } {
  const T = (v: number) => t0 + (t1 - t0) * v
  const fn: Fn = (u, v) => { const a = (u - 0.5) * TAU, t = T(v), rr = r(t); return V(rr * Math.sin(a), y(t), rr * Math.cos(a)) }
  const nf: Fn = (u, v) => {
    const a = (u - 0.5) * TAU, t = T(v), e = 1e-3
    const dr = r(t + e) - r(t - e), dy = y(t + e) - y(t - e)
    const n = new THREE.Vector2(-dy, dr).normalize()
    return V(n.x * Math.sin(a), n.y, n.x * Math.cos(a))
  }
  return { fn, nf }
}
/** Fester Teil eines Drehkörpers zwischen ta und tb (z. B. die Spitze oben). */
export function lathe(r: (t: number) => number, y: (t: number) => number, ta: number, tb: number, m: THREE.Material, n = 12) {
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= n; i++) { const t = ta + ((tb - ta) * i) / n; pts.push(new THREE.Vector2(Math.max(0, r(t)), y(t))) }
  if (pts[0].y < pts[n].y) pts.reverse()
  return mesh(new THREE.LatheGeometry(pts, 56), m)
}

export function speckle(c: C, w: number, h: number, n: number, cols: string[], seed: number, size = 2) {
  const r = rng(seed)
  for (let i = 0; i < n; i++) { c.fillStyle = cols[(r() * cols.length) | 0]; c.fillRect(r() * w, r() * h, 1 + r() * size, 1 + r() * size) }
}
export function poly(c: C, pts: number[][], fill?: string, stroke?: string, lw = 2) {
  c.beginPath()
  pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])))
  c.closePath()
  if (fill) { c.fillStyle = fill; c.fill() }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke() }
}
function stitch(c: C, pts: number[][], col = 'rgba(255,255,255,0.85)', lw = 3) {
  c.save(); c.setLineDash([12, 9]); c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'butt'
  c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); c.restore()
}

// ================= Weltkugel =================
const LAND: number[][][] = [
  [[-168, 66], [-156, 71], [-125, 70], [-95, 72], [-80, 73], [-62, 60], [-55, 52], [-66, 45], [-75, 35], [-81, 25], [-90, 29], [-97, 26], [-97, 18], [-88, 15], [-83, 9], [-78, 8], [-85, 12], [-95, 16], [-105, 22], [-110, 24], [-115, 31], [-124, 40], [-125, 49], [-135, 58], [-150, 60], [-165, 55], [-160, 60], [-166, 62]],
  [[-55, 60], [-42, 60], [-22, 70], [-20, 80], [-45, 83], [-65, 80], [-55, 70]],
  [[-78, 8], [-62, 11], [-50, 0], [-35, -6], [-39, -18], [-48, -27], [-58, -38], [-66, -46], [-70, -54], [-74, -50], [-72, -35], [-70, -18], [-81, -5], [-78, 2]],
  [[-9, 37], [-9, 43], [-1, 44], [-4, 48], [3, 51], [8, 54], [9, 57], [5, 59], [6, 62], [14, 68], [25, 71], [40, 67], [60, 69], [70, 73], [100, 77], [115, 74], [140, 73], [160, 70], [180, 69], [178, 64], [163, 58], [156, 52], [142, 53], [135, 44], [128, 38], [122, 30], [120, 24], [110, 20], [108, 12], [104, 9], [100, 13], [99, 8], [103, 2], [98, 8], [95, 17], [90, 22], [80, 15], [78, 8], [73, 17], [68, 24], [58, 25], [57, 20], [52, 16], [44, 12], [40, 17], [35, 28], [36, 36], [28, 37], [26, 40], [23, 38], [20, 40], [13, 45], [16, 40], [12, 38], [8, 44], [3, 43], [0, 39], [-5, 36]],
  [[-17, 15], [-16, 24], [-10, 30], [-5, 36], [10, 37], [20, 32], [32, 31], [35, 28], [43, 12], [51, 11], [41, -2], [40, -15], [35, -24], [27, -34], [19, -35], [13, -20], [13, -8], [9, 3], [-5, 5], [-13, 9]],
  [[114, -22], [122, -18], [131, -12], [137, -16], [142, -11], [146, -19], [153, -27], [150, -37], [140, -38], [131, -32], [117, -35], [114, -28]],
  [[-5, 50], [1, 51], [-2, 56], [-5, 58], [-6, 55]], [[130, 32], [136, 34], [141, 38], [142, 44], [140, 41], [136, 37]], [[44, -16], [50, -15], [47, -25], [44, -22]],
  [[167, -46], [174, -41], [178, -38], [173, -35], [172, -42]], [[96, 5], [105, -5], [115, -8], [119, -3], [117, 4], [109, 1]], [[131, -2], [141, -3], [147, -7], [140, -8]], [[-24, 65], [-14, 66], [-14, 64], [-22, 63]],
]
const POLE = 0.07
function paintGlobe(c: C, w: number, h: number) {
  const X = (lon: number) => ((lon + 180) / 360) * w
  const Y = (lat: number) => (((90 - lat) / 180 - POLE) / (1 - 2 * POLE)) * h
  const sea = c.createLinearGradient(0, 0, 0, h)
  sea.addColorStop(0, '#2a6fae'); sea.addColorStop(0.5, '#1f5f9f'); sea.addColorStop(1, '#2a6fae')
  c.fillStyle = sea; c.fillRect(0, 0, w, h)
  speckle(c, w, h, 5000, ['rgba(255,255,255,0.05)', 'rgba(0,20,60,0.07)'], 3, 5)
  const land = () => { c.beginPath(); for (const p of LAND) { p.forEach((q, i) => (i ? c.lineTo(X(q[0]), Y(q[1])) : c.moveTo(X(q[0]), Y(q[1])))); c.closePath() } }
  c.lineJoin = 'round'
  land(); c.strokeStyle = 'rgba(150,210,235,0.55)'; c.lineWidth = 16; c.stroke() // flaches Wasser an der Küste
  land(); c.fillStyle = '#6f9c58'; c.fill()
  c.save(); land(); c.clip()
  const blob = (lon: number, lat: number, rx: number, ry: number, col: string) => { c.fillStyle = col; c.beginPath(); c.ellipse(X(lon), Y(lat), (rx / 360) * w, (ry / 180) * h * 1.16, 0, 0, TAU); c.fill() }
  for (const [lo, la, rx, ry] of [[10, 22, 30, 9], [45, 24, 12, 8], [60, 40, 22, 7], [95, 42, 16, 6], [133, -25, 14, 8], [-110, 33, 8, 7], [-69, -24, 4, 9], [20, -24, 6, 5]]) blob(lo, la, rx, ry, '#d6c08a')
  for (const [lo, la, rx, ry] of [[-60, -5, 14, 9], [22, 0, 10, 7], [105, 2, 12, 6], [-90, 17, 6, 4]]) blob(lo, la, rx, ry, '#3f8046')
  for (const [lo, la, rx, ry] of [[-110, 45, 5, 14], [-70, -20, 3, 22], [85, 32, 16, 4], [10, 46, 6, 2], [40, 9, 4, 6]]) blob(lo, la, rx, ry, '#9b8a6a')
  c.fillStyle = '#f2f6f8'; c.fillRect(0, 0, w, Y(68)); blob(-42, 73, 22, 12, '#f2f6f8')
  speckle(c, w, h, 9000, ['rgba(40,70,30,0.10)', 'rgba(255,255,220,0.08)'], 5, 4)
  c.restore()
  land(); c.strokeStyle = 'rgba(40,60,40,0.55)'; c.lineWidth = 2.5; c.stroke()
  c.fillStyle = '#eef3f6'; c.fillRect(0, Y(-68), w, h)
  // Gradnetz
  c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 2
  for (let lon = -180; lon <= 180; lon += 30) { c.beginPath(); c.moveTo(X(lon), 0); c.lineTo(X(lon), h); c.stroke() }
  for (let lat = -60; lat <= 60; lat += 30) { c.beginPath(); c.moveTo(0, Y(lat)); c.lineTo(w, Y(lat)); c.stroke() }
  c.strokeStyle = 'rgba(255,235,170,0.5)'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, Y(0)); c.lineTo(w, Y(0)); c.stroke()
}
function kugel(count: number): Built {
  const R = 1.2
  const fn: Fn = (u, v) => { const th = PI * (POLE + (1 - 2 * POLE) * v), lo = u * TAU; return V(Math.sin(th) * Math.sin(lo), Math.cos(th), Math.sin(th) * Math.cos(lo)).multiplyScalar(R) }
  const ice = mat(0xeef3f6, 0.5)
  const wood = mat(0x7a5236, 0.55)
  const statics = [
    mesh(new THREE.SphereGeometry(R, 40, 6, 0, TAU, 0, PI * POLE + 0.01), ice),
    mesh(new THREE.SphereGeometry(R, 40, 6, 0, TAU, PI * (1 - POLE) - 0.01, PI * POLE + 0.01), ice),
    mesh(new THREE.SphereGeometry(R - 0.06, 40, 24), mat(0xd9d3c8, 0.9, THREE.BackSide)),
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.32, 16).translate(0, -R - 0.14, 0), mat(0xc9a24a, 0.35)),
    mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.12, 48).translate(0, -R - 0.34, 0), wood),
  ]
  return { surfaces: [{ fn, nf: fn, ...G(count, [4, 3], [6, 4], [20, 10]), wrap: true, tw: 2048, th: 1024, thick: 0.05, paint: paintGlobe }], statics }
}

// ================= Kaffeetasse =================
function paintMug(c: C, w: number, h: number) {
  c.fillStyle = '#f3ecdf'; c.fillRect(0, 0, w, h)
  speckle(c, w, h, 2600, ['rgba(120,90,60,0.22)', 'rgba(90,70,50,0.14)', 'rgba(255,255,255,0.5)'], 9, 3)
  // blaue Ränder oben und unten
  for (const [y, hh] of [[0, 0.07], [0.93, 0.07]]) { c.fillStyle = '#2c5f8a'; c.fillRect(0, y * h, w, hh * h) }
  for (const y of [0.1, 0.895]) { c.fillStyle = '#2c5f8a'; c.fillRect(0, y * h, w, 0.012 * h) }
  // Blumenranke rundherum
  const n = 16
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n) * w, up = i % 2 === 0, y = (up ? 0.74 : 0.8) * h
    c.strokeStyle = '#3d7a4a'; c.lineWidth = 7; c.lineCap = 'round'
    c.beginPath(); c.moveTo(x - w / n / 2, 0.8 * h); c.quadraticCurveTo(x - w / n / 4, (up ? 0.86 : 0.7) * h, x, y); c.quadraticCurveTo(x + w / n / 4, (up ? 0.66 : 0.88) * h, x + w / n / 2, 0.8 * h); c.stroke()
    for (const d of [-1, 1]) { c.fillStyle = '#4f9159'; c.beginPath(); c.ellipse(x + d * 34, y + 30, 22, 9, d * 0.7, 0, TAU); c.fill() }
    const col = ['#c8443b', '#e0a233', '#2c5f8a'][i % 3]
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; c.fillStyle = col; c.beginPath(); c.ellipse(x + Math.cos(a) * 19, y + Math.sin(a) * 19, 15, 9, a, 0, TAU); c.fill() }
    c.fillStyle = '#f6d98a'; c.beginPath(); c.arc(x, y, 9, 0, TAU); c.fill()
  }
  // Schriftzug vorne, kleine Bohnen hinten
  c.fillStyle = '#2c3e55'; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.font = `italic 700 ${Math.round(h * 0.3)}px Georgia, "Times New Roman", serif`
  c.fillText('Kaffee', w / 2, h * 0.4)
  c.strokeStyle = '#c8443b'; c.lineWidth = 8; c.beginPath(); c.moveTo(w / 2 - h * 0.42, h * 0.58); c.quadraticCurveTo(w / 2, h * 0.63, w / 2 + h * 0.42, h * 0.58); c.stroke()
  for (const bx of [0.06, 0.15, 0.85, 0.94, 0.24, 0.76]) {
    const x = bx * w, y = h * (0.36 + 0.1 * Math.sin(bx * 40))
    c.save(); c.translate(x, y); c.rotate(bx * 9)
    c.fillStyle = '#6b4226'; c.beginPath(); c.ellipse(0, 0, 44, 30, 0, 0, TAU); c.fill()
    c.strokeStyle = '#3d2413'; c.lineWidth = 6; c.beginPath(); c.moveTo(-38, 0); c.quadraticCurveTo(0, -14, 38, 0); c.stroke()
    c.restore()
  }
  // Glanz der Glasur
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(0.3, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(60,40,20,0.10)')
  c.fillStyle = g; c.fillRect(0, 0, w, h)
}
function tasse(count: number): Built {
  const R = 0.84, top = 0.88, H = 1.76
  // u = 0.5 zeigt nach vorn, der Henkel sitzt rechts
  const fn: Fn = (u, v) => { const a = (u - 0.5) * TAU; return V(R * Math.sin(a), top - v * H, R * Math.cos(a)) }
  const nf: Fn = (u) => { const a = (u - 0.5) * TAU; return V(Math.sin(a), 0, Math.cos(a)) }
  const cream = mat(0xf3ecdf, 0.35)
  const blue = mat(0x2c5f8a, 0.35)
  const handle = new THREE.TorusGeometry(0.44, 0.105, 18, 40, PI * 1.08).rotateZ(-PI * 0.54).scale(1, 1.18, 1).translate(R - 0.03, 0, 0)
  const statics = [
    mesh(handle, blue),
    mesh(new THREE.CylinderGeometry(R - 0.075, R - 0.075, H - 0.08, 56, 1, true).translate(0, 0.04, 0), mat(0xf7f1e6, 0.4, THREE.BackSide)),
    mesh(new THREE.CircleGeometry(R - 0.075, 56).rotateX(-PI / 2).translate(0, top - 0.2, 0), mat(0x3b2415, 0.15)),
    mesh(new THREE.CylinderGeometry(R - 0.02, R - 0.06, 0.08, 56).translate(0, top - H - 0.02, 0), cream),
    mesh(new THREE.TorusGeometry(R - 0.035, 0.04, 12, 64).rotateX(PI / 2).translate(0, top, 0), blue),
  ]
  return { surfaces: [{ fn, nf, ...G(count, [6, 2], [8, 3], [25, 8]), wrap: true, tw: 2048, th: 688, thick: 0.06, paint: paintMug }], statics }
}

// ================= Kleines Haus =================
const HX = 1, HZ = 0.8, RC = 0.07, WTOP = 1.3, WBOT = 0.1
/** Grundriss als Linienzug: Rechteck mit leicht runden Ecken, von vorne links im Uhrzeigersinn (von oben gesehen). */
const OUTLINE = (() => {
  const pts: [number, number, number, number][] = []
  const arc = (cx: number, cz: number, f: (t: number) => [number, number]) => { for (let k = 1; k < 8; k++) { const [nx, nz] = f(((k / 8) * Math.PI) / 2); pts.push([cx + nx * RC, cz + nz * RC, nx, nz]) } }
  pts.push([-HX + RC, HZ, 0, 1], [HX - RC, HZ, 0, 1]); arc(HX - RC, HZ - RC, (t) => [Math.sin(t), Math.cos(t)])
  pts.push([HX, HZ - RC, 1, 0], [HX, -HZ + RC, 1, 0]); arc(HX - RC, -HZ + RC, (t) => [Math.cos(t), -Math.sin(t)])
  pts.push([HX - RC, -HZ, 0, -1], [-HX + RC, -HZ, 0, -1]); arc(-HX + RC, -HZ + RC, (t) => [-Math.sin(t), -Math.cos(t)])
  pts.push([-HX, -HZ + RC, -1, 0], [-HX, HZ - RC, -1, 0]); arc(-HX + RC, HZ - RC, (t) => [-Math.cos(t), Math.sin(t)])
  pts.push(pts[0])
  const len = [0]
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  return { pts, len, total: len[len.length - 1] }
})()
const PER = OUTLINE.total
function perim(t: number): [number, number, number, number] {
  const d = (((t % 1) + 1) % 1) * PER
  const { pts, len } = OUTLINE
  let i = 1
  while (i < len.length - 1 && len[i] < d) i++
  const k = (d - len[i - 1]) / Math.max(1e-9, len[i] - len[i - 1]), a = pts[i - 1], b = pts[i]
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k]
}
function paintWalls(c: C, w: number, h: number) {
  const beam = '#5a3b26'
  c.fillStyle = '#f4ead6'; c.fillRect(0, 0, w, h)
  speckle(c, w, h, 5000, ['rgba(160,130,90,0.12)', 'rgba(255,255,255,0.35)'], 21, 4)
  // Wandgrenzen in u: vorne, rechts, hinten, links
  const f = [0, (2 * HX) / PER, (2 * HX + 2 * HZ) / PER, (4 * HX + 2 * HZ) / PER, 1].map((x) => x * w)
  const base = h * 0.86
  // Steinsockel
  c.fillStyle = '#9a9388'; c.fillRect(0, base, w, h - base)
  const r = rng(77)
  for (let y = base; y < h; y += (h - base) / 2) for (let x = -40; x < w; x += 78) {
    c.fillStyle = ['#8b857b', '#a39c90', '#7f7a72', '#b0a99c'][(r() * 4) | 0]
    c.fillRect(x + (y === base ? 0 : 39) + 2, y + 2, 74, (h - base) / 2 - 4)
  }
  const bw = h * 0.06
  c.fillStyle = beam; c.fillRect(0, 0, w, bw * 1.1); c.fillRect(0, base - bw * 0.8, w, bw * 0.8)
  const window_ = (cx: number, cy: number, ww: number, wh: number) => {
    c.fillStyle = '#2f6f62'; c.fillRect(cx - ww * 1.02, cy - wh / 2, ww * 0.5, wh); c.fillRect(cx + ww * 0.52, cy - wh / 2, ww * 0.5, wh)
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 3
    for (let k = 1; k < 6; k++) { for (const sx of [cx - ww * 1.02, cx + ww * 0.52]) { c.beginPath(); c.moveTo(sx + 4, cy - wh / 2 + (k * wh) / 6); c.lineTo(sx + ww * 0.5 - 4, cy - wh / 2 + (k * wh) / 6); c.stroke() } }
    c.fillStyle = '#fffaf0'; c.fillRect(cx - ww / 2 - 8, cy - wh / 2 - 8, ww + 16, wh + 16)
    const g = c.createLinearGradient(0, cy - wh / 2, 0, cy + wh / 2); g.addColorStop(0, '#9fc9de'); g.addColorStop(1, '#5d8fae')
    c.fillStyle = g; c.fillRect(cx - ww / 2, cy - wh / 2, ww, wh)
    c.fillStyle = 'rgba(255,255,255,0.35)'; poly(c, [[cx - ww / 2, cy], [cx - ww / 2, cy - wh / 2], [cx, cy - wh / 2]], 'rgba(255,255,255,0.3)')
    c.fillStyle = '#fffaf0'; c.fillRect(cx - 4, cy - wh / 2, 8, wh); c.fillRect(cx - ww / 2, cy - 4, ww, 8)
    // Blumenkasten
    c.fillStyle = '#7a5236'; c.fillRect(cx - ww / 2 - 14, cy + wh / 2 + 8, ww + 28, wh * 0.2)
    for (let k = 0; k < 9; k++) { const fx = cx - ww / 2 - 6 + (k / 8) * (ww + 12); c.fillStyle = '#3f8046'; c.beginPath(); c.arc(fx, cy + wh / 2 + 8, 15, 0, TAU); c.fill(); c.fillStyle = ['#d43d3d', '#f2b632', '#e86aa0'][k % 3]; c.beginPath(); c.arc(fx, cy + wh / 2 - 2, 10, 0, TAU); c.fill() }
  }
  for (let i = 0; i < 4; i++) {
    const x0 = f[i], x1 = f[i + 1], ww = x1 - x0, long = i % 2 === 0
    // Fachwerk: Eckpfosten, Mittelpfosten, Streben
    c.fillStyle = beam
    c.fillRect(x0 - bw / 2, 0, bw, base); c.fillRect(x1 - bw / 2, 0, bw, base)
    const posts = long ? [1 / 3, 2 / 3] : [0.5]
    for (const p of posts) c.fillRect(x0 + ww * p - bw * 0.4, 0, bw * 0.8, base)
    c.fillRect(x0, base * 0.47, ww, bw * 0.7)
    c.strokeStyle = beam; c.lineWidth = bw * 0.7; c.lineCap = 'butt'
    const brace = (xa: number, xb: number) => { c.beginPath(); c.moveTo(xa, base * 0.5); c.lineTo(xb, base - bw); c.stroke() }
    brace(x0 + ww * (long ? 0.14 : 0.2), x0 + bw); brace(x1 - ww * (long ? 0.14 : 0.2), x1 - bw)
    if (i === 0) {
      // Haustür links, Fenster rechts
      const dx = x0 + ww * 0.5, dw = ww * 0.15, dt = base * 0.3
      c.fillStyle = '#fffaf0'; c.fillRect(dx - dw / 2 - 10, dt - 10, dw + 20, base - dt + 10)
      c.fillStyle = '#2f6f62'; c.fillRect(dx - dw / 2, dt, dw, base - dt)
      c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = 4; c.strokeRect(dx - dw / 2 + 14, dt + 14, dw - 28, (base - dt) * 0.4); c.strokeRect(dx - dw / 2 + 14, dt + (base - dt) * 0.5, dw - 28, (base - dt) * 0.42)
      c.fillStyle = '#e3b23c'; c.beginPath(); c.arc(dx + dw / 2 - 22, dt + (base - dt) * 0.52, 9, 0, TAU); c.fill()
      window_(x0 + ww * 0.17, base * 0.6, ww * 0.12, base * 0.3); window_(x0 + ww * 0.83, base * 0.6, ww * 0.12, base * 0.3)
      window_(x0 + ww * 0.17, base * 0.24, ww * 0.1, base * 0.2); window_(x0 + ww * 0.83, base * 0.24, ww * 0.1, base * 0.2)
    } else if (long) {
      for (const p of [1 / 6, 0.5, 5 / 6]) window_(x0 + ww * p, base * 0.66, ww * 0.1, base * 0.26)
      // Efeu an der Rückwand
      const rr = rng(5)
      for (let k = 0; k < 260; k++) { const t = rr(), ex = x0 + ww * (0.3 + 0.1 * Math.sin(t * 9)) + (rr() - 0.5) * ww * 0.1 * (1 - t), ey = base - t * base * 0.92; c.fillStyle = ['#3f8046', '#2f6a3a', '#5a9a52'][k % 3]; c.beginPath(); c.ellipse(ex, ey, 13, 9, rr() * 3, 0, TAU); c.fill() }
    } else {
      window_(x0 + ww * 0.27, base * 0.66, ww * 0.16, base * 0.26); window_(x0 + ww * 0.73, base * 0.66, ww * 0.16, base * 0.26)
      window_(x0 + ww * 0.5, base * 0.24, ww * 0.16, base * 0.2)
    }
  }
}
function paintRoof(c: C, w: number, h: number) {
  c.fillStyle = '#a8452f'; c.fillRect(0, 0, w, h)
  const r = rng(31), rows = 22, tw = w / 26, rh = h / rows
  for (let j = 0; j < rows; j++) {
    // beide Dachseiten laufen vom First (Mitte) zur Traufe
    const y = j * rh
    for (let i = -1; i < 27; i++) {
      const x = i * tw + (j % 2 ? tw / 2 : 0), k = r()
      c.fillStyle = k < 0.12 ? '#8f3a27' : k < 0.3 ? '#b9523a' : k < 0.36 ? '#7d6a4a' : '#a8452f'
      c.beginPath()
      const down = j >= rows / 2
      if (down) { c.moveTo(x, y); c.lineTo(x + tw - 3, y); c.lineTo(x + tw - 3, y + rh * 0.6); c.arc(x + (tw - 3) / 2, y + rh * 0.6, (tw - 3) / 2, 0, PI); c.closePath() }
      else { c.moveTo(x, y + rh); c.lineTo(x + tw - 3, y + rh); c.lineTo(x + tw - 3, y + rh * 0.4); c.arc(x + (tw - 3) / 2, y + rh * 0.4, (tw - 3) / 2, 0, PI, true); c.closePath() }
      c.fill()
      c.strokeStyle = 'rgba(40,12,6,0.35)'; c.lineWidth = 2.5; c.stroke()
    }
  }
  c.fillStyle = '#7a2f20'; c.fillRect(0, h / 2 - rh * 0.45, w, rh * 0.9)
  for (let i = 0; i < 26; i++) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(i * tw, h / 2 - rh * 0.45, 3, rh * 0.9) }
  // Dachfenster vorne
  const sx = w * 0.3, sy = h * 0.7, sw = w * 0.13, sh = h * 0.13
  c.fillStyle = '#4a3a30'; c.fillRect(sx - 10, sy - 10, sw + 20, sh + 20)
  const g = c.createLinearGradient(0, sy, 0, sy + sh); g.addColorStop(0, '#a9d0e2'); g.addColorStop(1, '#5d8fae'); c.fillStyle = g; c.fillRect(sx, sy, sw, sh)
  c.fillStyle = '#4a3a30'; c.fillRect(sx + sw / 2 - 4, sy, 8, sh)
  speckle(c, w, h, 1500, ['rgba(90,120,60,0.25)', 'rgba(0,0,0,0.08)'], 8, 6)
}
function haus(count: number): Built {
  const big = count === 24
  const walls: Fn = (u, v) => { const [x, z] = perim(u); return V(x, WTOP - v * (WTOP - WBOT), z) }
  const wallsN: Fn = (u) => { const p = perim(u); return V(p[2], 0, p[3]) }
  const EAVE = 1.0, LEN = 1.22
  const roof: Fn = (u, v) => { const z = (2 * v - 1) * EAVE; return V((2 * u - 1) * LEN, 2.14 - Math.sqrt(z * z + 0.004) * 1.0, z) }
  const plaster = mat(0xf4ead6, 0.85)
  const tri = new THREE.Shape(); tri.moveTo(-HZ, WTOP); tri.lineTo(HZ, WTOP); tri.lineTo(0, WTOP + HZ); tri.closePath()
  const gable = (x: number) => mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.06, bevelEnabled: false }).rotateY(PI / 2).translate(x, 0, 0), plaster)
  const statics: THREE.Object3D[] = [
    mesh(new THREE.BoxGeometry(2 * HX + 0.3, 0.1, 2 * HZ + 0.3).translate(0, 0.05, 0), mat(0x8f8a80, 0.9)),
    mesh(new THREE.BoxGeometry(0.5, 0.06, 0.24).translate(0, 0.13, HZ + 0.12), mat(0xb0a99c, 0.9)),
    gable(HX - 0.07), gable(-HX + 0.01),
    mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06).translate(HX - 0.02, WTOP + 0.38, 0), mat(0x5a3b26, 0.8)),
    mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06).translate(-HX + 0.02, WTOP + 0.38, 0), mat(0x5a3b26, 0.8)),
    mesh(new THREE.BoxGeometry(0.26, 0.62, 0.26).translate(0.55, 1.98, -0.42), mat(0x9a5a44, 0.9)),
    mesh(new THREE.BoxGeometry(0.34, 0.07, 0.34).translate(0.55, 2.32, -0.42), mat(0x5c4a3a, 0.9)),
    mesh(new THREE.BoxGeometry(2 * HX - 0.2, 0.02, 2 * HZ - 0.2).translate(0, 0.11, 0), mat(0xb08a5a, 0.8)),
  ]
  return {
    surfaces: [
      { fn: walls, nf: wallsN, ...(count === 200 ? { cols: 24, rows: 6 } : big ? { cols: 8, rows: 2 } : { cols: 6, rows: 1 }), wrap: true, tw: 2880, th: 512, thick: 0.05, paint: paintWalls },
      { fn: roof, ...(count === 200 ? { cols: 7, rows: 8 } : { cols: big ? 4 : 3, rows: 2 }), wrap: false, tw: 1280, th: 1024, thick: 0.05, paint: paintRoof },
    ],
    statics,
  }
}

// ================= Sneaker =================
const SOLE = 0.3, S0 = 0.03, S1 = 0.97
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const shoeX = (s: number) => -1.4 + 2.8 * s
const shoeW = (s: number) => 0.5 * Math.pow(Math.max(0, Math.sin(PI * Math.pow(s, 0.82))), 0.42) * (0.84 + 0.26 * s)
const shoeH = (s: number) => (0.4 + 0.66 * (1 - sm(0.3, 0.74, s))) * (0.72 + 0.28 * Math.min(1, s / 0.12)) * (0.7 + 0.3 * Math.min(1, (1 - s) / 0.08))
/** Obermaterial: s läuft von der Ferse zur Spitze, a von der linken Sohlenkante über den Spann zur rechten. */
function shoeP(s: number, a: number, k = 1): THREE.Vector3 {
  const sn = Math.pow(Math.max(0, Math.sin(a)), 0.78)
  // Einstieg: flache Mulde oben am Schaft
  const d = Math.hypot((s - 0.25) / 0.16, (a - PI / 2) / (0.21 * PI))
  const dip = d < 1 ? Math.pow(1 - d * d, 2) * 0.3 : 0
  return V(shoeX(s), SOLE + shoeH(s) * k * sn - dip, shoeW(s) * k * Math.cos(a))
}
function paintShoe(c: C, w: number, h: number) {
  const X = (s: number) => ((s - S0) / (S1 - S0)) * w, Y = (a: number) => a * h // a in Anteilen von PI
  const teal = '#1f5f57', dark = '#17443f', orange = '#e8892b', white = '#f4f1ea'
  c.fillStyle = white; c.fillRect(0, 0, w, h)
  speckle(c, w, h, 9000, ['rgba(0,0,0,0.035)', 'rgba(255,255,255,0.5)'], 13, 3)
  for (const side of [0, 1]) {
    const y = (a: number) => (side ? h - Y(a) : Y(a))
    // Seitenteil mit Streifen
    poly(c, [[X(0.1), y(0.07)], [X(0.56), y(0.07)], [X(0.64), y(0.2)], [X(0.52), y(0.345)], [X(0.1), y(0.3)]], teal)
    stitch(c, [[X(0.11), y(0.085)], [X(0.555), y(0.085)], [X(0.625), y(0.2)], [X(0.515), y(0.33)], [X(0.11), y(0.285)]])
    poly(c, [[X(0.2), y(0.09)], [X(0.27), y(0.09)], [X(0.44), y(0.3)], [X(0.37), y(0.3)]], orange)
    poly(c, [[X(0.31), y(0.09)], [X(0.36), y(0.09)], [X(0.5), y(0.27)], [X(0.46), y(0.29)]], '#f4c06a')
    // Ösenleiste mit Ösen
    poly(c, [[X(0.4), y(0.33)], [X(0.68), y(0.3)], [X(0.69), y(0.375)], [X(0.4), y(0.4)]], dark)
    for (let k = 0; k < 6; k++) { const s = 0.43 + k * 0.045, yy = y(0.365 - k * 0.004); c.fillStyle = '#d9d4c8'; c.beginPath(); c.arc(X(s), yy, 15, 0, TAU); c.fill(); c.fillStyle = '#1a1512'; c.beginPath(); c.arc(X(s), yy, 7, 0, TAU); c.fill() }
    // Mittelsohlen-Rand
    c.fillStyle = '#e9e4d8'; c.fillRect(0, side ? h - Y(0.045) : 0, w, Y(0.045))
    c.fillStyle = orange; c.fillRect(0, side ? h - Y(0.058) : Y(0.045), w, Y(0.013))
    // Belüftung am Vorderfuß
    for (let k = 0; k < 14; k++) { c.fillStyle = 'rgba(40,30,20,0.4)'; c.beginPath(); c.arc(X(0.7 + (k % 7) * 0.016), y(0.13 + ((k / 7) | 0) * 0.05 + (k % 7) * 0.006), 6, 0, TAU); c.fill() }
  }
  // Ferse
  c.fillStyle = teal; c.fillRect(0, 0, X(0.1), h)
  stitch(c, [[X(0.092), Y(0.06)], [X(0.092), Y(0.94)]])
  c.fillStyle = orange; c.fillRect(0, Y(0.44), X(0.085), Y(0.12))
  // Zehenkappe
  c.fillStyle = '#e9e4d8'; c.beginPath(); c.moveTo(w, 0); c.lineTo(X(0.84), 0); c.quadraticCurveTo(X(0.76), h / 2, X(0.84), h); c.lineTo(w, h); c.closePath(); c.fill()
  c.save(); c.setLineDash([12, 9]); c.strokeStyle = 'rgba(60,50,40,0.5)'; c.lineWidth = 3; c.beginPath(); c.moveTo(X(0.848), 0); c.quadraticCurveTo(X(0.772), h / 2, X(0.848), h); c.stroke(); c.restore()
  // Zunge und Schnürsenkel
  poly(c, [[X(0.38), Y(0.4)], [X(0.7), Y(0.375)], [X(0.72), Y(0.5)], [X(0.7), Y(0.625)], [X(0.38), Y(0.6)]], '#fbf9f4')
  for (let k = 0; k < 6; k++) {
    const s = 0.43 + k * 0.045, ya = Y(0.365 - k * 0.004), yb = h - ya
    for (const [sa, sb] of [[s, s + 0.045], [s + 0.045, s]]) {
      if (k === 5) continue
      c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 26; c.lineCap = 'round'; c.beginPath(); c.moveTo(X(sa) + 4, ya + 6); c.lineTo(X(sb) + 4, yb + 6); c.stroke()
      c.strokeStyle = '#ffffff'; c.lineWidth = 20; c.beginPath(); c.moveTo(X(sa), ya); c.lineTo(X(sb), yb); c.stroke()
      c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 2; c.beginPath(); c.moveTo(X(sa), ya - 5); c.lineTo(X(sb), yb - 5); c.stroke()
    }
  }
  // Einstieg: gepolsterter Kragen und dunkles Futter
  const ex = X(0.25), ey = h / 2, rx = X(0.25 + 0.15) - ex, ry = Y(0.2)
  c.fillStyle = dark; c.beginPath(); c.ellipse(ex, ey, rx * 1.16, ry * 1.2, 0, 0, TAU); c.fill()
  c.save(); c.setLineDash([12, 9]); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 3; c.beginPath(); c.ellipse(ex, ey, rx * 1.09, ry * 1.13, 0, 0, TAU); c.stroke(); c.restore()
  const g = c.createRadialGradient(ex, ey, rx * 0.1, ex, ey, rx)
  g.addColorStop(0, '#0f0c0a'); g.addColorStop(0.8, '#2a2320'); g.addColorStop(1, '#4a3f38')
  c.fillStyle = g; c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, TAU); c.fill()
}
/** Feste Gummiteile des Schuhs: gewölbte Platte mit Dicke. */
function slab(fn: Fn, u0: number, u1: number, v0: number, v1: number, nu: number, nv: number, t: number, nf?: Fn): THREE.BufferGeometry {
  const P: THREE.Vector3[] = [], N: THREE.Vector3[] = [], e = 1e-3
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const u = u0 + ((u1 - u0) * i) / nu, v = v0 + ((v1 - v0) * j) / nv
    P.push(fn(u, v)); N.push(nf ? nf(u, v) : fn(u + e, v).sub(fn(u - e, v)).cross(fn(u, v + e).sub(fn(u, v - e))).normalize())
  }
  const pos: number[] = [], idx: number[] = [], M = P.length
  const I = P.map((p, k) => p.clone().addScaledVector(N[k], -t))
  for (const p of [...P, ...I]) pos.push(p.x, p.y, p.z)
  const id = (i: number, j: number) => i * (nv + 1) + j
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = id(i, j), b = id(i + 1, j), cc = id(i + 1, j + 1), d = id(i, j + 1); idx.push(a, b, d, b, cc, d, a + M, d + M, b + M, b + M, d + M, cc + M) }
  const wall = (k1: number, k2: number) => idx.push(k1, k2, k2 + M, k1, k2 + M, k1 + M)
  for (let j = 0; j < nv; j++) { wall(id(0, j), id(0, j + 1)); wall(id(nu, j), id(nu, j + 1)) }
  for (let i = 0; i < nu; i++) { wall(id(i, 0), id(i + 1, 0)); wall(id(i, nv), id(i + 1, nv)) }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx)
  const flat = g.toNonIndexed(); flat.computeVertexNormals(); g.dispose()
  return flat
}
function sneaker(count: number): Built {
  const fn: Fn = (u, v) => shoeP(S0 + (S1 - S0) * u, v * PI)
  const rubber = mat(0xf2efe8, 0.75), outsole = mat(0x2a2623, 0.9), teal = mat(0x1f5f57, 0.6)
  const up = (k: number): Fn => (s, a) => shoeP(s, a, k)
  const top: Fn = (s, v) => V(shoeX(s), SOLE, v * (shoeW(s) + 0.07))
  const upN = () => V(0, 1, 0)
  const statics: THREE.Object3D[] = [
    mesh(slab(top, 0.002, 0.998, -1, 1, 60, 8, SOLE - 0.05, upN), rubber), // Mittelsohle
    mesh(slab((s, v) => V(shoeX(s), 0.05, v * (shoeW(s) + 0.06)), 0.004, 0.996, -1, 1, 60, 8, 0.05, upN), outsole), // Laufsohle
    mesh(slab(up(1.05), 0.86, 0.998, 0, PI, 16, 24, 0.05), rubber), // Zehenschutz
    mesh(slab(up(1.04), 0.002, 0.06, 0, PI, 8, 24, 0.05), teal), // Fersenkappe
    mesh(slab(up(0.97), 0.02, 0.98, 0, PI, 50, 20, 0.02), mat(0x3a332d, 0.9)), // Innenfutter
  ]
  return { surfaces: [{ fn, ...G(count, [4, 3], [6, 4], [20, 10]), wrap: false, tw: 2048, th: 1024, thick: 0.05, paint: paintShoe }], statics }
}

// ================= Leuchtturm =================
const LT_TOP = 1.55, LT_H = 2.75
const ltR = (t: number) => 0.36 + 0.2 * t
const ltY = (t: number) => LT_TOP - t * LT_H
function paintLighthouse(c: C, w: number, h: number) {
  const bands = 5
  for (let i = 0; i < bands; i++) { c.fillStyle = i % 2 ? '#f4f1ea' : '#c8362f'; c.fillRect(0, (i / bands) * h, w, h / bands + 1) }
  speckle(c, w, h, 7000, ['rgba(0,0,0,0.06)', 'rgba(255,255,255,0.25)'], 41, 4)
  // feine Fugen der Mauer
  c.strokeStyle = 'rgba(0,0,0,0.08)'; c.lineWidth = 2
  for (let y = 0; y < h; y += h / 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke() }
  // Fenster in einer Spirale, Tür vorn unten
  const win = (x: number, y: number, s: number) => {
    c.fillStyle = '#2c3e55'; c.fillRect(x - s * 0.55, y - s, s * 1.1, s * 2)
    c.beginPath(); c.arc(x, y - s, s * 0.55, PI, 0); c.fill()
    c.fillStyle = '#9fc9de'; c.fillRect(x - s * 0.38, y - s * 0.85, s * 0.76, s * 1.7)
    c.fillStyle = '#2c3e55'; c.fillRect(x - 3, y - s * 0.85, 6, s * 1.7)
  }
  for (let k = 0; k < 6; k++) win(((0.5 + k * 0.37) % 1) * w, h * (0.12 + k * 0.13), h * 0.028)
  const dx = w / 2, dw = w * 0.05, dt = h * 0.84
  c.fillStyle = '#5a3b26'; c.fillRect(dx - dw / 2, dt, dw, h - dt)
  c.beginPath(); c.arc(dx, dt, dw / 2, PI, 0); c.fill()
  c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 4; c.strokeRect(dx - dw / 2 + 10, dt + 10, dw - 20, h - dt - 14)
  c.fillStyle = '#e3b23c'; c.beginPath(); c.arc(dx + dw * 0.3, dt + (h - dt) * 0.5, 7, 0, TAU); c.fill()
  // Schatten unten
  const g = c.createLinearGradient(0, h * 0.8, 0, h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(40,30,20,0.25)')
  c.fillStyle = g; c.fillRect(0, h * 0.8, w, h * 0.2)
}
function leuchtturm(count: number): Built {
  const { fn, nf } = rev(ltR, ltY, 0, 1)
  const red = mat(0xc8362f, 0.5), dark = mat(0x2a2623, 0.6), rock = mat(0x8b857b, 0.95)
  const glass = new THREE.MeshStandardMaterial({ color: 0xfff1b0, emissive: 0xffd36a, emissiveIntensity: 0.55, roughness: 0.15, transparent: true, opacity: 0.85 })
  const statics: THREE.Object3D[] = [
    mesh(new THREE.CylinderGeometry(ltR(0) - 0.05, ltR(1) - 0.05, LT_H, 40, 1, true).translate(0, LT_TOP - LT_H / 2, 0), mat(0xd9d3c8, 0.9, THREE.BackSide)),
    mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.06, 48).translate(0, LT_TOP + 0.03, 0), dark), // Rundgang
    mesh(new THREE.TorusGeometry(0.54, 0.018, 8, 64).rotateX(PI / 2).translate(0, LT_TOP + 0.26, 0), dark), // Geländer
    mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.36, 32).translate(0, LT_TOP + 0.24, 0), glass), // Laterne
    mesh(new THREE.ConeGeometry(0.38, 0.32, 32).translate(0, LT_TOP + 0.58, 0), red), // Dach
    mesh(new THREE.SphereGeometry(0.05, 16, 10).translate(0, LT_TOP + 0.76, 0), dark),
    mesh(new THREE.CylinderGeometry(0.95, 1.12, 0.3, 9).translate(0, ltY(1) - 0.15, 0), rock), // Fels
  ]
  for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; statics.push(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6).translate(Math.sin(a) * 0.54, LT_TOP + 0.15, Math.cos(a) * 0.54), dark)) }
  return { surfaces: [{ fn, nf, ...G(count, [4, 3], [6, 4], [20, 10]), wrap: true, tw: 2048, th: 1600, thick: 0.05, paint: paintLighthouse }], statics }
}

// ================= Heißluftballon =================
const BAL_T = 0.06
const balR = (t: number) => (t < 0.62 ? 1.08 * Math.sin(Math.max(0, t) / 0.62 * PI * 0.6) : 1.08 * Math.sin(PI * 0.6) * (1 - (t - 0.62) / 0.38 * 0.72))
const balY = (t: number) => (t < 0.62 ? 0.35 + 1.08 * Math.cos(Math.max(0, t) / 0.62 * PI * 0.6) : 0.35 + 1.08 * Math.cos(PI * 0.6) - ((t - 0.62) / 0.38) * 1.15)
function paintBalloon(c: C, w: number, h: number) {
  const cols = ['#c8362f', '#e8a531', '#2c5f8a', '#f4f1ea', '#3d7a4a', '#e8a531']
  const n = 12
  for (let i = 0; i < n; i++) { c.fillStyle = cols[i % cols.length]; c.fillRect((i / n) * w, 0, w / n + 1, h) }
  // Zickzack-Band in der Mitte
  c.fillStyle = '#f4f1ea'
  c.beginPath(); c.moveTo(0, h * 0.5)
  for (let i = 0; i <= 48; i++) c.lineTo((i / 48) * w, h * (i % 2 ? 0.44 : 0.56))
  c.lineTo(w, h * 0.62); c.lineTo(0, h * 0.62); c.closePath(); c.fill()
  c.fillStyle = '#c8362f'; c.fillRect(0, h * 0.62, w, h * 0.025)
  // Sonne vorne
  const sx = w / 2, sy = h * 0.3
  c.fillStyle = '#f6d98a'; for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; poly(c, [[sx + Math.cos(a - 0.12) * 50, sy + Math.sin(a - 0.12) * 50], [sx + Math.cos(a) * 95, sy + Math.sin(a) * 95], [sx + Math.cos(a + 0.12) * 50, sy + Math.sin(a + 0.12) * 50]], '#f6d98a') }
  c.fillStyle = '#e8a531'; c.beginPath(); c.arc(sx, sy, 55, 0, TAU); c.fill()
  // Nähte zwischen den Bahnen
  c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 3
  for (let i = 0; i < n; i++) { c.beginPath(); c.moveTo((i / n) * w, 0); c.lineTo((i / n) * w, h); c.stroke() }
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.18)')
  c.fillStyle = g; c.fillRect(0, 0, w, h)
}
function ballon(count: number): Built {
  const { fn, nf } = rev(balR, balY, BAL_T, 1)
  const wicker = mat(0x9a6b3e, 0.9), rope = mat(0x5c4a3a, 0.8)
  const mouth = balR(1), my = balY(1)
  const statics: THREE.Object3D[] = [
    lathe(balR, balY, 0, BAL_T + 0.005, mat(0xc8362f, 0.6), 8), // Kappe oben
    mesh(new THREE.SphereGeometry(0.9, 40, 24).translate(0, 0.3, 0), mat(0x2a2320, 0.95, THREE.BackSide)),
    mesh(new THREE.BoxGeometry(0.5, 0.36, 0.5).translate(0, my - 0.62, 0), wicker), // Korb
    mesh(new THREE.BoxGeometry(0.54, 0.05, 0.54).translate(0, my - 0.44, 0), mat(0x6b4226, 0.8)),
    mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.14, 16).translate(0, my - 0.1, 0), mat(0x6f6f6f, 0.4)), // Brenner
  ]
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const a = new THREE.Vector3(sx * 0.23, my - 0.44, sz * 0.23), b = new THREE.Vector3(sx * mouth * 0.7, my, sz * mouth * 0.7)
    const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5)
    const m = mesh(new THREE.CylinderGeometry(0.01, 0.01, len, 6), rope)
    m.position.copy(mid); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
    statics.push(m)
  }
  return { surfaces: [{ fn, nf, ...G(count, [4, 3], [6, 4], [20, 10]), wrap: true, tw: 2048, th: 1280, thick: 0.05, paint: paintBalloon }], statics }
}

// ================= Blumenvase =================
const vaR = (t: number) => 0.26 + 0.52 * Math.exp(-(((t - 0.62) / 0.27) ** 2)) + 0.1 * t * t
const vaY = (t: number) => 1.25 - t * 2.5
function paintVase(c: C, w: number, h: number) {
  const blue = '#24508f', light = '#5f86c0'
  c.fillStyle = '#f7f4ec'; c.fillRect(0, 0, w, h)
  speckle(c, w, h, 3000, ['rgba(40,70,130,0.08)', 'rgba(255,255,255,0.6)'], 61, 3)
  // Ränder
  for (const [y, hh] of [[0, 0.05], [0.95, 0.05]]) { c.fillStyle = blue; c.fillRect(0, y * h, w, hh * h) }
  c.fillStyle = light; c.fillRect(0, 0.07 * h, w, 0.012 * h); c.fillRect(0, 0.918 * h, w, 0.012 * h)
  // Bögen am Hals
  c.strokeStyle = blue; c.lineWidth = 6
  for (let i = 0; i < 16; i++) { const x = ((i + 0.5) / 16) * w; c.beginPath(); c.arc(x, h * 0.1, w / 32, 0, PI); c.stroke() }
  // große Blumen rundherum (vorne die größte)
  const flower = (x: number, y: number, s: number) => {
    c.strokeStyle = blue; c.lineWidth = s * 0.07; c.lineCap = 'round'
    c.beginPath(); c.moveTo(x, y + s * 0.3); c.quadraticCurveTo(x - s * 0.3, y + s * 1.1, x + s * 0.1, y + s * 1.7); c.stroke()
    for (const d of [-1, 1]) { c.fillStyle = light; c.beginPath(); c.ellipse(x + d * s * 0.42, y + s * 1.0, s * 0.4, s * 0.14, d * 0.6, 0, TAU); c.fill() }
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; c.fillStyle = k % 2 ? blue : light; c.beginPath(); c.ellipse(x + Math.cos(a) * s * 0.38, y + Math.sin(a) * s * 0.38, s * 0.3, s * 0.15, a, 0, TAU); c.fill() }
    c.fillStyle = blue; c.beginPath(); c.arc(x, y, s * 0.16, 0, TAU); c.fill()
    c.fillStyle = '#f7f4ec'; c.beginPath(); c.arc(x, y, s * 0.07, 0, TAU); c.fill()
  }
  flower(w / 2, h * 0.42, h * 0.2)
  for (const [u, v, s] of [[0.25, 0.5, 0.15], [0.75, 0.5, 0.15], [0.0, 0.44, 0.18], [1.0, 0.44, 0.18], [0.37, 0.7, 0.09], [0.63, 0.7, 0.09], [0.12, 0.7, 0.1], [0.88, 0.7, 0.1]]) flower(u * w, v * h, s * h)
  // Punktband unten
  for (let i = 0; i < 40; i++) { c.fillStyle = blue; c.beginPath(); c.arc(((i + 0.5) / 40) * w, h * 0.88, 8, 0, TAU); c.fill() }
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(30,40,60,0.08)')
  c.fillStyle = g; c.fillRect(0, 0, w, h)
}
function vase(count: number): Built {
  const { fn, nf } = rev(vaR, vaY, 0, 1)
  const blue = mat(0x24508f, 0.3)
  const statics: THREE.Object3D[] = [
    lathe((t) => vaR(t) - 0.05, vaY, 0, 1, mat(0xece6da, 0.5, THREE.BackSide), 40),
    mesh(new THREE.TorusGeometry(vaR(0) - 0.01, 0.035, 12, 56).rotateX(PI / 2).translate(0, vaY(0), 0), blue),
    mesh(new THREE.CylinderGeometry(vaR(1) - 0.02, vaR(1) + 0.02, 0.07, 48).translate(0, vaY(1) - 0.03, 0), blue),
    mesh(new THREE.CircleGeometry(vaR(0) - 0.05, 40).rotateX(-PI / 2).translate(0, vaY(0) - 0.25, 0), mat(0x1d2a20, 0.9)),
  ]
  // Blumenstrauß oben drin
  const stem = mat(0x3d7a4a, 0.7)
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU, x = Math.sin(a) * 0.12, z = Math.cos(a) * 0.12
    statics.push(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 6).translate(x, vaY(0) + 0.15, z), stem))
    statics.push(mesh(new THREE.SphereGeometry(0.11, 16, 12).scale(1, 0.6, 1).translate(x * 1.6, vaY(0) + 0.5, z * 1.6), mat([0xc8362f, 0xe8a531, 0xf4f1ea, 0xe86aa0, 0xc8362f][k], 0.6)))
  }
  return { surfaces: [{ fn, nf, ...G(count, [4, 3], [6, 4], [20, 10]), wrap: true, tw: 2048, th: 1280, thick: 0.05, paint: paintVase }], statics }
}

// ================= Osterei =================
const EI_T = 0.07
const eiR = (t: number) => 0.82 * Math.sin(t * PI) * (1 + 0.1 * Math.cos(t * PI) * -1)
const eiY = (t: number) => 1.12 * Math.cos(t * PI)
function paintEgg(c: C, w: number, h: number) {
  c.fillStyle = '#c8362f'; c.fillRect(0, 0, w, h)
  speckle(c, w, h, 4000, ['rgba(0,0,0,0.06)', 'rgba(255,255,255,0.12)'], 71, 3)
  // Bänder
  const band = (y: number, hh: number, col: string) => { c.fillStyle = col; c.fillRect(0, y * h, w, hh * h) }
  band(0.3, 0.05, '#f6d98a'); band(0.65, 0.05, '#f6d98a'); band(0.355, 0.008, '#2c3e55'); band(0.637, 0.008, '#2c3e55')
  band(0.405, 0.23, '#2c5f8a')
  // Tulpen auf dem blauen Band
  for (let i = 0; i < 8; i++) {
    const x = ((i + 0.5) / 8) * w, y = h * 0.52, s = h * 0.07
    c.fillStyle = '#3d7a4a'; c.fillRect(x - 4, y, 8, s * 1.2)
    for (const d of [-1, 1]) { c.beginPath(); c.ellipse(x + d * s * 0.4, y + s * 0.8, s * 0.38, s * 0.13, d * 0.7, 0, TAU); c.fill() }
    c.fillStyle = i % 2 ? '#f6d98a' : '#f4f1ea'
    c.beginPath(); c.moveTo(x - s * 0.5, y - s * 0.6); c.lineTo(x - s * 0.25, y - s * 0.2); c.lineTo(x, y - s * 0.7); c.lineTo(x + s * 0.25, y - s * 0.2); c.lineTo(x + s * 0.5, y - s * 0.6); c.quadraticCurveTo(x + s * 0.55, y + s * 0.15, x, y + s * 0.1); c.quadraticCurveTo(x - s * 0.55, y + s * 0.15, x - s * 0.5, y - s * 0.6); c.fill()
  }
  // Zacken und Punkte oben und unten
  c.fillStyle = '#f4f1ea'
  for (const [y0, dir] of [[0.3, -1], [0.7, 1]] as const) {
    c.beginPath(); c.moveTo(0, y0 * h)
    for (let i = 0; i <= 32; i++) c.lineTo((i / 32) * w, y0 * h + (i % 2 ? dir * h * 0.06 : 0))
    c.lineTo(w, y0 * h); c.closePath(); c.fill()
  }
  for (let i = 0; i < 24; i++) for (const y of [0.15, 0.85]) { c.fillStyle = i % 2 ? '#f6d98a' : '#f4f1ea'; c.beginPath(); c.arc(((i + 0.5) / 24) * w, y * h, 10, 0, TAU); c.fill() }
}
function osterei(count: number): Built {
  const { fn, nf } = rev(eiR, eiY, EI_T, 1 - EI_T)
  const red = mat(0xc8362f, 0.45)
  const statics: THREE.Object3D[] = [
    lathe(eiR, eiY, 0, EI_T + 0.005, red, 8),
    lathe(eiR, eiY, 1 - EI_T - 0.005, 1, red, 8),
    mesh(new THREE.SphereGeometry(0.74, 40, 24).scale(1, 1.4, 1), mat(0xf4ead6, 0.9, THREE.BackSide)),
    mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.2, 40, 1, true).translate(0, eiY(1) + 0.05, 0), mat(0x7a5236, 0.6)), // Eierbecher
    mesh(new THREE.CylinderGeometry(0.48, 0.5, 0.06, 40).translate(0, eiY(1) - 0.08, 0), mat(0x7a5236, 0.6)),
  ]
  return { surfaces: [{ fn, nf, ...G(count, [4, 3], [6, 4], [20, 10]), wrap: true, tw: 2048, th: 1280, thick: 0.05, paint: paintEgg }], statics }
}

export const MODELS: ModelDef[] = [
  { id: 'kugel', name: 'Weltkugel', cat: 'Weltall', text: 'Die Erde als Kugel aus gewölbten Teilen', build: kugel },
  { id: 'sneaker', name: 'Sneaker', cat: 'Haus und Küche', text: 'Ein Turnschuh mit Schnürung und Streifen', build: sneaker },
  { id: 'haus', name: 'Kleines Haus', cat: 'Draußen', text: 'Fachwerkhaus mit Ziegeldach', build: haus },
  { id: 'tasse', name: 'Kaffeetasse', cat: 'Haus und Küche', text: 'Bemalte Tasse mit Henkel', build: tasse },
  { id: 'leuchtturm', name: 'Leuchtturm', cat: 'Draußen', text: 'Rot-weißer Turm auf einem Felsen', build: leuchtturm },
  { id: 'ballon', name: 'Heißluftballon', cat: 'Draußen', text: 'Bunter Ballon mit Korb', build: ballon },
  { id: 'vase', name: 'Blumenvase', cat: 'Haus und Küche', text: 'Blau bemalte Vase mit Strauß', build: vase },
  { id: 'osterei', name: 'Osterei', cat: 'Feste', text: 'Bemaltes Ei im Eierbecher', build: osterei },
  ...MODELS2,
]
export const MODEL_CATS = ['Weltall', 'Bälle und Spielzeug', 'Haus und Küche', 'Feste', 'Draußen']
