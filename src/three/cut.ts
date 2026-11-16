// Zerschneidet ein beliebiges 3D-Modell (GLB) in Puzzleteile.
// 1. Alle Dreiecke in Weltkoordinaten einsammeln, Größe vereinheitlichen.
// 2. Große Dreiecke teilen, damit die Schnittkanten fein werden.
// 3. Startpunkte gleichmäßig verteilen, dann Fläche nach "kürzestem Weg über die Oberfläche" aufteilen
//    (wie Länder um ihre Hauptstädte), dreimal nachjustieren, damit die Teile ähnlich groß werden.
// Alles ist vom Zufallswert abhängig, aber wiederholbar: gleiches Modell und gleiche Zahl ergeben dieselben Teile.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { rng } from '../puzzle/engine'

export interface Soup {
  /** Position je Ecke-ID (verschweißt) */
  P: number[]
  /** je Dreiecksecke: Positions-ID, Normale, uv */
  cp: number[]; cn: number[]; cu: number[]
  /** je Dreieck: drei Ecken-Indizes und Material */
  tri: number[]; mat: number[]
  materials: THREE.Material[]
}

const loaded = new Map<string, Promise<THREE.Group>>()
export function loadModel(url: string): Promise<THREE.Group> {
  let p = loaded.get(url)
  if (!p) {
    p = new GLTFLoader().loadAsync(url).then((g) => g.scene)
    p.catch(() => loaded.delete(url))
    loaded.set(url, p)
  }
  return p
}

const tick = () => new Promise((r) => setTimeout(r, 0))

/** Alle Dreiecke des Modells, auf Radius R um den Ursprung gebracht. */
export function soupOf(scene: THREE.Group, R = 1.3): Soup {
  scene.updateMatrixWorld(true)
  const raw: { p: number[]; n: number[]; u: number[]; m: number }[] = []
  const mats: THREE.Material[] = [], matIdx = new Map<THREE.Material, number>()
  const v = new THREE.Vector3(), nm = new THREE.Matrix3()
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv
    if (!pos) return
    nm.getNormalMatrix(mesh.matrixWorld)
    const ml = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const idx = g.index
    const count = idx ? idx.count : pos.count
    const groups = g.groups.length ? g.groups : [{ start: 0, count, materialIndex: 0 }]
    const flip = mesh.matrixWorld.determinant() < 0
    for (const gr of groups) {
      const m = ml[gr.materialIndex ?? 0] ?? ml[0]
      if (!matIdx.has(m)) { matIdx.set(m, mats.length); mats.push(m) }
      const mi = matIdx.get(m)!
      for (let k = gr.start; k + 2 < gr.start + gr.count + 0 && k + 2 < count; k += 3) {
        const t: { p: number[]; n: number[]; u: number[]; m: number } = { p: [], n: [], u: [], m: mi }
        const order = flip ? [0, 2, 1] : [0, 1, 2]
        for (const o3 of order) {
          const i = idx ? idx.getX(k + o3) : k + o3
          v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); t.p.push(v.x, v.y, v.z)
          if (nor) { v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); t.n.push(v.x, v.y, v.z) } else t.n.push(0, 0, 0)
          if (uv) t.u.push(uv.getX(i), uv.getY(i)); else t.u.push(0, 0)
        }
        raw.push(t)
      }
    }
  })
  // Mitte und Größe
  const box = new THREE.Box3()
  for (const t of raw) for (let k = 0; k < 9; k += 3) box.expandByPoint(v.set(t.p[k], t.p[k + 1], t.p[k + 2]))
  const c = box.getCenter(new THREE.Vector3())
  let r = 0
  for (const t of raw) for (let k = 0; k < 9; k += 3) r = Math.max(r, v.set(t.p[k], t.p[k + 1], t.p[k + 2]).distanceTo(c))
  const s = R / Math.max(1e-9, r)
  // verschweißen: gleiche Stelle = gleiche ID (auch über uv-Nähte hinweg)
  const P: number[] = [], key = new Map<string, number>(), q = 1e-4 * R
  const S: Soup = { P, cp: [], cn: [], cu: [], tri: [], mat: [], materials: mats }
  for (const t of raw) {
    const ids: number[] = []
    for (let k = 0; k < 3; k++) {
      const x = (t.p[k * 3] - c.x) * s, y = (t.p[k * 3 + 1] - c.y) * s, z = (t.p[k * 3 + 2] - c.z) * s
      const kk = `${Math.round(x / q)},${Math.round(y / q)},${Math.round(z / q)}`
      let id = key.get(kk)
      if (id === undefined) { id = P.length / 3; P.push(x, y, z); key.set(kk, id) }
      ids.push(id)
    }
    if (ids[0] === ids[1] || ids[1] === ids[2] || ids[0] === ids[2]) continue // entartet
    for (let k = 0; k < 3; k++) {
      S.tri.push(S.cp.length)
      S.cp.push(ids[k]); S.cn.push(t.n[k * 3], t.n[k * 3 + 1], t.n[k * 3 + 2]); S.cu.push(t.u[k * 2], t.u[k * 2 + 1])
    }
    S.mat.push(t.m)
  }
  // fehlende Normalen aus der Fläche
  for (let f = 0; f < S.mat.length; f++) {
    const a = S.tri[f * 3]
    if (S.cn[a * 3] || S.cn[a * 3 + 1] || S.cn[a * 3 + 2]) continue
    const n = faceNormal(S, f)
    for (let k = 0; k < 3; k++) { const ci = S.tri[f * 3 + k]; S.cn[ci * 3] = n.x; S.cn[ci * 3 + 1] = n.y; S.cn[ci * 3 + 2] = n.z }
  }
  return S
}

