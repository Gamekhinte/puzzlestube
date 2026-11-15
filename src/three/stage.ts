// 3D-Bühne: Das Motiv ist auf die Oberfläche gedruckt und in Puzzleteile mit
// Nasen geschnitten. Freie Plätze sind als helle Umrisse zu sehen, ein Teil
// rastet ein, wenn man es auf seinen Platz legt. Dafür muss der Platz vorne sein.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { type Edge, edgeTo, makeEdge, rng } from '../puzzle/engine'
import { type Built, MODELS, type Surface } from './models'

const HINT = 0xffc94d
const MARGIN = 0.42

function lights(scene: THREE.Scene, camera: THREE.Camera) {
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x8a7258, 0.9))
  // warmes Hauptlicht schräg von oben, kühles Gegenlicht für die Kanten
  const d = new THREE.DirectionalLight(0xfff1de, 2.2)
  d.position.set(1.8, 2.8, 3)
  camera.add(d)
  const f = new THREE.DirectionalLight(0xdfe9ff, 0.55)
  f.position.set(-3, 0.6, 1)
  camera.add(f)
  const rim = new THREE.DirectionalLight(0xffffff, 0.6)
  rim.position.set(0, 2, -3)
  camera.add(rim)
  scene.add(camera)
}

/** Weiche Raumspiegelung und filmähnliche Farben, damit Oberflächen nach Material aussehen. */
const envCache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>()
function look(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  let env = envCache.get(renderer)
  if (!env) {
    const pm = new THREE.PMREMGenerator(renderer)
    env = pm.fromScene(new RoomEnvironment(), 0.04).texture
    pm.dispose()
    envCache.set(renderer, env)
  }
  scene.environment = env
  scene.environmentIntensity = 0.45
}

interface Piece {
  solid: THREE.Group
  ghost: THREE.Mesh
  center: THREE.Vector3
  normal: THREE.Vector3
  radius: number
  disposables: { dispose: () => void }[]
  /** flaches Bild des Teils (mit geprägtem Rand) für die Leiste, ohne 3D-Rendern */
  flat: { tex: HTMLCanvasElement; path: Path2D; u0: number; u1: number; v0: number; v1: number; aspect: number }
}

function canvasTex(cv: HTMLCanvasElement, color: boolean) {
  const t = new THREE.CanvasTexture(cv)
  t.flipY = false
  if (color) t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Wählt für eine Fläche das Raster (gleiche Teilezahl), bei dem die Teile am ehesten quadratisch sind.
 *  Dafür werden die echten Längen der Fläche in u- und v-Richtung gemessen. */
function fitGrid(sf: Surface): Surface {
  const n = sf.cols * sf.rows, k = 24
  let lu = 0, lv = 0
  for (const f of [0.25, 0.5, 0.75]) {
    for (let i = 0; i < k; i++) {
      lu += sf.fn(i / k, f).distanceTo(sf.fn((i + 1) / k, f))
      lv += sf.fn(f, i / k).distanceTo(sf.fn(f, (i + 1) / k))
    }
  }
  const aspect = lu / Math.max(1e-6, lv)
  let best = { cols: sf.cols, rows: sf.rows }, score = Infinity
  for (let cols = 1; cols <= n; cols++) {
    if (n % cols) continue
    const rows = n / cols
    if (sf.wrap && cols < 3) continue // rundherum braucht es mindestens drei Teile
    const sc = Math.abs(Math.log((aspect / cols) * rows))
    if (sc < score - 1e-9) { score = sc; best = { cols, rows } }
  }
  return { ...sf, ...best }
}

/** Normal-Map aus der Form eines Teils: innen flach, zum Rand hin abfallend. So erzeugt das
 *  3D-Licht selbst eine gewölbte, gestanzte Kante, die beim Drehen mitwandert. */
function bevelNormals(p: Path2D, u0: number, u1: number, v0: number, v1: number, N: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = cv.height = N
  const c = cv.getContext('2d')!
  c.setTransform(N / (u1 - u0), 0, 0, N / (v1 - v0), (-u0 * N) / (u1 - u0), (-v0 * N) / (v1 - v0))
  c.fillStyle = '#fff'; c.fill(p)
  const src = c.getImageData(0, 0, N, N).data
  let h = new Float32Array(N * N)
  for (let i = 0; i < N * N; i++) h[i] = src[i * 4] / 255
  // zweimal Kastenweichzeichner in beide Richtungen, Radius etwa 5 % der Kachel
  const r = Math.max(2, Math.round(N * 0.05))
  const tmp = new Float32Array(N * N)
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < N; y++) {
      let acc = 0
      for (let x = -r; x <= r; x++) acc += h[y * N + Math.min(N - 1, Math.max(0, x))]
      for (let x = 0; x < N; x++) {
        tmp[y * N + x] = acc / (2 * r + 1)
        acc += h[y * N + Math.min(N - 1, x + r + 1)] - h[y * N + Math.max(0, x - r)]
      }
    }
    for (let x = 0; x < N; x++) {
      let acc = 0
      for (let y = -r; y <= r; y++) acc += tmp[Math.min(N - 1, Math.max(0, y)) * N + x]
      for (let y = 0; y < N; y++) {
        h[y * N + x] = acc / (2 * r + 1)
        acc += tmp[Math.min(N - 1, y + r + 1) * N + x] - tmp[Math.max(0, y - r) * N + x]
      }
    }
  }
  // weicher Übergang: innen ganz flach, nur der Rand fällt ab
  h = h.map((v) => { const t = Math.min(1, Math.max(0, v * 1.15)); return t * t * (3 - 2 * t) })
  const img = c.createImageData(N, N), d = img.data, k = N * 0.9
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x
    const dx = (h[y * N + Math.min(N - 1, x + 1)] - h[y * N + Math.max(0, x - 1)]) * k
    const dy = (h[Math.min(N - 1, y + 1) * N + x] - h[Math.max(0, y - 1) * N + x]) * k
    const nx = -dx, ny = dy, nz = 1, l = Math.hypot(nx, ny, nz)
    d[i * 4] = (nx / l * 0.5 + 0.5) * 255; d[i * 4 + 1] = (ny / l * 0.5 + 0.5) * 255; d[i * 4 + 2] = (nz / l * 0.5 + 0.5) * 255; d[i * 4 + 3] = 255
  }
  c.setTransform(1, 0, 0, 1, 0, 0); c.putImageData(img, 0, 0)
  const t = canvasTex(cv, false)
  t.channel = 1
  return t
}

