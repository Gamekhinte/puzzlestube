// Echte Puzzleform auf beliebigen Modellen: Die Grenzen zwischen den Teilen werden exakt durch die
// Dreiecke geschnitten (nicht an Dreieckskanten entlang), und zwischen je zwei Nachbarteilen sitzt eine
// Nase (runder Kopf mit Hals), die in ein passendes Loch im anderen Teil greift.
import { rng } from '../puzzle/engine'
import { type Soup, dist, tick } from './cut'

interface Knob { owner: number; cx: number; cy: number; cz: number; qx: number; qy: number; qz: number; nx: number; ny: number; nz: number; r: number }

const ek = (a: number, b: number) => (a < b ? a * 4194304 + b : b * 4194304 + a)

export async function jigsaw(S: Soup, vlab: Int32Array, seeds: number[], seed: number): Promise<{ S: Soup; lab: Int32Array }> {
  const P = S.P, V0 = P.length / 3, r = rng(seed * 31 + 5)
  const T = S.mat.length
  const pid = (f: number, k: number) => S.cp[S.tri[f * 3 + k]]

  // Normale je Punkt
  const N = new Float64Array(V0 * 3)
  for (let c = 0; c < S.cp.length; c++) { const p = S.cp[c]; N[p * 3] += S.cn[c * 3]; N[p * 3 + 1] += S.cn[c * 3 + 1]; N[p * 3 + 2] += S.cn[c * 3 + 2] }
  for (let i = 0; i < V0; i++) { const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l }

  // Abstand zu einem Startpunkt: gerade Strecke, teurer, wenn die Fläche in eine andere Richtung zeigt
  // (so greifen Teile nicht durch dünne Stellen auf die Rückseite)
  const metric = (px: number, py: number, pz: number, nx: number, ny: number, nz: number, l: number) => {
    const s0 = seeds[l] * 3
    const e = Math.hypot(px - P[s0], py - P[s0 + 1], pz - P[s0 + 2])
    return e * (1 + 1.5 * (1 - (nx * N[s0] + ny * N[s0 + 1] + nz * N[s0 + 2])))
  }

  // Kanten und Nachbarn
  const nb: number[][] = Array.from({ length: V0 }, () => [])
  const edges = new Map<number, [number, number]>()
  for (let f = 0; f < T; f++) for (let k = 0; k < 3; k++) {
    const a = pid(f, k), b = pid(f, (k + 1) % 3), key = ek(a, b)
    if (!edges.has(key)) { edges.set(key, a < b ? [a, b] : [b, a]); nb[a].push(b); nb[b].push(a) }
  }

  // Punkte nahe der Grenze dem Teil geben, das nach dem Maß am nächsten ist: glatte Linie statt Treppe
  const base = Int32Array.from(vlab)
  for (let pass = 0; pass < 2; pass++) for (let v = 0; v < V0; v++) {
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
    const rad = 0.2 * dist(P, seeds[pi.A], seeds[pi.B])
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
    const bl = la === lb ? la : metric(px, py, pz, nx, ny, nz, la) <= metric(px, py, pz, nx, ny, nz, lb) ? la : lb
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
  return { S: O, lab: out }
}

/** Kleine abgetrennte Krümel eines Teils (wo eine Nase eine Kante zweimal schneidet) dem Nachbarn geben,
 *  mit dem sie die längste Grenze haben. So besteht jedes Teil aus einem Stück. */
function dropCrumbs(S: Soup, lab: Int32Array) {
  const T = lab.length, pid = (f: number, k: number) => S.cp[S.tri[f * 3 + k]]
  const byEdge = new Map<number, number[]>()
  for (let f = 0; f < T; f++) for (let k = 0; k < 3; k++) {
    const key = ek(pid(f, k), pid(f, (k + 1) % 3)), l = byEdge.get(key)
    if (l) l.push(f); else byEdge.set(key, [f])
  }
  const area = new Float64Array(T)
  for (let f = 0; f < T; f++) {
    const a = pid(f, 0) * 3, b = pid(f, 1) * 3, c = pid(f, 2) * 3, P = S.P
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
    area[f] = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
  }
  for (let pass = 0; pass < 2; pass++) {
    const seen = new Int32Array(T).fill(-1)
    const comps: { f: number[]; a: number; l: number }[] = []
    for (let s = 0; s < T; s++) {
      if (seen[s] >= 0) continue
      const id = comps.length, list = [s], L = lab[s]; seen[s] = id
      let a = 0
      for (let i = 0; i < list.length; i++) {
        const f = list[i]; a += area[f]
        for (let k = 0; k < 3; k++) for (const g of byEdge.get(ek(pid(f, k), pid(f, (k + 1) % 3)))!) if (seen[g] < 0 && lab[g] === L) { seen[g] = id; list.push(g) }
      }
      comps.push({ f: list, a, l: L })
    }
    // größtes Stück je Teil bleibt, alles unter der Hälfte davon wandert
    const biggest = new Map<number, number>()
    for (const c of comps) biggest.set(c.l, Math.max(biggest.get(c.l) ?? 0, c.a))
    let moved = 0
    for (const c of comps) {
      if (c.a >= biggest.get(c.l)! * 0.5) continue
      const votes = new Map<number, number>()
      for (const f of c.f) for (let k = 0; k < 3; k++) for (const g of byEdge.get(ek(pid(f, k), pid(f, (k + 1) % 3)))!) if (lab[g] !== c.l) votes.set(lab[g], (votes.get(lab[g]) ?? 0) + 1)
      let best = -1, bv = 0
      for (const [l, v] of votes) if (v > bv) { bv = v; best = l }
      if (best >= 0) { for (const f of c.f) lab[f] = best; moved++ }
    }
    if (!moved) break
  }
}