const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3()
function corner(S: Soup, f: number, k: number, out: THREE.Vector3) { const p = S.cp[S.tri[f * 3 + k]] * 3; return out.set(S.P[p], S.P[p + 1], S.P[p + 2]) }
export function faceNormal(S: Soup, f: number): THREE.Vector3 {
  corner(S, f, 0, A); corner(S, f, 1, B); corner(S, f, 2, C)
  return B.sub(A).cross(C.sub(A)).clone()
}
const dist = (P: number[], a: number, b: number) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2])

/** Teilt lange Kanten (überall gleich, damit keine Lücken entstehen), bis die Fläche aus etwa `target` Dreiecken besteht. */
export async function refine(S: Soup, target: number) {
  let area = 0
  for (let f = 0; f < S.mat.length; f++) area += faceNormal(S, f).length() / 2
  const L = Math.sqrt((4 * area) / (target * Math.sqrt(3))) * 1.6
  for (let pass = 0; pass < 10; pass++) {
    const nT = S.mat.length
    if (nT > target * 1.3) break
    const mid = new Map<number, number>() // Kante -> neue Positions-ID
    const ek = (a: number, b: number) => (a < b ? a * 4194304 + b : b * 4194304 + a)
    let any = false
    for (let f = 0; f < nT; f++) for (let k = 0; k < 3; k++) {
      const a = S.cp[S.tri[f * 3 + k]], b = S.cp[S.tri[f * 3 + ((k + 1) % 3)]]
      const key = ek(a, b)
      if (!mid.has(key) && dist(S.P, a, b) > L) {
        mid.set(key, S.P.length / 3)
        S.P.push((S.P[a * 3] + S.P[b * 3]) / 2, (S.P[a * 3 + 1] + S.P[b * 3 + 1]) / 2, (S.P[a * 3 + 2] + S.P[b * 3 + 2]) / 2)
        any = true
      }
    }
    if (!any) break
    const tri: number[] = [], mat: number[] = []
    const midCorner = (c0: number, c1: number) => {
      const id = mid.get(ek(S.cp[c0], S.cp[c1]))!
      const n = S.cp.length
      S.cp.push(id)
      let nx = S.cn[c0 * 3] + S.cn[c1 * 3], ny = S.cn[c0 * 3 + 1] + S.cn[c1 * 3 + 1], nz = S.cn[c0 * 3 + 2] + S.cn[c1 * 3 + 2]
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l
      S.cn.push(nx, ny, nz)
      S.cu.push((S.cu[c0 * 2] + S.cu[c1 * 2]) / 2, (S.cu[c0 * 2 + 1] + S.cu[c1 * 2 + 1]) / 2)
      return n
    }
    for (let f = 0; f < nT; f++) {
      const c = [S.tri[f * 3], S.tri[f * 3 + 1], S.tri[f * 3 + 2]], m = S.mat[f]
      const sp = [0, 1, 2].map((k) => mid.has(ek(S.cp[c[k]], S.cp[c[(k + 1) % 3]])))
      const ns = sp.filter(Boolean).length
      const put = (...cs: number[]) => { tri.push(...cs); mat.push(m) }
      if (ns === 0) put(c[0], c[1], c[2])
      else if (ns === 3) {
        const m01 = midCorner(c[0], c[1]), m12 = midCorner(c[1], c[2]), m20 = midCorner(c[2], c[0])
        put(c[0], m01, m20); put(m01, c[1], m12); put(m20, m12, c[2]); put(m01, m12, m20)
      } else if (ns === 1) {
        const k = sp.indexOf(true), a = c[k], b = c[(k + 1) % 3], cc = c[(k + 2) % 3]
        const mab = midCorner(a, b)
        put(a, mab, cc); put(mab, b, cc)
      } else {
        // ungeteilt ist b-c, geteilt a-b und c-a
        const k = (sp.indexOf(false) + 2) % 3, a = c[k], b = c[(k + 1) % 3], cc = c[(k + 2) % 3]
        const mab = midCorner(a, b), mca = midCorner(cc, a)
        put(a, mab, mca); put(mab, b, cc); put(mab, cc, mca)
      }
    }
    S.tri = tri; S.mat = mat
    await tick()
  }
}

