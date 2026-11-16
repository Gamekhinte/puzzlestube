// 3D-Bühne: ein echtes Modell, in Teile geschnitten. Freie Plätze sind als helle Form mit
// dunklem Umriss zu sehen, ein Teil rastet ein, wenn man es auf seinen Platz legt. Dafür muss der Platz vorne sein.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { loadModel, partition, refine, soupOf } from './cut'
import { type Piece, buildPieces } from './pieces'
import { modelFile } from './models'

const HINT = 0xffc94d

function lights(scene: THREE.Scene, camera: THREE.Camera) {
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x8a7258, 0.7))
  // warmes Hauptlicht schräg von oben, kühles Gegenlicht für die Kanten
  const d = new THREE.DirectionalLight(0xfff1de, 2.0)
  d.position.set(1.8, 2.8, 3)
  camera.add(d)
  const f = new THREE.DirectionalLight(0xdfe9ff, 0.5)
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
  scene.environmentIntensity = 0.8
}

const tick = () => new Promise((r) => setTimeout(r, 0))

/** Lädt das Modell und schneidet es in etwa `count` Teile (gleiche Eingabe ergibt dieselben Teile). */
async function cutModel(modelId: string, count: number, seed: number) {
  const scene = await loadModel(modelFile(modelId))
  await tick()
  const S = soupOf(scene)
  await refine(S, count <= 40 ? 16000 : count <= 120 ? 26000 : 38000)
  const lab = await partition(S, count, seed + count * 7)
  await tick()
  return await buildPieces(S, lab, count)
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
  static async create(canvas: HTMLCanvasElement, modelId: string, count: number, seed = 7): Promise<Stage3D> {
    const st = new Stage3D(canvas, await cutModel(modelId, count, seed))
    await st.prepare()
    return st
  }

  private constructor(private canvas: HTMLCanvasElement, pieces: Piece[]) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setClearColor(0x000000, 0)
    lights(this.scene, this.camera)
    look(this.renderer, this.scene)
    this.scene.add(this.root)
    this.pieces = pieces
    this.filled = this.pieces.map(() => null)
    for (const p of this.pieces) this.root.add(p.ghost, p.solid)

    const box = new THREE.Box3()
    for (const p of this.pieces) { box.expandByPoint(p.center.clone().addScalar(p.radius)); box.expandByPoint(p.center.clone().addScalar(-p.radius)) }
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

  /** Übersetzt die Shader im Hintergrund (parallel, ohne die Seite anzuhalten) und lädt die Texturen hoch,
   *  damit weder die Teilebilder noch das erste Einsetzen haken. */
  private async prepare() {
    const vis = this.pieces.map((p) => p.solid.visible)
    for (const p of this.pieces) p.solid.visible = true
    try { await this.renderer.compileAsync(this.scene, this.camera) } catch { /* egal */ }
    this.pieces.forEach((p, i) => { p.solid.visible = vis[i] })
    const done = new Set<THREE.Texture>()
    for (const p of this.pieces) p.solid.traverse((o) => {
      const m = (o as THREE.Mesh).material
      for (const mm of Array.isArray(m) ? m : m ? [m] : []) for (const v of Object.values(mm)) if (v instanceof THREE.Texture && !done.has(v)) { done.add(v); this.renderer.initTexture(v) }
    })
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

  /** Vorschaubilder aller Teile auf EINEM Bogen (wie Briefmarken), in einem einzigen Bild gerendert:
   *  jedes Teil mit der Außenseite nach vorne, in sein Kästchen eingepasst. */
  thumbs(size = 200): ThumbSheet {
    const n = this.pieces.length, cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols)
    const W = cols * size, H = rows * size
    const out = document.createElement('canvas'); out.width = W; out.height = H
    // mit dem schon laufenden Renderer zeichnen: Texturen und Shader sind dort schon fertig
    const r = this.renderer
    const keepPR = r.getPixelRatio(), keep = r.getSize(new THREE.Vector2())
    try {
      r.setPixelRatio(1); r.setSize(W, H, false)
      const scene = new THREE.Scene()
      const cam = new THREE.OrthographicCamera(0, cols, 0, -rows, -10, 10)
      cam.position.set(0, 0, 5)
      lights(scene, cam)
      scene.environment = this.scene.environment
      scene.environmentIntensity = this.scene.environmentIntensity
      const z = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3()
      this.pieces.forEach((p, i) => {
        const turn = new THREE.Quaternion().setFromUnitVectors(p.normal, z)
        // oben bleibt möglichst oben
        up.set(0, 1, 0).applyQuaternion(turn)
        const spin = new THREE.Quaternion().setFromAxisAngle(z, Math.atan2(up.x, up.y))
        const holder = new THREE.Group(), inner = new THREE.Group()
        for (const m of p.solid.children) inner.add(new THREE.Mesh((m as THREE.Mesh).geometry, (m as THREE.Mesh).material))
        inner.position.copy(p.center).multiplyScalar(-1)
        holder.add(inner)
        holder.quaternion.copy(spin.multiply(turn))
        holder.scale.setScalar(0.44 / Math.max(1e-6, p.radius))
        holder.position.set((i % cols) + 0.5, -(Math.floor(i / cols) + 0.5), 0)
        scene.add(holder)
      })
      r.render(scene, cam)
      out.getContext('2d')!.drawImage(r.domElement, 0, 0)
    } catch { /* ohne Bilder in der Leiste */ }
    r.setPixelRatio(keepPR); r.setSize(keep.x, keep.y, false)
    this.draw()
    return { canvas: out, cols, rows, size }
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
    if (this.hintSlot >= 0) (this.pieces[this.hintSlot].ghost.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000)
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
      const k = (now - this.hintT0) / 2600, m = this.pieces[this.hintSlot].ghost.material as THREE.MeshStandardMaterial
      if (k >= 1 || this.filled[this.hintSlot] !== null) { m.emissive.setHex(0x000000); this.hintSlot = -1 }
      else { m.emissive.setHex(HINT); m.emissiveIntensity = 0.55 + 0.35 * Math.sin(k * Math.PI * 8); anim = true }
    }
    if (this.spin) { this.az += 0.007; anim = true }
    this.place()
    this.renderer.render(this.scene, this.camera)
    if (anim) this.invalidate()
  }
}

/** Vorschaubild eines ganzen Modells (nur beim Entwickeln, siehe main.tsx), als WebP. */
export async function renderPreview(modelId: string, w = 480, h = 360): Promise<Blob | null> {
  const model = (await loadModel(modelFile(modelId))).clone()
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  r.setPixelRatio(1); r.setSize(w, h, false); r.setClearColor(0x000000, 0)
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, w / h, 0.01, 1000)
  lights(scene, cam)
  look(r, scene)
  scene.add(model)
  const s = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere())
  cam.position.copy(s.center).addScaledVector(new THREE.Vector3(0.5, 0.36, 0.78).normalize(), (s.radius / Math.sin(THREE.MathUtils.degToRad(16))) * 0.92)
  cam.lookAt(s.center)
  r.render(scene, cam)
  const blob = await new Promise<Blob | null>((ok) => r.domElement.toBlob(ok, 'image/webp', 0.86))
  r.dispose(); r.forceContextLoss()
  return blob
}
