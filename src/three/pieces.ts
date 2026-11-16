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
    const ip: number[] = [], inn: number[] = []
    const P3 = (o: number) => [pos[o * 3], pos[o * 3 + 1], pos[o * 3 + 2]]
    const I3 = (o: number) => [pos[o * 3] - nor[o * 3] * thick, pos[o * 3 + 1] - nor[o * 3 + 1] * thick, pos[o * 3 + 2] - nor[o * 3 + 2] * thick]
    for (let t = 0; t < sorted.length; t++) {
      for (const k of [0, 2, 1]) { const o = t * 3 + k; ip.push(...I3(o)); inn.push(-nor[o * 3], -nor[o * 3 + 1], -nor[o * 3 + 2]) }
    }
    const wall = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3()
    const pushTri = (a: number[], b: number[], c: number[]) => {
      e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2])
      wall.crossVectors(e1, e2).normalize()
      ip.push(...a, ...b, ...c)
      for (let i = 0; i < 3; i++) inn.push(wall.x, wall.y, wall.z)
    }
    sorted.forEach((f, t) => {
      for (let k = 0; k < 3; k++) {
        const a = S.cp[S.tri[f * 3 + k]], b = S.cp[S.tri[f * 3 + ((k + 1) % 3)]]
        if (use.get(ek(a, b)) !== 1) continue
        const oa = t * 3 + k, ob = t * 3 + ((k + 1) % 3)
        const ao = P3(oa), bo = P3(ob), ai = I3(oa), bi = I3(ob)
        pushTri(ao, ai, bi); pushTri(ao, bi, bo)
      }
    })
    const inner = new THREE.BufferGeometry()
    inner.setAttribute('position', new THREE.Float32BufferAttribute(ip, 3))
    inner.setAttribute('normal', new THREE.Float32BufferAttribute(inn, 3))

    const mats = matList.map((mi) => outerMat(S.materials[mi]))
    const body = new THREE.MeshStandardMaterial({ color: 0xe6d6bb, roughness: 0.8, metalness: 0, side: THREE.DoubleSide })
    const solid = new THREE.Group()
    solid.add(new THREE.Mesh(outer, mats), new THREE.Mesh(inner, body))
    solid.visible = false

    // Platzhalter: gleiche Form in hellem Ton mit dunklem Umriss
    const gGeo = outer.clone()
    gGeo.setAttribute('color', new THREE.BufferAttribute(colG, 3))
    gGeo.clearGroups()
    const ghostMat = new THREE.MeshStandardMaterial({ color: 0xa89a84, vertexColors: true, roughness: 0.95, envMapIntensity: 0.5, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
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