/** Baut aus einer Oberfläche die einzelnen Puzzleteile. */
async function buildPieces(sf0: Surface, seed: number, aniso: number): Promise<Piece[]> {
  const sf = fitGrid(sf0)
  const { cols, rows, wrap } = sf
  const cv = document.createElement('canvas')
  cv.width = sf.tw; cv.height = sf.th
  const c2 = cv.getContext('2d')!
  sf.paint(c2, sf.tw, sf.th)

  const r = rng(seed)
  const hE: Edge[][] = [], vE: Edge[][] = []
  for (let y = 0; y < rows; y++) { hE.push([]); vE.push([]); for (let x = 0; x < cols; x++) { hE[y].push(makeEdge(r)); vE[y].push(makeEdge(r)) } }
  const e = 1e-3
  const normalAt = (U: number, V: number) => (sf.nf ? sf.nf(U, V).clone().normalize() : sf.fn(U + e, V).sub(sf.fn(U - e, V)).cross(sf.fn(U, V + e).sub(sf.fn(U, V - e))).normalize())
  // zeigt die berechnete Normale nach außen? (von der Mitte der Fläche weg)
  const mid = sf.fn(0.5, 0.5), midN = normalAt(0.5, 0.5)
  const centre = new THREE.Vector3()
  for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) centre.add(sf.fn((i + 0.5) / 8, (j + 0.5) / 4))
  centre.multiplyScalar(1 / 32)
  const sign = sf.nf ? 1 : midN.dot(mid.clone().sub(centre)) >= 0 ? 1 : -1

  // bei vielen Teilen kleinere Masken und gröberes Netz, damit es auf Handy und iPad flüssig bleibt
  const many = cols * rows > 60
  const S = many ? 96 : 192, RES = many ? 9 : 14
  const out: Piece[] = []
  let made = 0
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    // alle paar Teile kurz Luft holen, damit die Seite nicht einfriert
    if (++made % 8 === 0) await new Promise((r) => setTimeout(r, 0))
    const left = wrap || col > 0, right = wrap || col < cols - 1
    const p = new Path2D()
    p.moveTo(0, 0)
    if (row === 0) p.lineTo(1, 0); else edgeTo(p, hE[row - 1][col], 0, 0, 1, 1, true, false)
    if (!right) p.lineTo(1, 1); else edgeTo(p, vE[row][col], 1, 0, 1, 1, false, false)
    if (row === rows - 1) p.lineTo(0, 1); else edgeTo(p, hE[row][col], 0, 1, 1, 1, true, true)
    if (!left) p.lineTo(0, 0); else edgeTo(p, vE[row][(col - 1 + cols) % cols], 0, 0, 1, 1, false, true)
    p.closePath()

    const u0 = left ? -MARGIN : 0, u1 = right ? 1 + MARGIN : 1, v0 = row > 0 ? -MARGIN : 0, v1 = row < rows - 1 ? 1 + MARGIN : 1
    const draw = (ghost: boolean) => {
      const m = document.createElement('canvas'); m.width = m.height = S
      const c = m.getContext('2d')!
      if (!ghost) { c.fillStyle = '#000'; c.fillRect(0, 0, S, S) }
      c.setTransform(S / (u1 - u0), 0, 0, S / (v1 - v0), (-u0 * S) / (u1 - u0), (-v0 * S) / (v1 - v0))
      if (ghost) {
        // wie eine gestanzte Mulde: heller Grund, dunkler Umriss, innen ein heller Rand
        c.fillStyle = 'rgba(232,222,206,0.82)'; c.fill(p)
        c.lineJoin = 'round'
        c.save(); c.clip(p)
        c.lineWidth = 0.09; c.strokeStyle = 'rgba(90,66,44,0.35)'; c.translate(0.02, 0.025); c.stroke(p)
        c.restore()
        c.lineWidth = 0.05; c.strokeStyle = 'rgba(60,42,26,0.95)'; c.stroke(p)
      } else { c.fillStyle = '#fff'; c.fill(p) }
      const t = canvasTex(m, false)
      t.channel = 1
      t.generateMipmaps = false; t.minFilter = THREE.LinearFilter
      return t
    }
    const mask = draw(false), ghostTex = draw(true)
    const normals = bevelNormals(p, u0, u1, v0, v1, many ? 64 : 176)

    // eigenes Bild für dieses Teil: Ausschnitt aus dem Motiv plus geprägte Kante wie bei 2D
    const regW = ((u1 - u0) / cols) * sf.tw, regH = ((v1 - v0) / rows) * sf.th
    const cap = many ? 160 : 512
    const TW = Math.max(64, Math.min(cap, Math.round(regW))), TH = Math.max(64, Math.min(cap, Math.round(regH)))
    const pc = document.createElement('canvas'); pc.width = TW; pc.height = TH
    const g2 = pc.getContext('2d')!
    g2.imageSmoothingQuality = 'high'
    const sx = TW / regW, sy = TH / regH, X0 = ((col + u0) / cols) * sf.tw, Y0 = ((row + v0) / rows) * sf.th
    for (const off of wrap ? [-sf.tw, 0, sf.tw] : [0]) g2.drawImage(cv, (off - X0) * sx, -Y0 * sy, sf.tw * sx, sf.th * sy)
    g2.setTransform(TW / (u1 - u0), 0, 0, TH / (v1 - v0), (-u0 * TW) / (u1 - u0), (-v0 * TH) / (v1 - v0))
    g2.save(); g2.clip(p); g2.lineJoin = 'round'
    const bevel = (o: number, w: number, dark: string, light: string) => {
      g2.lineWidth = w
      g2.save(); g2.translate(-o, -o); g2.strokeStyle = dark; g2.stroke(p); g2.restore()
      g2.save(); g2.translate(o, o); g2.strokeStyle = light; g2.stroke(p); g2.restore()
    }
    bevel(0.035, 0.09, 'rgba(0,0,0,0.20)', 'rgba(255,255,255,0.28)')
    bevel(0.018, 0.045, 'rgba(0,0,0,0.32)', 'rgba(255,255,255,0.55)')
    g2.restore()
    g2.lineWidth = 0.018; g2.strokeStyle = 'rgba(30,20,12,0.6)'; g2.stroke(p)
    const map = canvasTex(pc, true)
    map.channel = 1
    map.anisotropy = aniso

    const nu = Math.round(RES * (u1 - u0)), nv = Math.round(RES * (v1 - v0))
    const P: THREE.Vector3[] = [], N: THREE.Vector3[] = [], uv: number[] = [], uv1: number[] = []
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const cu = u0 + ((u1 - u0) * i) / nu, cv_ = v0 + ((v1 - v0) * j) / nv
      const U = (col + cu) / cols, Vv = (row + cv_) / rows
      const Uw = wrap ? ((U % 1) + 1) % 1 : U
      P.push(sf.fn(Uw, Vv)); N.push(normalAt(Uw, Vv).multiplyScalar(sign))
      uv.push(U, Vv); uv1.push(i / nu, j / nv)
    }
    const id = (i: number, j: number) => i * (nv + 1) + j
    const a0 = P[id(0, 0)]
    const ccw = P[id(1, 0)].clone().sub(a0).cross(P[id(0, 1)].clone().sub(a0)).dot(N[id(0, 0)]) > 0
    const layer = (d: number, flip: boolean) => {
      const pos: number[] = [], nor: number[] = [], idx: number[] = []
      P.forEach((q, k) => { pos.push(q.x - N[k].x * d, q.y - N[k].y * d, q.z - N[k].z * d); const s = flip ? -1 : 1; nor.push(N[k].x * s, N[k].y * s, N[k].z * s) })
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const a = id(i, j), b = id(i + 1, j), cc = id(i + 1, j + 1), dd = id(i, j + 1)
        if (ccw !== flip) idx.push(a, b, dd, b, cc, dd); else idx.push(a, dd, b, b, dd, cc)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
      g.setAttribute('uv1', new THREE.Float32BufferAttribute(uv1, 2))
      g.setIndex(idx)
      return g
    }
    const T = sf.thick * 1.5
    const gOuter = layer(0, false), gInner = layer(T, true)
    // Zwischenlagen ergeben von der Seite eine geschlossene Pappkante
    const mids = (many ? [0.5] : [0.2, 0.4, 0.6, 0.8]).map((f) => layer(T * f, false))
    const printMat = new THREE.MeshStandardMaterial({ map, normalMap: normals, normalScale: new THREE.Vector2(1.6, 1.6), alphaMap: mask, alphaTest: 0.5, alphaToCoverage: true, roughness: 0.48, metalness: 0, envMapIntensity: 0.6 })
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xb79a72, alphaMap: mask, alphaTest: 0.5, alphaToCoverage: true, roughness: 0.85, side: THREE.DoubleSide, envMapIntensity: 0.3 })
    const solid = new THREE.Group()
    solid.add(new THREE.Mesh(gOuter, printMat), ...mids.map((g) => new THREE.Mesh(g, bodyMat)), new THREE.Mesh(gInner, bodyMat))
    solid.visible = false
    const ghost = new THREE.Mesh(gOuter, new THREE.MeshBasicMaterial({ map: ghostTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }))

    const Uc = (col + 0.5) / cols, Vc = (row + 0.5) / rows
    // echtes Seitenverhältnis des Teils auf dem Modell (für das Bild in der Leiste)
    const wrapU = (u: number) => (wrap ? ((u % 1) + 1) % 1 : Math.min(1, Math.max(0, u)))
    const wP = sf.fn(wrapU(Uc - 0.5 / cols), Vc).distanceTo(sf.fn(wrapU(Uc + 0.5 / cols), Vc))
    const hP = sf.fn(Uc, Math.max(0, Vc - 0.5 / rows)).distanceTo(sf.fn(Uc, Math.min(1, Vc + 0.5 / rows)))
    const physAspect = (wP * (u1 - u0)) / Math.max(1e-6, hP * (v1 - v0))
    const center = sf.fn(Uc, Vc)
    let radius = 0
    for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) radius = Math.max(radius, center.distanceTo(sf.fn(wrap ? (((col + a) / cols) % 1) : (col + a) / cols, (row + b) / rows)))
    out.push({ solid, ghost, center, normal: normalAt(Uc, Vc).multiplyScalar(sign), radius, disposables: [gOuter, ...mids, gInner, mask, ghostTex, map, normals, printMat, bodyMat, ghost.material as THREE.Material], flat: { tex: pc, path: p, u0, u1, v0, v1, aspect: physAspect } })
  }
  return out
}

