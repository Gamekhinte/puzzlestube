// 3D-Bühne: Das Motiv ist auf die Oberfläche gedruckt und in Puzzleteile mit
// Nasen geschnitten. Freie Plätze sind als helle Umrisse zu sehen, ein Teil
// rastet ein, wenn man es auf seinen Platz legt. Dafür muss der Platz vorne sein.
import * as THREE from 'three'
import { type Edge, edgeTo, makeEdge, rng } from '../puzzle/engine'
import { type Built, MODELS, type Surface } from './models'

const HINT = 0xffc94d
const MARGIN = 0.42

function lights(scene: THREE.Scene, camera: THREE.Camera) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xa08a6c, 1.35))
  const d = new THREE.DirectionalLight(0xffffff, 2.1)
  d.position.set(1.6, 2.6, 3)
  camera.add(d)
  const f = new THREE.DirectionalLight(0xfff1dc, 0.5)
  f.position.set(-3, 0.5, 1)
  camera.add(f)
  scene.add(camera)
}

interface Piece {
  solid: THREE.Group
  ghost: THREE.Mesh
  center: THREE.Vector3
  normal: THREE.Vector3
  radius: number
  disposables: { dispose: () => void }[]
}

function canvasTex(cv: HTMLCanvasElement, color: boolean) {
  const t = new THREE.CanvasTexture(cv)
  t.flipY = false
  if (color) t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Baut aus einer Oberfläche die einzelnen Puzzleteile. */
function buildPieces(sf: Surface, seed: number, aniso: number): Piece[] {
  const { cols, rows, wrap } = sf
  const cv = document.createElement('canvas')
  cv.width = sf.tw; cv.height = sf.th
  const c2 = cv.getContext('2d')!
  sf.paint(c2, sf.tw, sf.th)
  const map = canvasTex(cv, true)
  map.wrapS = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  map.anisotropy = aniso

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
  const S = many ? 112 : 192, RES = many ? 9 : 14
  const out: Piece[] = []
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
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
        c.fillStyle = 'rgba(255,250,240,0.42)'; c.fill(p)
        c.lineJoin = 'round'; c.lineWidth = 0.045; c.strokeStyle = 'rgba(70,52,36,0.85)'; c.stroke(p)
      } else { c.fillStyle = '#fff'; c.fill(p) }
      const t = canvasTex(m, false)
      t.channel = 1
      t.generateMipmaps = false; t.minFilter = THREE.LinearFilter
      return t
    }
    const mask = draw(false), ghostTex = draw(true)

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
    const gOuter = layer(0, false), gMid = layer(sf.thick * 0.5, false), gInner = layer(sf.thick, true)
    const printMat = new THREE.MeshStandardMaterial({ map, alphaMap: mask, alphaTest: 0.5, alphaToCoverage: true, roughness: 0.42, metalness: 0.02 })
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe7e1d6, alphaMap: mask, alphaTest: 0.5, alphaToCoverage: true, roughness: 0.7, side: THREE.DoubleSide })
    const solid = new THREE.Group()
    solid.add(new THREE.Mesh(gOuter, printMat), new THREE.Mesh(gMid, bodyMat), new THREE.Mesh(gInner, bodyMat))
    solid.visible = false
    const ghost = new THREE.Mesh(gOuter, new THREE.MeshBasicMaterial({ map: ghostTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }))

    const Uc = (col + 0.5) / cols, Vc = (row + 0.5) / rows
    const center = sf.fn(Uc, Vc)
    let radius = 0
    for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) radius = Math.max(radius, center.distanceTo(sf.fn(wrap ? (((col + a) / cols) % 1) : (col + a) / cols, (row + b) / rows)))
    out.push({ solid, ghost, center, normal: normalAt(Uc, Vc).multiplyScalar(sign), radius, disposables: [gOuter, gMid, gInner, mask, ghostTex, printMat, bodyMat, ghost.material as THREE.Material, ...(col === 0 && row === 0 ? [map] : [])] })
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

  constructor(private canvas: HTMLCanvasElement, built: Built, seed = 7) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setClearColor(0x000000, 0)
    lights(this.scene, this.camera)
    this.scene.add(this.root)
    const aniso = this.renderer.capabilities.getMaxAnisotropy()
    built.surfaces.forEach((s, n) => this.pieces.push(...buildPieces(s, seed + n * 101, aniso)))
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

  /** Vorschaubild für jedes Teil, gerade von vorn auf die bedruckte Seite. */
  thumbs(size = 200): string[] {
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50)
    lights(scene, cam)
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(size, size, false)
    const out = this.pieces.map((p) => {
      const was = p.solid.visible, parent = p.solid.parent
      p.solid.visible = true
      scene.add(p.solid)
      const dir = p.normal.clone().add(new THREE.Vector3(0, 0.18, 0)).normalize()
      cam.position.copy(p.center).addScaledVector(dir, (p.radius * 1.12) / Math.tan(THREE.MathUtils.degToRad(15)))
      cam.up.set(0, 1, 0)
      if (Math.abs(dir.y) > 0.9) cam.up.set(0, 0, -1)
      cam.lookAt(p.center)
      this.renderer.render(scene, cam)
      const url = this.canvas.toDataURL('image/png')
      parent?.add(p.solid)
      p.solid.visible = was
      return url
    })
    this.resize()
    return out
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.setSize(r.width, r.height, false)
    this.camera.aspect = r.width / r.height
    this.camera.updateProjectionMatrix()
    this.invalidate()
  }

  private place() {
    // im Hochformat weiter weg, damit das Modell ganz ins Bild passt
    const k = this.camera.aspect < 1 ? 1 / this.camera.aspect : 1
    const d = this.dist * Math.min(k, 1.9)
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
/** Vorschaubilder der Modelle. Gibt sofort zurück, was schon fertig ist, und rendert den Rest
 *  nach und nach im Hintergrund (ein Modell pro Durchgang), damit nichts einfriert. */
export function modelThumbs(onUpdate?: (r: Record<string, string>) => void): Record<string, string> {
  if (onUpdate) listeners.add(onUpdate)
  if (running || MODELS.every((m) => cache[m.id])) return { ...cache }
  running = true
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, alpha: true })
  } catch { running = false; return { ...cache } } // ohne WebGL gibt es keine Vorschau
  renderer.setPixelRatio(1); renderer.setSize(480, 360, false)
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 4 / 3, 0.1, 100)
  lights(scene, cam)
  const todo = MODELS.filter((m) => !cache[m.id])
  const step = () => {
    const m = todo.shift()
    if (!m) { renderer.dispose(); renderer.forceContextLoss(); running = false; listeners.clear(); return }
    try {
      const g = new THREE.Group(), built = m.build(24), parts = built.surfaces.map(surfaceMesh)
      for (const p of parts) g.add(p.mesh)
      for (const s of built.statics) g.add(s)
      const s = new THREE.Box3().setFromObject(g).getBoundingSphere(new THREE.Sphere())
      scene.add(g)
      cam.position.copy(s.center).addScaledVector(new THREE.Vector3(0.5, 0.36, 0.78).normalize(), (s.radius / Math.sin(THREE.MathUtils.degToRad(16))) * 0.9)
      cam.lookAt(s.center)
      renderer.render(scene, cam)
      cache = { ...cache, [m.id]: renderer.domElement.toDataURL('image/png') }
      scene.remove(g)
      for (const p of parts) p.dispose()
      for (const l of listeners) l(cache)
    } catch { /* dieses Modell ohne Vorschau */ }
    setTimeout(step, 0)
  }
  setTimeout(step, 0)
  return { ...cache }
}
