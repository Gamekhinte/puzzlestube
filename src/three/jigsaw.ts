// Echte Puzzleform auf beliebigen Modellen: Die Grenzen zwischen den Teilen werden exakt durch die
// Dreiecke geschnitten (nicht an Dreieckskanten entlang), und zwischen je zwei Nachbarteilen sitzt eine
// Nase (runder Kopf mit Hals), die in ein passendes Loch im anderen Teil greift.
import { rng } from '../puzzle/engine'
import { type Soup, dist, tick } from './cut'

interface Knob { owner: number; cx: number; cy: number; cz: number; qx: number; qy: number; qz: number; nx: number; ny: number; nz: number; r: number }

const ek = (a: number, b: number) => (a < b ? a * 4194304 + b : b * 4194304 + a)

export type CellFn = (x: number, y: number, z: number) => number

/** Raster wie bei einem echten Puzzle: Das Modell wird gedanklich in einen Würfel gesteckt (auf seine Maße
 *  gestreckt), jede Würfelseite bekommt k mal k gleich große Felder. Jeder Punkt gehört zu dem Feld, in dessen
 *  Richtung er von der Mitte aus liegt. So werden die Teile fast quadratisch mit vier Nachbarn. */
export function gridCells(S: Soup, k: number): { vlab: Int32Array; cellAt: CellFn } {
  const P = S.P, V = P.length / 3
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < V; i++) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], P[i * 3 + a]); hi[a] = Math.max(hi[a], P[i * 3 + a]) }
  const c = [0, 1, 2].map((a) => (lo[a] + hi[a]) / 2), h = [0, 1, 2].map((a) => Math.max(1e-6, (hi[a] - lo[a]) / 2))
  const q = 4 / Math.PI
  const cellAt: CellFn = (x, y, z) => {
    const a = (x - c[0]) / h[0], b = (y - c[1]) / h[1], d = (z - c[2]) / h[2]
    const ax = Math.abs(a), ay = Math.abs(b), az = Math.abs(d)
    let face: number, u: number, v: number
    if (ax >= ay && ax >= az) { face = a > 0 ? 0 : 1; u = b / ax; v = d / ax }
    else if (ay >= az) { face = b > 0 ? 2 : 3; u = a / ay; v = d / ay }
    else { face = d > 0 ? 4 : 5; u = a / (az || 1); v = b / (az || 1) }
    // gleiche Winkel statt gleicher Strecken: Felder an den Würfelecken werden nicht zu klein
    const iu = Math.min(k - 1, Math.floor(((Math.atan(u) * q + 1) / 2) * k)), iv = Math.min(k - 1, Math.floor(((Math.atan(v) * q + 1) / 2) * k))
    return face * k * k + iu * k + iv
  }
  const vlab = new Int32Array(V)
  for (let i = 0; i < V; i++) vlab[i] = cellAt(P[i * 3], P[i * 3 + 1], P[i * 3 + 2])
  return { vlab, cellAt }
}