function groundShadow(radius: number, y: number) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128
  const c = cv.getContext('2d')!
  const g = c.createRadialGradient(64, 64, 4, 64, 64, 64)
  g.addColorStop(0, 'rgba(40,24,10,0.42)'); g.addColorStop(0.6, 'rgba(40,24,10,0.16)'); g.addColorStop(1, 'rgba(40,24,10,0)')
  c.fillStyle = g; c.fillRect(0, 0, 128, 128)
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.6, radius * 2.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }))
  m.position.y = y
  return m
}

export type PlaceResult = 'ok' | 'wrong' | 'miss'
export interface ThumbSheet { canvas: HTMLCanvasElement; cols: number; rows: number; size: number }

export class Stage3D {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100)
  private root = new THREE.Group()
  private pieces: Piece[] = []
  private filled: (number | null)[]
  private az = 0.55
  private pol = 1.12
  private dist = 6
  private baseDist = 6
  private pointers = new Map<number, { x: number; y: number }>()
  private moved = 0
  private downAt = 0
  private pinch = 0
  private raf = 0
  private dead = false
  private pops: { slot: number; t0: number }[] = []
  private hintT0 = 0
  private hintSlot = -1
  private turn: { az0: number; pol0: number; az1: number; pol1: number; t0: number } | null = null
  private spin = false
  private ro: ResizeObserver
  private ray = new THREE.Raycaster()
  onTap: (x: number, y: number) => void = () => {}

  /** Baut die Teile in Häppchen (die Seite bleibt bedienbar) und erstellt dann die Bühne. */
  static async create(canvas: HTMLCanvasElement, built: Built, seed = 7): Promise<Stage3D> {
    const pieces: Piece[] = []
    for (const [n, s] of built.surfaces.entries()) pieces.push(...(await buildPieces(s, seed + n * 101, 16)))
    return new Stage3D(canvas, built, pieces)
  }

  private constructor(private canvas: HTMLCanvasElement, built: Built, pieces: Piece[]) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setClearColor(0x000000, 0)
    lights(this.scene, this.camera)
    look(this.renderer, this.scene)
    this.scene.add(this.root)
    this.pieces = pieces
    this.filled = this.pieces.map(() => null)
    for (const s of built.statics) this.root.add(s)
    for (const p of this.pieces) this.root.add(p.ghost, p.solid)

    const box = new THREE.Box3()
    for (const p of this.pieces) { box.expandByPoint(p.center.clone().addScalar(p.radius)); box.expandByPoint(p.center.clone().addScalar(-p.radius)) }
    for (const s of built.statics) box.expandByObject(s)
    const c = box.getCenter(new THREE.Vector3())
    this.root.position.copy(c).multiplyScalar(-1)
    const r = box.getBoundingSphere(new THREE.Sphere()).radius
    this.root.add(groundShadow(r, box.min.y - 0.02))
    this.baseDist = this.dist = (r / Math.sin(THREE.MathUtils.degToRad(18))) * 1.02

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.resize()
    canvas.addEventListener('pointerdown', this.onDown)
    canvas.addEventListener('pointermove', this.onMove)
    canvas.addEventListener('pointerup', this.onUp)
    canvas.addEventListener('pointercancel', this.onUp)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    this.warmup()
  }

  /** Lädt Shader und Texturen der Teile im Hintergrund vor (ein paar pro Durchgang),
   *  damit das erste Einsetzen nicht hakt. */
  private warmup() {
    const first = this.pieces[0]
    if (!first) return
    first.solid.visible = true
    try { this.renderer.compile(this.scene, this.camera) } catch { /* egal */ }
    first.solid.visible = this.filled[0] !== null
    let i = 0
    const step = () => {
      if (this.dead) return
      const end = Math.min(this.pieces.length, i + 6)
      for (; i < end; i++) {
        for (const d of this.pieces[i].disposables) if (d instanceof THREE.Texture) this.renderer.initTexture(d)
      }
      if (i < this.pieces.length) setTimeout(step, 16)
    }
    setTimeout(step, 300)
  }

  get count() { return this.pieces.length }
  /** Bei vielen kleinen Teilen darf man näher ran. */
  private get minDist() { return this.baseDist * (this.pieces.length > 60 ? 0.3 : 0.5) }

  dispose() {
    this.dead = true
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    const c = this.canvas
    c.removeEventListener('pointerdown', this.onDown)
    c.removeEventListener('pointermove', this.onMove)
    c.removeEventListener('pointerup', this.onUp)
    c.removeEventListener('pointercancel', this.onUp)
    c.removeEventListener('wheel', this.onWheel)
    for (const p of this.pieces) for (const d of p.disposables) d.dispose()
    this.renderer.dispose()
  }

  /** Vorschaubilder aller Teile auf EINEM Bogen (wie Briefmarken). Gezeichnet mit dem flachen Bild
   *  jedes Teils (es hat den geprägten Rand schon), also ohne 3D-Rendern: dauert nur Millisekunden. */
  thumbs(size = 200): ThumbSheet {
    const n = this.pieces.length, cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols)
    const cv = document.createElement('canvas'); cv.width = cols * size; cv.height = rows * size
    const c = cv.getContext('2d')!
    c.imageSmoothingQuality = 'high'
    this.pieces.forEach((p, i) => {
      const f = p.flat, k = 0.96
      const w = f.aspect >= 1 ? size * k : size * k * f.aspect, h = f.aspect >= 1 ? (size * k) / f.aspect : size * k
      const x = (i % cols) * size + (size - w) / 2, y = Math.floor(i / cols) * size + (size - h) / 2
      c.save()
      c.translate(x, y); c.scale(w / (f.u1 - f.u0), h / (f.v1 - f.v0)); c.translate(-f.u0, -f.v0)
      // Pappkante unten und weicher Schatten
      c.save(); c.translate(0, 0.05); c.shadowColor = 'rgba(40,24,10,0.35)'; c.shadowBlur = size * 0.05; c.shadowOffsetY = size * 0.02
      c.fillStyle = '#a68559'; c.fill(f.path); c.restore()
      c.save(); c.clip(f.path); c.drawImage(f.tex, f.u0, f.v0, f.u1 - f.u0, f.v1 - f.v0); c.restore()
      c.restore()
    })
    // kein Speichern als Bilddatei (auf dem iPhone über eine Sekunde): die Leiste zeichnet direkt von hier ab
    return { canvas: cv, cols, rows, size }
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return
    this.renderer.setPixelRatio(Math.min(this.pieces.length > 60 ? 1.5 : 2, window.devicePixelRatio || 1))
    this.renderer.setSize(r.width, r.height, false)
    this.camera.aspect = r.width / r.height
    this.camera.updateProjectionMatrix()
    this.invalidate()
  }

  private place() {
    // im Hochformat weiter weg, damit das Modell ganz ins Bild passt
    // im breiten Querformat näher ran, die Höhe ist dort knapp und das Modell soll sie füllen
    const a = this.camera.aspect
    const k = a < 1 ? Math.min(1 / a, 1.9) : a > 1.6 ? 0.84 : 1
    const d = this.dist * k
    this.camera.position.set(d * Math.sin(this.pol) * Math.sin(this.az), d * Math.cos(this.pol), d * Math.sin(this.pol) * Math.cos(this.az))
    this.camera.lookAt(0, 0, 0)
  }

  resetView() { this.turnTo(0.55, 1.12); this.dist = this.baseDist }

  private turnTo(az: number, pol: number) {
    // kürzester Weg rundherum
    let d = (az - this.az) % (Math.PI * 2)
    if (d > Math.PI) d -= Math.PI * 2
    if (d < -Math.PI) d += Math.PI * 2
    this.turn = { az0: this.az, pol0: this.pol, az1: this.az + d, pol1: pol, t0: performance.now() }
    this.spin = false
    this.invalidate()
  }

  // ---------- Eingabe ----------
  private onDown = (e: PointerEvent) => {
    e.preventDefault()
    try { this.canvas.setPointerCapture(e.pointerId) } catch { /* egal */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    this.turn = null
    if (this.pointers.size === 1) { this.moved = 0; this.downAt = performance.now(); this.spin = false }
    if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch = Math.hypot(a.x - b.x, a.y - b.y) * this.dist; this.moved = 99 }
  }
  private onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId)
    if (!p) return
    const dx = e.clientX - p.x, dy = e.clientY - p.y
    p.x = e.clientX; p.y = e.clientY
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()]
      this.dist = THREE.MathUtils.clamp(this.pinch / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), this.minDist, this.baseDist * 1.8)
    } else {
      this.moved += Math.abs(dx) + Math.abs(dy)
      this.az -= dx * 0.008
      this.pol = THREE.MathUtils.clamp(this.pol - dy * 0.008, 0.12, Math.PI - 0.12)
    }
    this.invalidate()
  }
  private onUp = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return
    this.pointers.delete(e.pointerId)
    if (e.type === 'pointerup' && this.pointers.size === 0 && this.moved < 10 && performance.now() - this.downAt < 600) this.onTap(e.clientX, e.clientY)
  }
  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    this.dist = THREE.MathUtils.clamp(this.dist * Math.exp(e.deltaY * 0.001), this.minDist, this.baseDist * 1.8)
    this.invalidate()
  }

  // ---------- Spiel ----------
  get slots() { return this.filled }

  /** Versucht, ein Teil an der Bildschirmstelle (x, y) einzusetzen. Der Platz muss vorne zu sehen sein. */
  tryPlace(piece: number, clientX: number, clientY: number): PlaceResult {
    const r = this.canvas.getBoundingClientRect()
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return 'miss'
    this.place(); this.camera.updateMatrixWorld(); this.root.updateMatrixWorld()
    const p = this.pieces[piece]
    const world = p.center.clone().add(this.root.position)
    const facing = p.normal.dot(this.camera.position.clone().sub(world).normalize())
    const s = world.clone().project(this.camera)
    const sx = ((s.x + 1) / 2) * r.width, sy = ((1 - s.y) / 2) * r.height
    // Größe des Teils auf dem Bildschirm, großzügig gerechnet
    const edge = world.clone().add(new THREE.Vector3().copy(this.camera.up).applyQuaternion(this.camera.quaternion).multiplyScalar(0)).add(new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion).multiplyScalar(p.radius)).project(this.camera)
    const pr = Math.abs(((1 - edge.y) / 2) * r.height - sy)
    const d = Math.hypot(sx - (clientX - r.left), sy - (clientY - r.top))
    if (facing > 0.12 && d < Math.max(pr * 1.05, this.pieces.length > 60 ? 26 : 46)) { this.fill(piece, piece, true); return 'ok' }
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    this.ray.setFromCamera(ndc, this.camera)
    return this.ray.intersectObject(this.root, true).length ? 'wrong' : 'miss'
  }

  fill(slot: number, piece: number, animate: boolean) {
    this.filled[slot] = piece
    const p = this.pieces[slot]
    p.ghost.visible = false
    p.solid.visible = true
    if (animate) this.pops.push({ slot, t0: performance.now() })
    this.invalidate()
  }

  /** Dreht das Modell so, dass der Platz des Teils vorne ist, und lässt ihn gelb leuchten. */
  hint(piece: number) {
    const n = this.pieces[piece].normal
    this.turnTo(Math.atan2(n.x, n.z), THREE.MathUtils.clamp(Math.acos(THREE.MathUtils.clamp(n.y, -1, 1)), 0.35, Math.PI - 0.35))
    this.hintSlot = piece
    this.hintT0 = performance.now()
    this.invalidate()
  }

  celebrate() { this.spin = true; this.invalidate() }

  invalidate() {
    if (this.raf || this.dead) return
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw() })
  }

  private draw() {
    const now = performance.now()
    let anim = false
    if (this.turn) {
      const k = Math.min(1, (now - this.turn.t0) / 650), e = 1 - Math.pow(1 - k, 3)
      this.az = this.turn.az0 + (this.turn.az1 - this.turn.az0) * e
      this.pol = this.turn.pol0 + (this.turn.pol1 - this.turn.pol0) * e
      if (k >= 1) this.turn = null; else anim = true
    }
    for (const p of this.pops) {
      const k = Math.min(1, (now - p.t0) / 520), pc = this.pieces[p.slot]
      // kommt von außen an seinen Platz und leuchtet kurz
      pc.solid.position.copy(pc.normal).multiplyScalar(0.28 * (1 - k) * (1 - k))
      pc.solid.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m?.emissive) { m.emissive.setHex(HINT); m.emissiveIntensity = 0.55 * (1 - k) } })
      if (k < 1) anim = true
    }
    this.pops = this.pops.filter((p) => now - p.t0 < 520)
    if (this.hintSlot >= 0) {
      const k = (now - this.hintT0) / 2600, m = this.pieces[this.hintSlot].ghost.material as THREE.MeshBasicMaterial
      if (k >= 1 || this.filled[this.hintSlot] !== null) { m.color.setHex(0xffffff); m.opacity = 1; this.hintSlot = -1 }
      else { m.color.setHex(HINT); m.opacity = 0.75 + 0.25 * Math.sin(k * Math.PI * 8); anim = true }
    }
    if (this.spin) { this.az += 0.007; anim = true }
    this.place()
    this.renderer.render(this.scene, this.camera)
    if (anim) this.invalidate()
  }
}