/** Kleiner Binärheap für den kürzesten Weg. */
class Heap {
  k: number[] = []; v: number[] = []
  push(key: number, val: number) {
    const k = this.k, v = this.v
    let i = k.length; k.push(key); v.push(val)
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p }
    k[i] = key; v[i] = val
  }
  pop(): [number, number] {
    const k = this.k, v = this.v, top: [number, number] = [k[0], v[0]]
    const lk = k.pop()!, lv = v.pop()!
    if (k.length) {
      let i = 0
      for (;;) {
        let c = 2 * i + 1
        if (c >= k.length) break
        if (c + 1 < k.length && k[c + 1] < k[c]) c++
        if (k[c] >= lk) break
        k[i] = k[c]; v[i] = v[c]; i = c
      }
      k[i] = lk; v[i] = lv
    }
    return top
  }
  get size() { return this.k.length }
}

/** Ordnet jedem Dreieck eine Teilnummer 0..n-1 zu. */
export async function partition(S: Soup, n: number, seed: number): Promise<Int32Array> {
  const V = S.P.length / 3, P = S.P
  // Nachbarn über Dreieckskanten
  const nb: number[][] = Array.from({ length: V }, () => [])
  const used = new Uint8Array(V)
  for (let f = 0; f < S.mat.length; f++) for (let k = 0; k < 3; k++) {
    const a = S.cp[S.tri[f * 3 + k]], b = S.cp[S.tri[f * 3 + ((k + 1) % 3)]]
    nb[a].push(b); nb[b].push(a); used[a] = used[b] = 1
  }
  // getrennte Bauteile (z. B. Henkel, Zeiger) mit dem Rest verbinden, damit überall ein Weg hinführt
  const comp = new Int32Array(V).fill(-1)
  const comps: number[][] = []
  for (let s = 0; s < V; s++) {
    if (!used[s] || comp[s] >= 0) continue
    const id = comps.length, list = [s]; comp[s] = id
    for (let i = 0; i < list.length; i++) for (const b of nb[list[i]]) if (comp[b] < 0) { comp[b] = id; list.push(b) }
    comps.push(list)
  }
  comps.sort((a, b) => b.length - a.length)
  const r = rng(seed)
  const sample = (list: number[], m: number) => (list.length <= m ? list : Array.from({ length: m }, () => list[(r() * list.length) | 0]))
  let joined = [...sample(comps[0] ?? [], 3000)]
  for (let ci = 1; ci < comps.length; ci++) {
    let best = Infinity, ba = -1, bb = -1
    for (const a of sample(comps[ci], 48)) for (const b of joined) { const d = dist(P, a, b); if (d < best) { best = d; ba = a; bb = b } }
    if (ba >= 0) { nb[ba].push(bb); nb[bb].push(ba) }
    // Stichprobe klein halten, sonst wird es bei Modellen aus vielen Einzelteilen langsam
    for (const a of sample(comps[ci], 40)) { if (joined.length < 4000) joined.push(a); else joined[(r() * 4000) | 0] = a }
    if (ci % 20 === 0) await tick()
  }
  const verts: number[] = []
  for (let i = 0; i < V; i++) if (used[i]) verts.push(i)

  // Startpunkte: so weit wie möglich auseinander (auf einer Stichprobe)
  const cand = sample(verts, 6000)
  const seeds: number[] = [cand[(r() * cand.length) | 0]]
  const dmin = new Float64Array(cand.length).fill(Infinity)
  while (seeds.length < n) {
    const s = seeds[seeds.length - 1]
    let bi = 0, bd = -1
    for (let i = 0; i < cand.length; i++) { const d = Math.min(dmin[i], dist(P, cand[i], s)); dmin[i] = d; if (d > bd) { bd = d; bi = i } }
    seeds.push(cand[bi])
  }

  const label = new Int32Array(V)
  const grow = () => {
    const d = new Float64Array(V).fill(Infinity)
    label.fill(-1)
    const h = new Heap()
    seeds.forEach((s, i) => { d[s] = 0; label[s] = i; h.push(0, s) })
    while (h.size) {
      const [dk, a] = h.pop()
      if (dk > d[a]) continue
      for (const b of nb[a]) {
        const nd = dk + dist(P, a, b)
        if (nd < d[b]) { d[b] = nd; label[b] = label[a]; h.push(nd, b) }
      }
    }
  }
  // nachjustieren: jeder Startpunkt wandert in die Mitte seiner Fläche
  for (let it = 0; it < 3; it++) {
    grow()
    await tick()
    if (it === 2) break
    const sx = new Float64Array(n), sy = new Float64Array(n), sz = new Float64Array(n)
    for (const i of verts) { const l = label[i]; if (l < 0) continue; sx[l] += P[i * 3]; sy[l] += P[i * 3 + 1]; sz[l] += P[i * 3 + 2] }
    const bestD = new Float64Array(n).fill(Infinity)
    const cnt = new Float64Array(n)
    for (const i of verts) if (label[i] >= 0) cnt[label[i]]++
    for (const i of verts) {
      const l = label[i]; if (l < 0) continue
      const cx = sx[l] / cnt[l], cy = sy[l] / cnt[l], cz = sz[l] / cnt[l]
      const dd = (P[i * 3] - cx) ** 2 + (P[i * 3 + 1] - cy) ** 2 + (P[i * 3 + 2] - cz) ** 2
      if (dd < bestD[l]) { bestD[l] = dd; seeds[l] = i }
    }
  }
  // Dreieck gehört dem Teil, dem die Mehrheit seiner Ecken gehört
  const out = new Int32Array(S.mat.length)
  for (let f = 0; f < S.mat.length; f++) {
    const a = label[S.cp[S.tri[f * 3]]], b = label[S.cp[S.tri[f * 3 + 1]]], c = label[S.cp[S.tri[f * 3 + 2]]]
    out[f] = b === c ? b : a
  }
  await tick()
  smoothCuts(S, out)
  return out
}