export async function jigsaw(S: Soup, vlab: Int32Array | null, seedsIn: number[] | null, seed: number, grid?: { target: number }): Promise<{ S: Soup; lab: Int32Array; n: number }> {
  const P = S.P, V0 = P.length / 3, r = rng(seed * 31 + 5)
  const T = S.mat.length
  const pid = (f: number, k: number) => S.cp[S.tri[f * 3 + k]]

  // Normale je Punkt
  const N = new Float64Array(V0 * 3)
  for (let c = 0; c < S.cp.length; c++) { const p = S.cp[c]; N[p * 3] += S.cn[c * 3]; N[p * 3 + 1] += S.cn[c * 3 + 1]; N[p * 3 + 2] += S.cn[c * 3 + 2] }
  for (let i = 0; i < V0; i++) { const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l }

  // Kanten und Nachbarn
  const nb: number[][] = Array.from({ length: V0 }, () => [])
  const edges = new Map<number, [number, number]>()
  for (let f = 0; f < T; f++) for (let k = 0; k < 3; k++) {
    const a = pid(f, k), b = pid(f, (k + 1) % 3), key = ek(a, b)
    if (!edges.has(key)) { edges.set(key, a < b ? [a, b] : [b, a]); nb[a].push(b); nb[b].push(a) }
  }

  let seeds = seedsIn ?? []
  let labelCell: Int32Array | null = null
  let cellAt: CellFn | undefined
  let base: Int32Array = Int32Array.from(vlab ?? [])
  if (grid) {
    // Rastergröße so wählen, dass die echte Teilezahl nah an der gewünschten liegt
    // (verwinkelte Modelle bekommen durch getrennte Stellen zusätzliche Teile)
    const k0 = Math.max(2, Math.round(Math.sqrt(grid.target / 6)))
    let best: { base: Int32Array; labelCell: Int32Array; cellAt: CellFn; n: number } | null = null
    for (let k = k0; k >= Math.max(2, k0 - 3); k--) {
      const g = gridCells(S, k)
      const sp = splitCells(g.vlab, nb, V0)
      const cand = { ...sp, cellAt: g.cellAt }
      if (!best || Math.abs(cand.n - grid.target) < Math.abs(best.n - grid.target)) best = cand
      if (cand.n <= grid.target * 1.15) break
      await tick()
    }
    base = best!.base; labelCell = best!.labelCell; cellAt = best!.cellAt
    // je Teil ein Mittelpunkt
    const n = best!.n, sx = new Float64Array(n), sy = new Float64Array(n), sz = new Float64Array(n), cnt = new Float64Array(n)
    for (let v = 0; v < V0; v++) { const l = base[v]; sx[l] += P[v * 3]; sy[l] += P[v * 3 + 1]; sz[l] += P[v * 3 + 2]; cnt[l]++ }
    seeds = new Array(n).fill(0)
    const bd = new Float64Array(n).fill(Infinity)
    for (let v = 0; v < V0; v++) {
      const l = base[v], d = (P[v * 3] - sx[l] / cnt[l]) ** 2 + (P[v * 3 + 1] - sy[l] / cnt[l]) ** 2 + (P[v * 3 + 2] - sz[l] / cnt[l]) ** 2
      if (d < bd[l]) { bd[l] = d; seeds[l] = v }
    }
    await tick()
  }

  // Abstand zu einem Startpunkt: gerade Strecke, teurer, wenn die Fläche in eine andere Richtung zeigt
  // (so greifen Teile nicht durch dünne Stellen auf die Rückseite)
  const metric = (px: number, py: number, pz: number, nx: number, ny: number, nz: number, l: number) => {
    const s0 = seeds[l] * 3
    const e = Math.hypot(px - P[s0], py - P[s0 + 1], pz - P[s0 + 2])
    return e * (1 + 1.5 * (1 - (nx * N[s0] + ny * N[s0 + 1] + nz * N[s0 + 2])))
  }

  // Punkte nahe der Grenze dem Teil geben, das nach dem Maß am nächsten ist: glatte Linie statt Treppe
  // (beim Raster ist die Grenze schon glatt)
  if (!cellAt) for (let pass = 0; pass < 2; pass++) for (let v = 0; v < V0; v++) {
    if (base[v] < 0) continue
    let best = base[v], bd = metric(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], N[v * 3], N[v * 3 + 1], N[v * 3 + 2], best)
    for (const w of nb[v]) {
      const l = base[w]; if (l === best || l < 0) continue
      const d = metric(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], N[v * 3], N[v * 3 + 1], N[v * 3 + 2], l)
      if (d < bd) { bd = d; best = l }
    }
    base[v] = best
  }
  await tick()

  // Nachbarpaare: gemeinsame Grenze (Mitte und Länge)
  interface Pair { A: number; B: number; sx: number; sy: number; sz: number; k: number; len: number; best: number; bd: number }
  const pairs = new Map<number, Pair>()
  const pairKey = (A: number, B: number) => (A < B ? A * 65536 + B : B * 65536 + A)
  for (const [, [a, b]] of edges) {
    const A = base[a], B = base[b]
    if (A === B || A < 0 || B < 0) continue
    const key = pairKey(A, B)
    let pi = pairs.get(key)
    if (!pi) { pi = { A: Math.min(A, B), B: Math.max(A, B), sx: 0, sy: 0, sz: 0, k: 0, len: 0, best: -1, bd: Infinity }; pairs.set(key, pi) }
    pi.sx += (P[a * 3] + P[b * 3]) / 2; pi.sy += (P[a * 3 + 1] + P[b * 3 + 1]) / 2; pi.sz += (P[a * 3 + 2] + P[b * 3 + 2]) / 2; pi.k++
    pi.len += dist(P, a, b)
  }
  for (const [key, [a, b]] of edges) {
    const A = base[a], B = base[b]
    if (A === B || A < 0 || B < 0) continue
    const pi = pairs.get(pairKey(A, B))!
    const mx = (P[a * 3] + P[b * 3]) / 2, my = (P[a * 3 + 1] + P[b * 3 + 1]) / 2, mz = (P[a * 3 + 2] + P[b * 3 + 2]) / 2
    const d = (mx - pi.sx / pi.k) ** 2 + (my - pi.sy / pi.k) ** 2 + (mz - pi.sz / pi.k) ** 2
    if (d < pi.bd) { pi.bd = d; pi.best = key }
  }

  // eine Nase je Paar, Richtung zufällig (aber wiederholbar)
  const knobsOf: Knob[][] = seeds.map(() => [])
  for (const [, pi] of [...pairs].sort((x, y) => x[0] - y[0])) {
    const [a, b] = edges.get(pi.best)!
    const rad = (cellAt ? 0.17 : 0.2) * dist(P, seeds[pi.A], seeds[pi.B])
    const flip = r() < 0.5
    if (pi.len / 1.25 < 3.6 * rad) continue // Grenze zu kurz (nur eine Ecke): keine Nase
    const owner = flip ? pi.A : pi.B, victim = flip ? pi.B : pi.A
    const mx = (P[a * 3] + P[b * 3]) / 2, my = (P[a * 3 + 1] + P[b * 3 + 1]) / 2, mz = (P[a * 3 + 2] + P[b * 3 + 2]) / 2
    let nx = N[a * 3] + N[b * 3], ny = N[a * 3 + 1] + N[b * 3 + 1], nz = N[a * 3 + 2] + N[b * 3 + 2]
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl
    // Richtung zum Startpunkt des Nachbarn, flach auf der Fläche
    const vs = seeds[victim] * 3
    let dx = P[vs] - mx, dy = P[vs + 1] - my, dz = P[vs + 2] - mz
    const dn = dx * nx + dy * ny + dz * nz; dx -= dn * nx; dy -= dn * ny; dz -= dn * nz
    const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl
    knobsOf[victim].push({
      owner, r: rad, nx, ny, nz,
      cx: mx + dx * rad * 0.95, cy: my + dy * rad * 0.95, cz: mz + dz * rad * 0.95,
      qx: mx - dx * rad * 0.35, qy: my - dy * rad * 0.35, qz: mz - dz * rad * 0.35,
    })
  }

  // Teilnummer an einer Stelle: das Grundteil, außer eine Nase des Nachbarn ragt hinein
  const labelAt = (px: number, py: number, pz: number, nx: number, ny: number, nz: number, b: number) => {
    for (const k of knobsOf[b]) {
      if (nx * k.nx + ny * k.ny + nz * k.nz < 0.2) continue
      const r2 = k.r * k.r
      if ((px - k.cx) ** 2 + (py - k.cy) ** 2 + (pz - k.cz) ** 2 < r2) return k.owner
      // Hals: Abstand zur Strecke q bis c
      const ux = k.cx - k.qx, uy = k.cy - k.qy, uz = k.cz - k.qz, uu = ux * ux + uy * uy + uz * uz
      const t = Math.max(0, Math.min(1, ((px - k.qx) * ux + (py - k.qy) * uy + (pz - k.qz) * uz) / uu))
      if ((px - k.qx - ux * t) ** 2 + (py - k.qy - uy * t) ** 2 + (pz - k.qz - uz * t) ** 2 < r2 * 0.3) return k.owner
    }
    return b
  }
  const fin = new Int32Array(V0)
  for (let v = 0; v < V0; v++) fin[v] = base[v] < 0 ? 0 : labelAt(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], N[v * 3], N[v * 3 + 1], N[v * 3 + 2], base[v])

  // Teilnummer an einem Punkt auf der Kante a..b (a < b), Anteil t von a aus
  const along = (a: number, b: number, t: number) => {
    const px = P[a * 3] + (P[b * 3] - P[a * 3]) * t, py = P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * t, pz = P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * t
    let nx = N[a * 3] + (N[b * 3] - N[a * 3]) * t, ny = N[a * 3 + 1] + (N[b * 3 + 1] - N[a * 3 + 1]) * t, nz = N[a * 3 + 2] + (N[b * 3 + 2] - N[a * 3 + 2]) * t
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l
    const la = base[a], lb = base[b]
    let bl = la
    if (la !== lb) {
      const c = cellAt && labelCell ? cellAt(px, py, pz) : -1
      if (c >= 0 && labelCell![la] === c && labelCell![lb] !== c) bl = la
      else if (c >= 0 && labelCell![lb] === c && labelCell![la] !== c) bl = lb
      else bl = metric(px, py, pz, nx, ny, nz, la) <= metric(px, py, pz, nx, ny, nz, lb) ? la : lb
    }
    return labelAt(px, py, pz, nx, ny, nz, bl)
  }

  // Schnittpunkt je Kante, für beide angrenzenden Dreiecke derselbe Punkt (nichts klafft)
  const cut = new Map<number, { p: number; t: number }>()
  for (const [key, [a, b]] of edges) {
    if (fin[a] === fin[b]) continue
    let lo = 0, hi = 1
    for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (along(a, b, m) === fin[a]) lo = m; else hi = m }
    const t = Math.min(0.97, Math.max(0.03, (lo + hi) / 2))
    const p = P.length / 3
    P.push(P[a * 3] + (P[b * 3] - P[a * 3]) * t, P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * t, P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * t)
    cut.set(key, { p, t })
  }
  await tick()

  // neue Dreiecksliste mit Teilnummer je Dreieck
  const O: Soup = { P, cp: [], cn: [], cu: [], tri: [], mat: [], materials: S.materials }
  const lab: number[] = []
  const corner = (p: number, nx: number, ny: number, nz: number, u: number, v: number) => { O.cp.push(p); O.cn.push(nx, ny, nz); O.cu.push(u, v); return O.cp.length - 1 }
  const copy = (c: number) => corner(S.cp[c], S.cn[c * 3], S.cn[c * 3 + 1], S.cn[c * 3 + 2], S.cu[c * 2], S.cu[c * 2 + 1])
  const onEdge = (ci: number, cj: number) => {
    const pi = S.cp[ci], pj = S.cp[cj], c = cut.get(ek(pi, pj))!
    const t = pi < pj ? c.t : 1 - c.t
    let nx = S.cn[ci * 3] + (S.cn[cj * 3] - S.cn[ci * 3]) * t, ny = S.cn[ci * 3 + 1] + (S.cn[cj * 3 + 1] - S.cn[ci * 3 + 1]) * t, nz = S.cn[ci * 3 + 2] + (S.cn[cj * 3 + 2] - S.cn[ci * 3 + 2]) * t
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l
    return corner(c.p, nx, ny, nz, S.cu[ci * 2] + (S.cu[cj * 2] - S.cu[ci * 2]) * t, S.cu[ci * 2 + 1] + (S.cu[cj * 2 + 1] - S.cu[ci * 2 + 1]) * t)
  }
  const put = (m: number, L: number, a: number, b: number, c: number) => { O.tri.push(a, b, c); O.mat.push(m); lab.push(L) }

  for (let f = 0; f < T; f++) {
    if (f % 12000 === 11999) await tick()
    const c = [S.tri[f * 3], S.tri[f * 3 + 1], S.tri[f * 3 + 2]], m = S.mat[f]
    const L = c.map((x) => fin[S.cp[x]])
    if (L[0] === L[1] && L[1] === L[2]) { put(m, L[0], copy(c[0]), copy(c[1]), copy(c[2])); continue }
    if (L[0] !== L[1] && L[1] !== L[2] && L[0] !== L[2]) {
      // drei Teile treffen sich hier: die Mitte ist der gemeinsame Punkt
      const m01 = onEdge(c[0], c[1]), m12 = onEdge(c[1], c[2]), m20 = onEdge(c[2], c[0])
      const p = P.length / 3
      let cx = 0, cy = 0, cz = 0, nx = 0, ny = 0, nz = 0, u = 0, v = 0
      for (const x of c) {
        const q = S.cp[x] * 3
        cx += P[q] / 3; cy += P[q + 1] / 3; cz += P[q + 2] / 3
        nx += S.cn[x * 3]; ny += S.cn[x * 3 + 1]; nz += S.cn[x * 3 + 2]
        u += S.cu[x * 2] / 3; v += S.cu[x * 2 + 1] / 3
      }
      P.push(cx, cy, cz)
      const nl = Math.hypot(nx, ny, nz) || 1
      const mid = () => corner(p, nx / nl, ny / nl, nz / nl, u, v)
      put(m, L[0], copy(c[0]), m01, mid()); put(m, L[0], copy(c[0]), mid(), m20)
      put(m, L[1], copy(c[1]), m12, mid()); put(m, L[1], copy(c[1]), mid(), m01)
      put(m, L[2], copy(c[2]), m20, mid()); put(m, L[2], copy(c[2]), mid(), m12)
      continue
    }
    // zwei Teile: die einzelne Ecke bekommt ein Dreieck, der Rest ein Viereck
    const k = L[0] !== L[1] && L[0] !== L[2] ? 0 : L[1] !== L[0] && L[1] !== L[2] ? 1 : 2
    const a = c[k], b = c[(k + 1) % 3], cc = c[(k + 2) % 3]
    const mab = onEdge(a, b), mac = onEdge(a, cc)
    put(m, L[k], copy(a), mab, mac)
    const Lo = L[(k + 1) % 3]
    put(m, Lo, mab, copy(b), copy(cc)); put(m, Lo, mab, copy(cc), mac)
  }
  const out = Int32Array.from(lab)
  await tick()
  dropCrumbs(O, out)
  return { S: O, lab: out, n: seeds.length }
}