/** Die ganze bedruckte Fläche als ein Stück (für Vorschaubilder, viel schneller als einzelne Teile). */
function surfaceMesh(sf: Surface): { mesh: THREE.Mesh; dispose: () => void } {
  const cv = document.createElement('canvas')
  cv.width = Math.min(1024, sf.tw); cv.height = Math.max(1, Math.round((sf.th * cv.width) / sf.tw))
  const c = cv.getContext('2d')!
  // in voller Größe malen und verkleinert übernehmen, damit die Motive gleich aussehen
  const big = document.createElement('canvas'); big.width = sf.tw; big.height = sf.th
  sf.paint(big.getContext('2d')!, sf.tw, sf.th)
  c.drawImage(big, 0, 0, cv.width, cv.height)
  const map = canvasTex(cv, true)
  const nu = 72, nv = 36, pos: number[] = [], uv: number[] = [], idx: number[] = []
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const u = i / nu, v = j / nv, p = sf.fn(sf.wrap ? u % 1 : u, v); pos.push(p.x, p.y, p.z); uv.push(u, v) }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; idx.push(a, b, a + 1, b, b + 1, a + 1) }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx)
  g.computeVertexNormals()
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.45, metalness: 0.02, side: THREE.DoubleSide })
  return { mesh: new THREE.Mesh(g, m), dispose: () => { g.dispose(); m.dispose(); map.dispose() } }
}