/** Macht die Schnittlinien glatt: erst Zacken aus einzelnen Dreiecken entfernen,
 *  dann die Punkte auf der Schnittlinie sanft zur Mitte ihrer Nachbarn schieben (wie eine Kurve). */
function smoothCuts(S: Soup, lab: Int32Array) {
  const T = S.mat.length, ek = (a: number, b: number) => (a < b ? a * 4194304 + b : b * 4194304 + a)
  const pid = (f: number, k: number) => S.cp[S.tri[f * 3 + k]]
  const faces = new Map<number, number[]>()
  for (let f = 0; f < T; f++) for (let k = 0; k < 3; k++) {
    const key = ek(pid(f, k), pid(f, (k + 1) % 3))
    const l = faces.get(key); if (l) l.push(f); else faces.set(key, [f])
  }
  const nbF = (f: number) => {
    const r: number[] = []
    for (let k = 0; k < 3; k++) for (const g of faces.get(ek(pid(f, k), pid(f, (k + 1) % 3)))!) if (g !== f) r.push(g)
    return r
  }
  // 1. Zacken weg: hat ein Dreieck zwei Nachbarn eines anderen Teils, wechselt es dorthin
  for (let pass = 0; pass < 4; pass++) {
    let changed = 0
    for (let f = 0; f < T; f++) {
      const ls = nbF(f).map((g) => lab[g])
      for (const l of ls) if (l !== lab[f] && ls.filter((x) => x === l).length >= 2) { lab[f] = l; changed++; break }
    }
    if (!changed) break
  }
  // 2. Schnittlinie glätten
  const V = S.P.length / 3
  const bn: number[][] = Array.from({ length: V }, () => [])
  for (const [key, fs] of faces) {
    if (fs.length < 2 || fs.every((g) => lab[g] === lab[fs[0]])) continue
    const a = Math.floor(key / 4194304), b = key % 4194304
    bn[a].push(b); bn[b].push(a)
  }
  // Normale je Punkt (aus den Ecken), um nur entlang der Fläche zu schieben
  const N = new Float64Array(V * 3)
  for (let c = 0; c < S.cp.length; c++) { const p = S.cp[c]; N[p * 3] += S.cn[c * 3]; N[p * 3 + 1] += S.cn[c * 3 + 1]; N[p * 3 + 2] += S.cn[c * 3 + 2] }
  const P = S.P
  for (let it = 0; it < 5; it++) {
    const next = new Map<number, [number, number, number]>()
    for (let i = 0; i < V; i++) {
      if (bn[i].length !== 2) continue // Ecken, an denen drei Teile zusammenstoßen, bleiben stehen
      const [a, b] = bn[i]
      let dx = (P[a * 3] + P[b * 3]) / 2 - P[i * 3], dy = (P[a * 3 + 1] + P[b * 3 + 1]) / 2 - P[i * 3 + 1], dz = (P[a * 3 + 2] + P[b * 3 + 2]) / 2 - P[i * 3 + 2]
      const nl = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1
      const nx = N[i * 3] / nl, ny = N[i * 3 + 1] / nl, nz = N[i * 3 + 2] / nl, d = dx * nx + dy * ny + dz * nz
      dx -= d * nx; dy -= d * ny; dz -= d * nz
      next.set(i, [P[i * 3] + dx * 0.5, P[i * 3 + 1] + dy * 0.5, P[i * 3 + 2] + dz * 0.5])
    }
    for (const [i, q] of next) { P[i * 3] = q[0]; P[i * 3 + 1] = q[1]; P[i * 3 + 2] = q[2] }
  }
}
