// Aus der Aufteilung (Teilnummer je Dreieck) werden echte Teile mit Dicke:
// außen das Originalmaterial, innen eine helle Schale, dazwischen eine geschlossene Schnittkante.
import * as THREE from 'three'
import { type Soup, faceNormal } from './cut'

export interface Piece {
  solid: THREE.Group
  ghost: THREE.Mesh
  center: THREE.Vector3
  normal: THREE.Vector3
  radius: number
  /** nur für dieses Teil erzeugte Dinge (Geometrien, Materialkopien) */
  disposables: { dispose: () => void }[]
}

/** Material für außen: Kopie des Originals, mit dunklerer Schnittkante über Eckfarben. */
function outerMat(m: THREE.Material): THREE.Material {
  const c = m.clone() as THREE.MeshStandardMaterial
  c.vertexColors = true
  c.side = THREE.FrontSide
  if (c.transparent && c.opacity >= 0.99) c.transparent = false
  return c
}

export async function buildPieces(S: Soup, lab: Int32Array, n: number): Promise<Piece[]> {
  // Dreiecke je Teil
  const byPiece: number[][] = Array.from({ length: n }, () => [])
  for (let f = 0; f < lab.length; f++) if (lab[f] >= 0) byPiece[lab[f]].push(f)
  const thick = 0.035 // bei Radius 1,3
  const out: Piece[] = []
  const ek = (a: number, b: number) => (a < b ? a * 4194304 + b : b * 4194304 + a)
  const fn = new THREE.Vector3()

  let made = 0
  for (const tris of byPiece) {
    if (!tris.length) continue
    // alle paar Teile kurz Luft holen, damit die Seite nicht einfriert
    if (++made % 12 === 0) await new Promise((r) => setTimeout(r, 0))
    // Randkanten: nur einmal von diesem Teil benutzt
    const use = new Map<number, number>()
    for (const f of tris) for (let k = 0; k < 3; k++) {
      const key = ek(S.cp[S.tri[f * 3 + k]], S.cp[S.tri[f * 3 + ((k + 1) % 3)]])
      use.set(key, (use.get(key) ?? 0) + 1)
    }
    const rim = new Set<number>()
    for (const f of tris) for (let k = 0; k < 3; k++) {
      const a = S.cp[S.tri[f * 3 + k]], b = S.cp[S.tri[f * 3 + ((k + 1) % 3)]]
      if (use.get(ek(a, b)) === 1) { rim.add(a); rim.add(b) }
    }
    // nach Material sortieren (eine Gruppe je Material)
    const sorted = [...tris].sort((x, y) => S.mat[x] - S.mat[y])
    const N = sorted.length * 3
    const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), uv = new Float32Array(N * 2)
    const colS = new Float32Array(N * 3), colG = new Float32Array(N * 3)
    const outer = new THREE.BufferGeometry()
    let gStart = 0, gMat = -1
    const matList: number[] = []
    let ax = 0, ay = 0, az = 0, area = 0
    const nsum = new THREE.Vector3()
    sorted.forEach((f, t) => {
      if (S.mat[f] !== gMat) {
        if (gMat >= 0) outer.addGroup(gStart, t * 3 - gStart, matList.length - 1)
        gMat = S.mat[f]; gStart = t * 3; matList.push(gMat)
      }
      fn.copy(faceNormal(S, f))
      const ar = fn.length() / 2
      nsum.add(fn)
      for (let k = 0; k < 3; k++) {
        const ci = S.tri[f * 3 + k], p = S.cp[ci], o = t * 3 + k
        pos[o * 3] = S.P[p * 3]; pos[o * 3 + 1] = S.P[p * 3 + 1]; pos[o * 3 + 2] = S.P[p * 3 + 2]
        nor[o * 3] = S.cn[ci * 3]; nor[o * 3 + 1] = S.cn[ci * 3 + 1]; nor[o * 3 + 2] = S.cn[ci * 3 + 2]
        uv[o * 2] = S.cu[ci * 2]; uv[o * 2 + 1] = S.cu[ci * 2 + 1]
        const edge = rim.has(p)
        const s = edge ? 0.7 : 1, g = edge ? 0.5 : 1
        colS[o * 3] = colS[o * 3 + 1] = colS[o * 3 + 2] = s
        colG[o * 3] = colG[o * 3 + 1] = colG[o * 3 + 2] = g
        ax += pos[o * 3] * ar; ay += pos[o * 3 + 1] * ar; az += pos[o * 3 + 2] * ar
      }
      area += ar * 3
    })
    outer.addGroup(gStart, N - gStart, matList.length - 1)
    outer.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    outer.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
    outer.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    outer.setAttribute('color', new THREE.BufferAttribute(colS, 3))
    outer.computeBoundingSphere()

    // Innenschale (nach innen versetzt, umgedreht) und Schnittkante
    // feste Speicherblöcke statt wachsender Listen (auf dem Handy deutlich schneller)
    const rimEdges: number[] = []
    sorted.forEach((f, t) => {
      for (let k = 0; k < 3; k++) if (use.get(ek(S.cp[S.tri[f * 3 + k]], S.cp[S.tri[f * 3 + ((k + 1) % 3)]])) === 1) rimEdges.push(t * 3 + k, t * 3 + ((k + 1) % 3))
    })
    const M = N + (rimEdges.length / 2) * 6
    const ip = new Float32Array(M * 3), inn = new Float32Array(M * 3)
    let w = 0
    const putIn = (o: number, nx: number, ny: number, nz: number) => {
      ip[w * 3] = pos[o * 3] - nor[o * 3] * thick; ip[w * 3 + 1] = pos[o * 3 + 1] - nor[o * 3 + 1] * thick; ip[w * 3 + 2] = pos[o * 3 + 2] - nor[o * 3 + 2] * thick
      inn[w * 3] = nx; inn[w * 3 + 1] = ny; inn[w * 3 + 2] = nz; w++
    }
    const putOut = (o: number, nx: number, ny: number, nz: number) => {
      ip[w * 3] = pos[o * 3]; ip[w * 3 + 1] = pos[o * 3 + 1]; ip[w * 3 + 2] = pos[o * 3 + 2]
      inn[w * 3] = nx; inn[w * 3 + 1] = ny; inn[w * 3 + 2] = nz; w++
    }
    for (let t = 0; t < sorted.length; t++) for (const k of [0, 2, 1]) { const o = t * 3 + k; putIn(o, -nor[o * 3], -nor[o * 3 + 1], -nor[o * 3 + 2]) }
    for (let i = 0; i < rimEdges.length; i += 2) {
      const oa = rimEdges[i], ob = rimEdges[i + 1]
      // Wandnormale: Kante mal Flächennormale (zeigt aus dem Teil heraus)
      const ex = pos[ob * 3] - pos[oa * 3], ey = pos[ob * 3 + 1] - pos[oa * 3 + 1], ez = pos[ob * 3 + 2] - pos[oa * 3 + 2]
      const mx = nor[oa * 3] + nor[ob * 3], my = nor[oa * 3 + 1] + nor[ob * 3 + 1], mz = nor[oa * 3 + 2] + nor[ob * 3 + 2]
      let nx = ey * mz - ez * my, ny = ez * mx - ex * mz, nz = ex * my - ey * mx
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l
      putOut(oa, nx, ny, nz); putIn(oa, nx, ny, nz); putIn(ob, nx, ny, nz)
      putOut(oa, nx, ny, nz); putIn(ob, nx, ny, nz); putOut(ob, nx, ny, nz)
    }
    const inner = new THREE.BufferGeometry()
    inner.setAttribute('position', new THREE.BufferAttribute(ip, 3))
    inner.setAttribute('normal', new THREE.BufferAttribute(inn, 3))

    const mats = matList.map((mi) => outerMat(S.materials[mi]))
    const body = new THREE.MeshStandardMaterial({ color: 0xe6d6bb, roughness: 0.8, metalness: 0, side: THREE.DoubleSide })
    const solid = new THREE.Group()
    solid.add(new THREE.Mesh(outer, mats), new THREE.Mesh(inner, body))
    solid.visible = false

    // Platzhalter: gleiche Form in hellem Ton mit dunklem Umriss
    // teilt sich Lage, Richtung und uv mit dem Außenteil (kein doppelter Speicher), nur die Farben sind eigene
    const gGeo = new THREE.BufferGeometry()
    gGeo.setAttribute('position', outer.attributes.position)
    gGeo.setAttribute('normal', outer.attributes.normal)
    gGeo.setAttribute('uv', outer.attributes.uv)
    gGeo.setAttribute('color', new THREE.BufferAttribute(colG, 3))
    gGeo.boundingSphere = outer.boundingSphere
    const ghostMat = new THREE.MeshStandardMaterial({ color: 0x8a8174, vertexColors: true, roughness: 0.95, envMapIntensity: 0.5, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
    const ghost = new THREE.Mesh(gGeo, ghostMat)

    // Mitte auf der Oberfläche, mittlere Richtung, Größe
    const cx = ax / area, cy = ay / area, cz = az / area
    let best = Infinity, bi = 0
    for (let o = 0; o < N; o++) { const d = (pos[o * 3] - cx) ** 2 + (pos[o * 3 + 1] - cy) ** 2 + (pos[o * 3 + 2] - cz) ** 2; if (d < best) { best = d; bi = o } }
    const center = new THREE.Vector3(pos[bi * 3], pos[bi * 3 + 1], pos[bi * 3 + 2])
    let radius = 0
    for (let o = 0; o < N; o++) radius = Math.max(radius, Math.hypot(pos[o * 3] - center.x, pos[o * 3 + 1] - center.y, pos[o * 3 + 2] - center.z))
    const normal = nsum.lengthSq() > 1e-12 ? nsum.normalize() : new THREE.Vector3(nor[bi * 3], nor[bi * 3 + 1], nor[bi * 3 + 2]).normalize()
    out.push({ solid, ghost, center, normal, radius, disposables: [outer, inner, gGeo, body, ghostMat, ...mats] })
  }
  return out
}