let cache: Record<string, string> = {}
let running = false
const listeners = new Set<(r: Record<string, string>) => void>()
// Fertige Vorschaubilder werden auf dem Gerät gemerkt (Cache-Speicher des Browsers).
// Bei Änderungen an den Modellen oder am Licht diese Version hochzählen.
const THUMB_STORE = 'puzzlestube-3d-vorschau-v2'
const thumbKey = (id: string) => `vorschau/${id}.webp`
function emit() { const r = { ...cache }; for (const l of listeners) l(r) }

/** Vorschaubilder der Modelle. Gibt sofort zurück, was schon da ist. Zuerst wird der Gerätespeicher
 *  gelesen, nur was fehlt, wird im Hintergrund gerendert (ein Modell pro Durchgang) und gemerkt. */
export function modelThumbs(onUpdate?: (r: Record<string, string>) => void): Record<string, string> {
  if (onUpdate) listeners.add(onUpdate)
  if (running || MODELS.every((m) => cache[m.id])) return { ...cache }
  running = true
  void (async () => {
    let store: Cache | null = null
    try { store = await caches.open(THUMB_STORE) } catch { /* ohne Cache-Speicher einfach rendern */ }
    if (store) {
      await Promise.all(MODELS.map(async (m) => {
        if (cache[m.id]) return
        const hit = await store!.match(thumbKey(m.id))
        if (hit) cache[m.id] = URL.createObjectURL(await hit.blob())
      }))
      emit()
    }
    renderMissing(store)
  })()
  return { ...cache }
}