/** Ein Rasterfeld kann bei verwinkelten Modellen mehrere getrennte Stellen treffen (z. B. außen und innen).
 *  Kleine Reste kommen zum Nachbarn, größere werden ein eigenes Teil. Gibt fortlaufende Teilnummern zurück. */
function splitCells(vlab: Int32Array, nb: number[][], V0: number): { base: Int32Array; labelCell: Int32Array; n: number } {
  const comp = new Int32Array(V0).fill(-1)
  const comps: { l: number; list: number[] }[] = []
  for (let s = 0; s < V0; s++) {
    if (comp[s] >= 0) continue
    const list = [s], l = vlab[s]; comp[s] = comps.length
    for (let i = 0; i < list.length; i++) for (const w of nb[list[i]]) if (comp[w] < 0 && vlab[w] === l) { comp[w] = comps.length; list.push(w) }
    comps.push({ l, list })
  }
  const big = new Map<number, number>()
  for (const c of comps) big.set(c.l, Math.max(big.get(c.l) ?? 0, c.list.length))
  const avg = V0 / Math.max(1, big.size)
  const out = Int32Array.from(vlab)
  const cellOf = new Map<number, number>()
  let next = 1 << 20
  for (const c of comps) {
    if (c.list.length === big.get(c.l)) { cellOf.set(c.l, c.l); continue }
    if (c.list.length < 0.3 * avg) {
      const votes = new Map<number, number>()
      for (const v of c.list) for (const w of nb[v]) if (vlab[w] !== c.l) votes.set(vlab[w], (votes.get(vlab[w]) ?? 0) + 1)
      let best = c.l, bv = 0
      for (const [l, n] of votes) if (n > bv) { bv = n; best = l }
      for (const v of c.list) out[v] = best
    } else {
      const id = next++
      cellOf.set(id, c.l)
      for (const v of c.list) out[v] = id
    }
  }
  const ids = [...new Set(out)].sort((a, b) => a - b), idx = new Map(ids.map((v, i) => [v, i]))
  const labelCell = new Int32Array(ids.length)
  ids.forEach((v, i) => { labelCell[i] = cellOf.get(v) ?? v })
  const base = new Int32Array(V0)
  for (let v = 0; v < V0; v++) base[v] = idx.get(out[v])!
  return { base, labelCell, n: ids.length }
}