function renderMissing(store: Cache | null) {
  const todo = MODELS.filter((m) => !cache[m.id])
  if (!todo.length) { running = false; return }
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, alpha: true })
  } catch { running = false; return } // ohne WebGL gibt es keine Vorschau
  renderer.setPixelRatio(1); renderer.setSize(480, 360, false)
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 4 / 3, 0.1, 100)
  lights(scene, cam)
  look(renderer, scene)
  const step = async () => {
    const m = todo.shift()
    if (!m) { renderer.dispose(); renderer.forceContextLoss(); running = false; return }
    try {
      const g = new THREE.Group(), built = m.build(24), parts = built.surfaces.map(surfaceMesh)
      for (const p of parts) g.add(p.mesh)
      for (const s of built.statics) g.add(s)
      const s = new THREE.Box3().setFromObject(g).getBoundingSphere(new THREE.Sphere())
      scene.add(g)
      cam.position.copy(s.center).addScaledVector(new THREE.Vector3(0.5, 0.36, 0.78).normalize(), (s.radius / Math.sin(THREE.MathUtils.degToRad(16))) * 0.9)
      cam.lookAt(s.center)
      renderer.render(scene, cam)
      const blob = await new Promise<Blob | null>((ok) => renderer.domElement.toBlob(ok, 'image/webp', 0.86))
      scene.remove(g)
      for (const p of parts) p.dispose()
      if (blob) {
        cache = { ...cache, [m.id]: URL.createObjectURL(blob) }
        if (store) void store.put(thumbKey(m.id), new Response(blob, { headers: { 'Content-Type': 'image/webp' } })).catch(() => {})
        emit()
      }
    } catch { /* dieses Modell ohne Vorschau */ }
    setTimeout(() => void step(), 0)
  }
  setTimeout(() => void step(), 0)
}