/** Kleine abgetrennte Krümel eines Teils (wo eine Nase eine Kante zweimal schneidet) dem Nachbarn geben,
 *  mit dem sie die längste Grenze haben. So besteht jedes Teil aus einem Stück. */
function dropCrumbs(S: Soup, lab: Int32Array) {
  const T = lab.length, pid = (f: number, k: number) => S.cp[S.tri[f * 3 + k]]
  // Nachbardreieck je Seite (schnelle Tabelle statt Listen je Kante)
  const adj = new Int32Array(T * 3).fill(-1)
  const open = new Map<number, number>()
  for (let f = 0; f < T; f++) for (let k = 0; k < 3; k++) {
    const key = ek(pid(f, k), pid(f, (k + 1) % 3)), g = open.get(key)
    if (g === undefined) open.set(key, f * 3 + k)
    else { adj[f * 3 + k] = (g / 3) | 0; adj[g] = f; open.delete(key) }
  }
  const area = new Float64Array(T), P = S.P
  for (let f = 0; f < T; f++) {
    const a = pid(f, 0) * 3, b = pid(f, 1) * 3, c = pid(f, 2) * 3
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
    area[f] = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
  }
  const comp = new Int32Array(T), stack = new Int32Array(T)
  for (let pass = 0; pass < 2; pass++) {
    comp.fill(-1)
    const cArea: number[] = [], cLab: number[] = [], cStart: number[] = [], order = new Int32Array(T)
    let on = 0
    for (let s = 0; s < T; s++) {
      if (comp[s] >= 0) continue
      const id = cArea.length, L = lab[s]
      let top = 0, a = 0
      stack[top++] = s; comp[s] = id; cStart.push(on)
      while (top) {
        const f = stack[--top]; order[on++] = f; a += area[f]
        for (let k = 0; k < 3; k++) { const g = adj[f * 3 + k]; if (g >= 0 && comp[g] < 0 && lab[g] === L) { comp[g] = id; stack[top++] = g } }
      }
      cArea.push(a); cLab.push(L)
    }
    cStart.push(on)
    // größtes Stück je Teil bleibt, alles unter der Hälfte davon wandert zum Nachbarn mit der längsten Grenze
    const biggest = new Map<number, number>()
    for (let i = 0; i < cArea.length; i++) biggest.set(cLab[i], Math.max(biggest.get(cLab[i]) ?? 0, cArea[i]))
    let moved = 0
    for (let i = 0; i < cArea.length; i++) {
      if (cArea[i] >= biggest.get(cLab[i])! * 0.5) continue
      const votes = new Map<number, number>()
      for (let j = cStart[i]; j < cStart[i + 1]; j++) {
        const f = order[j]
        for (let k = 0; k < 3; k++) { const g = adj[f * 3 + k]; if (g >= 0 && lab[g] !== cLab[i]) votes.set(lab[g], (votes.get(lab[g]) ?? 0) + 1) }
      }
      let best = -1, bv = 0
      for (const [l, v] of votes) if (v > bv) { bv = v; best = l }
      if (best >= 0) { for (let j = cStart[i]; j < cStart[i + 1]; j++) lab[order[j]] = best; moved++ }
    }
    if (!moved) break
  }
}
