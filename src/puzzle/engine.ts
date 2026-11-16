// 2D-Puzzle-Engine auf Canvas. Teile hängen in Gruppen zusammen; jede Gruppe
// hat einen gemeinsamen Versatz (dx, dy) zur richtigen Lage. Versatz 0 und
// "locked" heißt: liegt fest auf dem Brett.

export interface SavedGroup { dx: number; dy: number; p: number[] }
export interface SavedState { groups: SavedGroup[]; locked: number[]; tray?: number[] }

interface Group { id: number; dx: number; dy: number; pieces: number[]; locked: boolean; hasEdge: boolean }
export interface Edge { flip: number; a: number; b: number; c: number; d: number; e: number }
interface Tween { g: Group; fx: number; fy: number; tx: number; ty: number; t0: number; dur: number }

export interface EngineOptions {
  cols: number
  rows: number
  seed: number
  saved?: SavedState | null
  onProgress: (percent: number, done: boolean) => void
  onSnap: () => void
  onDirty: () => void
}

export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TAB = 0.1
const JIT = 0.04
const MARGIN = 0.37

export class PuzzleEngine {
  private ctx: CanvasRenderingContext2D
  private hit: CanvasRenderingContext2D
  private W: number
  private H: number
  private pw: number
  private ph: number
  private mx: number
  private my: number
  private cols: number
  private rows: number
  private total: number
  private img: HTMLCanvasElement
  private sprites: HTMLCanvasElement[] = []
  private paths: Path2D[] = []
  private groupOf: Group[] = []
  private loose: Group[] = []
  private lockedGroup: Group
  private lockedLayer: HTMLCanvasElement
  private lockedCtx: CanvasRenderingContext2D
  private nextId = 1
  private scale = 1
  private tx = 0
  private ty = 0
  private cw = 1
  private ch = 1
  private dpr = 1
  private pointers = new Map<number, { x: number; y: number }>()
  private drag: { g: Group; ox: number; oy: number; id: number } | null = null
  private pan: { id: number; x: number; y: number } | null = null
  private pinch: { d: number; wx: number; wy: number } | null = null
  private tweens: Tween[] = []
  private glow: { pieces: number[]; t0: number } | null = null
  private hintGlow: { pieces: number[]; t0: number; fromTray: boolean } | null = null
  private lastMoved: Group | null = null
  private raf = 0
  private dead = false
  private ro: ResizeObserver
  private done = false
  private lineW = 1
  private still: HTMLCanvasElement = document.createElement('canvas')
  private stillCtx: CanvasRenderingContext2D = this.still.getContext('2d')!
  private stillDirty = true
  // Leiste unten: lose Einzelteile, die noch nicht auf dem Tisch liegen
  private tray: number[] = []
  private trayScroll = 0
  private trayVel = 0
  private trayT = 0
  private trayTouch: { id: number; x0: number; y0: number; scroll0: number; piece: number; mode: 0 | 1; lx: number; lt: number } | null = null
  private last = { x: 0, y: 0 }
  showPreview = false
  edgesOnly = false
  /** nur das Brett mit den gelegten Teilen zeigen (ohne lose Teile und Leiste) */
  boardOnly = false
  /** Brett festhalten: ein Finger auf leerer Fläche schiebt das Bild nicht weg (Zoomen mit zwei Fingern geht weiter) */
  locked = true

  constructor(private canvas: HTMLCanvasElement, source: HTMLCanvasElement, private opts: EngineOptions) {
    this.ctx = canvas.getContext('2d')!
    this.hit = document.createElement('canvas').getContext('2d')!
    this.cols = opts.cols
    this.rows = opts.rows
    this.total = this.cols * this.rows
    // Arbeitsgröße: bei vielen Teilen etwas größer, damit jedes Teil scharf bleibt.
    // Kleine oder schlechte Fotos werden dafür auch hochgerechnet: das Bild wird davon nicht schärfer,
    // aber Umriss, Kante und Schatten der Teile bleiben sauber statt verwaschen.
    const small = Math.max(screen.width, screen.height) <= 950
    const maxDim = small ? 1500 : this.total >= 400 ? 2000 : 1600
    const budget = small ? 2.6e6 : 4e6 // Bildpunkte der Arbeitsfläche, damit der Speicher reicht
    let s = maxDim / Math.max(source.width, source.height)
    const piece = Math.min((source.width * s) / this.cols, (source.height * s) / this.rows)
    if (piece < 120) s *= 120 / piece
    s = Math.min(s, Math.sqrt(budget / (source.width * source.height)))
    this.W = Math.round(source.width * s)
    this.H = Math.round(source.height * s)
    this.img = document.createElement('canvas')
    this.img.width = this.W
    this.img.height = this.H
    const ic = this.img.getContext('2d')!
    ic.imageSmoothingQuality = 'high'
    ic.drawImage(source, 0, 0, this.W, this.H)
    this.pw = this.W / this.cols
    this.ph = this.H / this.rows
    // Rand um jedes Teil: Platz für die Nasen und den eingebackenen Schatten
    const pad = Math.ceil(Math.min(this.pw, this.ph) * 0.26)
    this.mx = Math.ceil(this.pw * MARGIN) + pad
    this.my = Math.ceil(this.ph * MARGIN) + pad
    this.lockedLayer = document.createElement('canvas')
    this.lockedLayer.width = this.W
    this.lockedLayer.height = this.H
    this.lockedCtx = this.lockedLayer.getContext('2d')!
    this.lockedGroup = { id: 0, dx: 0, dy: 0, pieces: [], locked: true, hasEdge: true }

    this.buildPieces()
    if (opts.saved && this.restore(opts.saved)) {
      // Stand geladen
    } else {
      this.scatter()
    }

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.resize()
    this.fitBoard()
    this.checkDone()
    canvas.addEventListener('pointerdown', this.onDown)
    canvas.addEventListener('pointermove', this.onMove)
    canvas.addEventListener('pointerup', this.onUp)
    canvas.addEventListener('pointercancel', this.onUp)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    this.report()
  }

  destroy() {
    this.dead = true
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    const c = this.canvas
    c.removeEventListener('pointerdown', this.onDown)
    c.removeEventListener('pointermove', this.onMove)
    c.removeEventListener('pointerup', this.onUp)
    c.removeEventListener('pointercancel', this.onUp)
    c.removeEventListener('wheel', this.onWheel)
  }

  // ---------- Aufbau ----------

  private buildPieces() {
    const { cols, rows, pw, ph } = this
    const r = rng(this.opts.seed)
    const mk = (): Edge => ({ flip: r() < 0.5 ? 1 : -1, a: u(r), b: u(r), c: u(r), d: u(r), e: u(r) })
    const hE: Edge[][] = []
    const vE: Edge[][] = []
    for (let y = 0; y < rows; y++) {
      hE.push([]); vE.push([])
      for (let x = 0; x < cols; x++) { hE[y].push(mk()); vE[y].push(mk()) }
    }
    const m = Math.min(pw, ph)
    const lineW = (this.lineW = Math.max(1, m * 0.016))
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const p = new Path2D()
        p.moveTo(0, 0)
        if (row === 0) p.lineTo(pw, 0); else edgeTo(p, hE[row - 1][col], 0, 0, pw, ph, true, false)
        if (col === cols - 1) p.lineTo(pw, ph); else edgeTo(p, vE[row][col], pw, 0, ph, pw, false, false)
        if (row === rows - 1) p.lineTo(0, ph); else edgeTo(p, hE[row][col], 0, ph, pw, ph, true, true)
        if (col === 0) p.lineTo(0, 0); else edgeTo(p, vE[row][col - 1], 0, 0, ph, pw, false, true)
        p.closePath()
        this.paths.push(p)

        const sp = document.createElement('canvas')
        sp.width = Math.ceil(pw) + this.mx * 2
        sp.height = Math.ceil(ph) + this.my * 2
        const c = sp.getContext('2d')!
        c.translate(this.mx, this.my)
        // Schatten und Pappdicke werden einmal ins Teil gebacken, kosten beim Ziehen also nichts
        const thick = m * 0.055
        c.save()
        c.shadowColor = 'rgba(30,16,6,0.55)'
        c.shadowBlur = m * 0.13
        c.shadowOffsetX = m * 0.03
        c.shadowOffsetY = m * 0.09
        c.translate(thick * 0.5, thick)
        c.fillStyle = '#3a2a1c'
        c.fill(p)
        c.restore()
        // sichtbare Seitenkante: Lagen Pappe nach unten versetzt, unten dunkler
        for (let k = 6; k >= 1; k--) {
          c.save(); c.translate((thick * 0.5 * k) / 6, (thick * k) / 6)
          c.fillStyle = ['#c3a37a', '#ad8b62', '#9a7752', '#866444', '#735438', '#5e432c'][k - 1]
          c.fill(p); c.restore()
        }
        c.save()
        c.clip(p)
        c.drawImage(this.img, -col * pw, -row * ph)
        // leichter Glanz über die Fläche: oben links heller, unten rechts dunkler
        const sheen = c.createLinearGradient(0, 0, pw, ph)
        sheen.addColorStop(0, 'rgba(255,255,255,0.16)'); sheen.addColorStop(0.45, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,0.14)')
        c.fillStyle = sheen; c.fillRect(-pw, -ph, pw * 3, ph * 3)
        c.restore()
        // gewölbte Kante: weicher Innenschatten, Licht von oben links, Schatten unten rechts
        const many = this.total > 500
        this.emboss(c, p, m * 0.045, m * 0.09, 'rgba(255,255,255,0.75)', 'rgba(20,10,0,0.55)')
        if (!many) this.emboss(c, p, m * 0.014, m * 0.02, 'rgba(255,255,255,0.55)', 'rgba(20,10,0,0.4)')
        c.lineJoin = 'round'
        c.lineWidth = lineW * 0.9
        c.strokeStyle = 'rgba(30,20,12,0.6)'
        c.stroke(p)
        this.sprites.push(sp)
      }
    }
  }

  /** Innenschatten an der Kante eines Teils: hell oben links, dunkel unten rechts (wirkt gewölbt). */
  private emboss(c: CanvasRenderingContext2D, p: Path2D, off: number, blur: number, light: string, dark: string) {
    const ring = new Path2D()
    ring.rect(-this.W, -this.H, this.W * 3, this.H * 3)
    ring.addPath(p)
    for (const [col, d] of [[light, 1], [dark, -1]] as const) {
      c.save()
      c.clip(p)
      c.shadowColor = col; c.shadowBlur = blur; c.shadowOffsetX = off * d; c.shadowOffsetY = off * d
      c.fillStyle = '#000'
      c.fill(ring, 'evenodd')
      c.restore()
    }
  }

  private isEdge(i: number) {
    const c = i % this.cols, r = (i / this.cols) | 0
    return c === 0 || r === 0 || c === this.cols - 1 || r === this.rows - 1
  }
  private homeX(i: number) { return (i % this.cols) * this.pw }
  private homeY(i: number) { return ((i / this.cols) | 0) * this.ph }

  private newGroup(pieces: number[], dx: number, dy: number): Group {
    const g: Group = { id: this.nextId++, dx, dy, pieces, locked: false, hasEdge: pieces.some((i) => this.isEdge(i)) }
    for (const i of pieces) this.groupOf[i] = g
    this.loose.push(g)
    return g
  }

  private restore(s: SavedState): boolean {
    try {
      const seen = new Set<number>()
      const ok = (i: number) => Number.isInteger(i) && i >= 0 && i < this.total && !seen.has(i) && (seen.add(i), true)
      if (!s.locked.every(ok)) return false
      for (const g of s.groups) if (!g.p.every(ok)) return false
      const tray = s.tray ?? []
      if (!tray.every(ok)) return false
      if (seen.size !== this.total) return false
      for (const i of s.locked) this.lockPiece(i)
      for (const g of s.groups) this.newGroup(g.p.slice(), g.dx, g.dy)
      this.tray = tray.slice()
      return true
    } catch { return false }
  }

  serialize(): SavedState {
    return {
      locked: this.lockedGroup.pieces.slice(),
      tray: this.tray.slice(),
      groups: this.loose.map((g) => ({ dx: Math.round(g.dx), dy: Math.round(g.dy), p: g.pieces.slice() })),
    }
  }

  private lockPiece(i: number) {
    this.lockedGroup.pieces.push(i)
    this.groupOf[i] = this.lockedGroup
    const c = this.lockedCtx, x = this.homeX(i), y = this.homeY(i)
    c.save()
    c.translate(x, y)
    c.save(); c.clip(this.paths[i]); c.drawImage(this.img, -x, -y); c.restore()
    // leicht gewölbt wie echte gelegte Pappe, dazu die feine Fuge
    const m = Math.min(this.pw, this.ph)
    this.emboss(c, this.paths[i], m * 0.025, m * 0.05, 'rgba(255,255,255,0.4)', 'rgba(20,10,0,0.32)')
    c.lineJoin = 'round'
    c.lineWidth = this.lineW * 1.6
    c.strokeStyle = 'rgba(255,255,255,0.16)'
    c.stroke(this.paths[i])
    c.lineWidth = this.lineW * 0.8
    c.strokeStyle = 'rgba(20,12,6,0.42)'
    c.stroke(this.paths[i])
    c.restore()
  }

  // ---------- Leiste ----------

  private scatter() {
    const order = Array.from({ length: this.total }, (_, i) => i)
    const r = rng(this.opts.seed ^ 0x9e3779b9)
    for (let i = order.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]] }
    this.tray = order
  }

  private visible(g: Group) { return this.boardOnly ? !!g.locked : !this.edgesOnly || g.hasEdge || g.locked }

  /** Höhe der Leiste in Bildschirmpunkten. Ist sie leer, verschwindet sie. */
  private get trayH() {
    if (!this.tray.length || this.done || this.boardOnly) return 0
    return this.ch < 430 ? 112 : Math.round(Math.max(176, Math.min(260, this.ch * 0.3)))
  }
  private get trayRows() { return this.ch < 430 ? 1 : 2 }
  private get trayCell() { return (this.trayH - 16) / this.trayRows }
  private trayList() { return this.edgesOnly ? this.tray.filter((i) => this.isEdge(i)) : this.tray }
  private trayMax(n: number) { return Math.max(0, Math.ceil(n / this.trayRows) * this.trayCell + 16 - this.cw) }
  private trayAt(x: number, y: number): number {
    const ts = this.trayCell, list = this.trayList()
    const col = Math.floor((x - 8 + this.trayScroll) / ts), row = Math.min(this.trayRows - 1, Math.max(0, Math.floor((y - (this.ch - this.trayH) - 8) / ts)))
    const n = col * this.trayRows + row
    return col >= 0 && n < list.length ? list[n] : -1
  }

  /** Räumt auf: alle losen Einzelteile vom Tisch kommen zurück in die Leiste. */
  tidy() {
    if (this.done) return
    this.finishTweens()
    const back = this.loose.filter((g) => g.pieces.length === 1 && this.visible(g))
    if (back.length) {
      const set = new Set(back)
      this.loose = this.loose.filter((g) => !set.has(g))
      for (const g of back) { const i = g.pieces[0]; delete (this.groupOf as (Group | undefined)[])[i]; this.tray.push(i) }
    }
    this.fitBoard()
    this.report()
    this.opts.onDirty()
  }

  /** Tipp: zeigt mit goldenem Umriss, wo das zuletzt bewegte Teil hingehört,
   *  sonst das vorderste Teil aus der Leiste (die Leiste rollt dorthin). */
  hint() {
    if (this.done || this.boardOnly) return
    let pieces: number[] = [], fromTray = false
    if (this.lastMoved && this.loose.includes(this.lastMoved)) pieces = this.lastMoved.pieces.slice(0, 60)
    else {
      const list = this.trayList()
      if (list.length) {
        pieces = [list[0]]; fromTray = true
        this.trayScroll = 0; this.trayVel = 0
      } else {
        const g = this.loose.find((x) => this.visible(x))
        if (g) pieces = g.pieces.slice(0, 60)
      }
    }
    if (!pieces.length) return
    this.hintGlow = { pieces, t0: performance.now(), fromTray }
    this.invalidate()
  }

  setEdgesOnly(v: boolean) { this.edgesOnly = v; this.trayScroll = 0; this.trayVel = 0; this.invalidate() }
  setPreview(v: boolean) { this.showPreview = v; this.invalidate() }
  setLocked(v: boolean) { this.locked = v; if (v) this.pan = null }
  setBoardOnly(v: boolean) { this.finishTweens(); this.drag = null; this.boardOnly = v; this.stillDirty = true; this.fitBoard() }

  // ---------- Kamera ----------

  private resize() {
    const r = this.canvas.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return
    const first = this.cw === 1 && this.ch === 1
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    // Mitte beim Drehen des Geräts halten
    const cxw = (this.cw / 2 - this.tx) / this.scale, cyw = (this.ch / 2 - this.ty) / this.scale
    this.cw = r.width; this.ch = r.height
    this.canvas.width = Math.round(r.width * this.dpr)
    this.canvas.height = Math.round(r.height * this.dpr)
    if (!first) { this.tx = this.cw / 2 - cxw * this.scale; this.ty = this.ch / 2 - cyw * this.scale }
    if (this.boardOnly) this.fitBoard()
    this.invalidate()
  }

  private contentBox(afterTween = false) {
    let x0 = 0, y0 = 0, x1 = this.W, y1 = this.H
    const add = (x: number, y: number) => {
      if (x - this.mx < x0) x0 = x - this.mx; if (y - this.my < y0) y0 = y - this.my
      if (x + this.pw + this.mx > x1) x1 = x + this.pw + this.mx; if (y + this.ph + this.my > y1) y1 = y + this.ph + this.my
    }
    const target = new Map<Group, Tween>()
    if (afterTween) for (const t of this.tweens) target.set(t.g, t)
    for (const g of this.loose) {
      if (!this.visible(g)) continue
      const t = target.get(g)
      const dx = t ? t.tx : g.dx, dy = t ? t.ty : g.dy
      for (const i of g.pieces) add(this.homeX(i) + dx, this.homeY(i) + dy)
    }
    return { x0, y0, x1, y1 }
  }

  fitAll(afterTween = false) {
    const b = this.contentBox(afterTween)
    this.fitBox(b.x0, b.y0, b.x1, b.y1)
  }
  fitBoard() { const m = Math.min(this.pw, this.ph) * 0.5; this.fitBox(-m, -m, this.W + m, this.H + m) }
  private fitBox(x0: number, y0: number, x1: number, y1: number) {
    const pad = 12
    const ah = this.ch - this.trayH
    const s = Math.min((this.cw - pad * 2) / (x1 - x0), (ah - pad * 2) / (y1 - y0))
    this.scale = this.clampScale(s)
    this.tx = this.cw / 2 - ((x0 + x1) / 2) * this.scale
    this.ty = ah / 2 - ((y0 + y1) / 2) * this.scale
    this.invalidate()
  }
  private clampScale(s: number) {
    const min = Math.min(this.cw / (this.W * 4.5), this.ch / (this.H * 4.5))
    const max = Math.max(1.5, 260 / Math.min(this.pw, this.ph))
    return Math.max(min, Math.min(max, s))
  }
  zoomBy(f: number, cx = this.cw / 2, cy = (this.ch - this.trayH) / 2) {
    const wx = (cx - this.tx) / this.scale, wy = (cy - this.ty) / this.scale
    this.scale = this.clampScale(this.scale * f)
    this.tx = cx - wx * this.scale
    this.ty = cy - wy * this.scale
    this.invalidate()
  }

  // ---------- Eingabe ----------

  private pos(e: PointerEvent | WheelEvent) {
    const r = this.canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  private pick(wx: number, wy: number): Group | null {
    const slop = Math.min(this.pw, this.ph) * 0.12
    let fallback: Group | null = null
    for (let n = this.loose.length - 1; n >= 0; n--) {
      const g = this.loose[n]
      if (!this.visible(g)) continue
      for (const i of g.pieces) {
        const lx = wx - this.homeX(i) - g.dx, ly = wy - this.homeY(i) - g.dy
        if (lx < -this.mx || ly < -this.my || lx > this.pw + this.mx || ly > this.ph + this.my) continue
        if (this.hit.isPointInPath(this.paths[i], lx, ly)) return g
        if (!fallback && lx > -slop && ly > -slop && lx < this.pw + slop && ly < this.ph + slop) fallback = g
      }
    }
    return fallback
  }

  private onDown = (e: PointerEvent) => {
    e.preventDefault()
    try { this.canvas.setPointerCapture(e.pointerId) } catch { /* egal */ }
    const p = this.pos(e)
    this.pointers.set(e.pointerId, p)
    this.last = p
    this.trayVel = 0
    if (this.pointers.size === 1 && this.trayH && p.y > this.ch - this.trayH) {
      this.trayTouch = { id: e.pointerId, x0: p.x, y0: p.y, scroll0: this.trayScroll, piece: this.trayAt(p.x, p.y), mode: 0, lx: p.x, lt: performance.now() }
      return
    }
    if (this.pointers.size === 1) {
      const wx = (p.x - this.tx) / this.scale, wy = (p.y - this.ty) / this.scale
      const g = this.done ? null : this.pick(wx, wy)
      if (g) {
        this.finishTweens()
        const n = this.loose.indexOf(g)
        this.loose.splice(n, 1); this.loose.push(g)
        this.drag = { g, ox: wx - g.dx, oy: wy - g.dy, id: e.pointerId }
      } else if (!this.locked) {
        this.pan = { id: e.pointerId, x: p.x, y: p.y }
      }
    } else if (this.pointers.size === 2) {
      if (this.drag) { this.drop(this.drag.g); this.drag = null }
      this.pan = null
      this.trayTouch = null
      this.startPinch()
    }
    this.invalidate()
  }

  private startPinch() {
    const [a, b] = [...this.pointers.values()]
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
    this.pinch = { d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)) / this.scale, wx: (mx - this.tx) / this.scale, wy: (my - this.ty) / this.scale }
  }

  private onMove = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return
    e.preventDefault()
    const p = this.pos(e)
    this.pointers.set(e.pointerId, p)
    this.last = p
    const t = this.trayTouch
    if (t && t.id === e.pointerId) {
      const dx = p.x - t.x0, dy = p.y - t.y0
      if (t.mode === 0) {
        if (t.piece >= 0 && dy < -10 && -dy > Math.abs(dx) * 0.7) {
          // Teil aus der Leiste nach oben herausziehen
          const i = t.piece
          this.trayTouch = null
          this.tray.splice(this.tray.indexOf(i), 1)
          const lift = e.pointerType === 'mouse' ? 0 : 34
          const wx = (p.x - this.tx) / this.scale, wy = (p.y - lift - this.ty) / this.scale
          const g = this.newGroup([i], wx - this.pw / 2 - this.homeX(i), wy - this.ph / 2 - this.homeY(i))
          this.drag = { g, ox: (p.x - this.tx) / this.scale - g.dx, oy: (p.y - this.ty) / this.scale - g.dy, id: e.pointerId }
          this.invalidate()
          return
        }
        if (Math.abs(dx) > 8) t.mode = 1
      }
      if (t.mode === 1) {
        const now = performance.now()
        const max = this.trayMax(this.trayList().length)
        this.trayScroll = Math.max(0, Math.min(max, t.scroll0 - dx))
        if (now > t.lt) this.trayVel = 0.7 * this.trayVel + 0.3 * ((t.lx - p.x) / (now - t.lt))
        t.lx = p.x; t.lt = now
        this.invalidate()
      }
      return
    }
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()]
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      this.scale = this.clampScale(Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)) / this.pinch.d)
      this.tx = mx - this.pinch.wx * this.scale
      this.ty = my - this.pinch.wy * this.scale
    } else if (this.drag && this.drag.id === e.pointerId) {
      const wx = (p.x - this.tx) / this.scale, wy = (p.y - this.ty) / this.scale
      this.drag.g.dx = wx - this.drag.ox
      this.drag.g.dy = wy - this.drag.oy
      this.invalidate(true)
      return
    } else if (this.pan && this.pan.id === e.pointerId) {
      this.tx += p.x - this.pan.x; this.ty += p.y - this.pan.y
      this.pan.x = p.x; this.pan.y = p.y
    }
    this.invalidate()
  }

  private onUp = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return
    this.pointers.delete(e.pointerId)
    if (this.trayTouch && this.trayTouch.id === e.pointerId) {
      if (this.trayTouch.mode !== 1 || performance.now() - this.trayTouch.lt > 80) this.trayVel = 0
      this.trayT = performance.now()
      this.trayTouch = null
    }
    if (this.drag && this.drag.id === e.pointerId) { this.drop(this.drag.g); this.drag = null }
    if (this.pan && this.pan.id === e.pointerId) this.pan = null
    if (this.pinch && this.pointers.size < 2) {
      this.pinch = null
      const rest = [...this.pointers.entries()][0]
      if (rest && !this.locked) this.pan = { id: rest[0], x: rest[1].x, y: rest[1].y }
    }
    this.invalidate()
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const p = this.pos(e)
    if (this.trayH && p.y > this.ch - this.trayH) {
      this.trayScroll = Math.max(0, Math.min(this.trayMax(this.trayList().length), this.trayScroll + e.deltaY + e.deltaX))
      this.invalidate()
      return
    }
    this.zoomBy(Math.exp(-e.deltaY * 0.0015), p.x, p.y)
  }

  // ---------- Einrasten ----------

  private snapRadius() {
    const m = Math.min(this.pw, this.ph)
    return Math.min(m * 0.5, Math.max(m * 0.32, 18 / this.scale))
  }

  private neighbors(i: number) {
    const c = i % this.cols, r = (i / this.cols) | 0, out: number[] = []
    if (c > 0) out.push(i - 1)
    if (c < this.cols - 1) out.push(i + 1)
    if (r > 0) out.push(i - this.cols)
    if (r < this.rows - 1) out.push(i + this.cols)
    return out
  }

  private drop(g0: Group) {
    if (g0.pieces.length === 1 && this.trayH && this.last.y > this.ch - this.trayH) {
      // über der Leiste losgelassen: Teil wandert dorthin zurück, an die Stelle unter dem Finger
      const i = g0.pieces[0]
      this.loose.splice(this.loose.indexOf(g0), 1)
      delete (this.groupOf as (Group | undefined)[])[i]
      const at = this.trayAt(this.last.x, this.last.y)
      if (at >= 0) this.tray.splice(this.tray.indexOf(at), 0, i); else this.tray.push(i)
      this.report()
      this.opts.onDirty()
      return
    }
    const R = this.snapRadius()
    let g = g0
    const moved = g0.pieces.slice()
    let snapped = false
    let again = true
    while (again && !g.locked) {
      again = false
      if (Math.hypot(g.dx, g.dy) < R) {
        this.loose.splice(this.loose.indexOf(g), 1)
        for (const i of g.pieces) this.lockPiece(i)
        g = this.lockedGroup
        snapped = true
        break
      }
      outer: for (const i of g.pieces) {
        for (const j of this.neighbors(i)) {
          const h = this.groupOf[j] as Group | undefined
          if (!h || h === g || !this.visible(h)) continue
          if (Math.hypot(g.dx - h.dx, g.dy - h.dy) < R) {
            this.loose.splice(this.loose.indexOf(g), 1)
            if (h.locked) {
              for (const k of g.pieces) this.lockPiece(k)
            } else {
              for (const k of g.pieces) { h.pieces.push(k); this.groupOf[k] = h }
              h.hasEdge = h.hasEdge || g.hasEdge
              const n = this.loose.indexOf(h)
              this.loose.splice(n, 1); this.loose.push(h)
            }
            g = h
            snapped = true
            again = true
            break outer
          }
        }
      }
    }
    this.lastMoved = g.locked ? null : g
    if (snapped) {
      this.glow = { pieces: moved.slice(0, 80), t0: performance.now() }
      this.opts.onSnap()
      this.checkDone()
    }
    this.report()
    this.opts.onDirty()
  }

  private groupCount() { return this.loose.length + this.tray.length + (this.lockedGroup.pieces.length ? 1 : 0) }

  private checkDone() {
    if (this.groupCount() !== 1 || this.tray.length || this.done) return
    if (this.loose.length === 1) {
      // alles hängt zusammen, liegt aber neben dem Brett: aufs Brett schieben
      const g = this.loose[0]
      this.loose = []
      for (const i of g.pieces) this.lockPiece(i)
    }
    this.done = true
    this.showPreview = false
    this.fitBoard()
  }

  private report() {
    const pct = this.total <= 1 ? 100 : Math.round(((this.total - this.groupCount()) / (this.total - 1)) * 100)
    this.opts.onProgress(this.done ? 100 : Math.min(99, pct), this.done)
  }

  get isDone() { return this.done }

  // ---------- Zeichnen ----------

  private finishTweens() {
    for (const t of this.tweens) { t.g.dx = t.tx; t.g.dy = t.ty }
    this.tweens = []
  }

  /** keepStill: nur das gezogene Teil hat sich bewegt, der Rest darf aus dem Zwischenbild kommen. */
  invalidate(keepStill = false) {
    if (!keepStill) this.stillDirty = true
    if (this.raf || this.dead) return
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw() })
  }

  private draw() {
    const now = performance.now()
    let animating = false
    if (this.tweens.length) {
      let all = true
      for (const t of this.tweens) {
        const k = Math.min(1, (now - t.t0) / t.dur)
        const e = 1 - Math.pow(1 - k, 3)
        t.g.dx = t.fx + (t.tx - t.fx) * e
        t.g.dy = t.fy + (t.ty - t.fy) * e
        if (k < 1) all = false
      }
      if (all) this.tweens = []; else animating = true
    }

    // Leiste rollt nach dem Loslassen noch etwas weiter
    if (this.trayVel && !this.trayTouch) {
      const dt = Math.min(40, now - this.trayT); this.trayT = now
      const max = this.trayMax(this.trayList().length)
      this.trayScroll += this.trayVel * dt
      this.trayVel *= Math.pow(0.94, dt / 16)
      if (this.trayScroll <= 0 || this.trayScroll >= max || Math.abs(this.trayVel) < 0.03) this.trayVel = 0
      this.trayScroll = Math.max(0, Math.min(max, this.trayScroll))
      if (this.trayVel) animating = true
    }
    const { ctx, dpr, scale } = this
    const dragG = this.drag?.g
    const trayDraw = (c: CanvasRenderingContext2D) => {
      const H = this.trayH
      if (!H) return
      const top = this.ch - H, ts = this.trayCell, rows = this.trayRows, list = this.trayList()
      this.trayScroll = Math.max(0, Math.min(this.trayMax(list.length), this.trayScroll))
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      // Leiste liegt halbdurchsichtig auf dem Holz statt als weißer Balken
      const kante = c.createLinearGradient(0, top - 10, 0, top); kante.addColorStop(0, 'rgba(40,24,10,0)'); kante.addColorStop(1, 'rgba(40,24,10,0.10)')
      c.fillStyle = kante; c.fillRect(0, top - 10, this.cw, 10)
      c.fillStyle = 'rgba(248,240,228,0.55)'; c.fillRect(0, top, this.cw, H)
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(0, top, this.cw, 1)
      c.imageSmoothingQuality = 'high'
      const k = (ts - 6) / (Math.max(this.pw, this.ph) * 1.45)
      const sw = (this.pw + this.mx * 2) * k, sh = (this.ph + this.my * 2) * k
      const c0 = Math.max(0, Math.floor((this.trayScroll - 8) / ts) - 1), c1 = Math.ceil((this.trayScroll + this.cw) / ts) + 1
      c.save(); c.beginPath(); c.rect(0, top + 1, this.cw, H - 1); c.clip()
      for (let col = c0; col <= c1; col++) for (let row = 0; row < rows; row++) {
        const n = col * rows + row
        if (n >= list.length) break
        const cx = 8 + (col + 0.5) * ts - this.trayScroll, cy = top + 8 + (row + 0.5) * ts
        c.drawImage(this.sprites[list[n]], cx - sw / 2, cy - sh / 2, sw, sh)
      }
      c.restore()
    }
    const world = (c: CanvasRenderingContext2D) => c.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * this.tx, dpr * this.ty)
    // sichtbarer Ausschnitt in Weltkoordinaten
    const vx0 = -this.tx / scale - this.pw - this.mx, vy0 = -this.ty / scale - this.ph - this.my
    const vx1 = (this.cw - this.tx) / scale + this.mx, vy1 = (this.ch - this.ty) / scale + this.my
    // Groß gezoomt werden die Teilbilder hochgerechnet und ihr Umriss wird weich.
    // Dann den Umriss zusätzlich frisch nachziehen, das bleibt bei jeder Größe scharf.
    // Nur wenn wenige Teile im Bild sind, damit es flüssig bleibt.
    const crisp = scale * dpr > 1.25 && ((vx1 - vx0) * (vy1 - vy0)) / (this.pw * this.ph) < 320
    const outline = (c: CanvasRenderingContext2D, i: number, x: number, y: number, w: number, col: string) => {
      c.translate(x, y); c.lineWidth = w; c.strokeStyle = col; c.stroke(this.paths[i]); c.translate(-x, -y)
    }
    const group = (c: CanvasRenderingContext2D, g: Group, lines = crisp) => {
      if (lines) c.lineJoin = 'round'
      for (const i of g.pieces) {
        const x = this.homeX(i) + g.dx, y = this.homeY(i) + g.dy
        if (x < vx0 || y < vy0 || x > vx1 || y > vy1) continue
        c.drawImage(this.sprites[i], x - this.mx, y - this.my)
        if (lines) outline(c, i, x, y, this.lineW * 0.9, 'rgba(30,20,12,0.45)')
      }
    }
    const lockedLines = (c: CanvasRenderingContext2D) => {
      if (!crisp) return
      c.lineJoin = 'round'
      for (const i of this.lockedGroup.pieces) {
        const x = this.homeX(i), y = this.homeY(i)
        if (x < vx0 || y < vy0 || x > vx1 || y > vy1) continue
        outline(c, i, x, y, this.lineW * 0.8, 'rgba(20,12,6,0.32)')
      }
    }
    const scene = (c: CanvasRenderingContext2D, skip?: Group) => {
      c.setTransform(1, 0, 0, 1, 0, 0)
      c.clearRect(0, 0, this.canvas.width, this.canvas.height)
      world(c)
      // beim Bewegen schnell, im Stand schön
      c.imageSmoothingQuality = this.pointers.size || animating ? 'low' : 'high'
      const bw = 5 / scale
      c.fillStyle = 'rgba(46,28,12,0.22)'
      c.fillRect(-bw, -bw, this.W + bw * 2, this.H + bw * 2)
      c.fillStyle = '#F3EADC'
      c.fillRect(0, 0, this.W, this.H)
      if (this.showPreview) { c.globalAlpha = 0.32; c.drawImage(this.img, 0, 0); c.globalAlpha = 1 }
      c.drawImage(this.lockedLayer, 0, 0)
      lockedLines(c)
      for (const g of this.loose) if (g !== skip && this.visible(g)) group(c, g)
    }

    if (dragG && !animating) {
      // Nur das gezogene Teil neu zeichnen, alles andere kommt aus einem Zwischenbild.
      if (this.stillDirty || this.still.width !== this.canvas.width || this.still.height !== this.canvas.height) {
        this.still.width = this.canvas.width; this.still.height = this.canvas.height
        scene(this.stillCtx, dragG)
        trayDraw(this.stillCtx)
        this.stillDirty = false
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
      ctx.drawImage(this.still, 0, 0)
      world(ctx)
      ctx.imageSmoothingQuality = 'low'
      if (dragG.pieces.length <= 40) { ctx.shadowColor = 'rgba(40,25,10,0.4)'; ctx.shadowBlur = 16 * dpr; ctx.shadowOffsetY = 8 * dpr }
      group(ctx, dragG, false)
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
      if (crisp) {
        ctx.lineJoin = 'round'
        for (const i of dragG.pieces) outline(ctx, i, this.homeX(i) + dragG.dx, this.homeY(i) + dragG.dy, this.lineW * 0.9, 'rgba(30,20,12,0.45)')
      }
    } else {
      scene(ctx)
      trayDraw(ctx)
      world(ctx)
    }

    // sanftes Leuchten nach dem Einrasten
    if (this.glow) {
      const k = (now - this.glow.t0) / 650
      if (k >= 1) this.glow = null
      else {
        animating = true
        ctx.lineJoin = 'round'
        ctx.strokeStyle = `rgba(255,214,102,${(1 - k) * 0.95})`
        ctx.lineWidth = (5 + 6 * k) / scale
        ctx.shadowColor = 'rgba(255,200,60,0.9)'
        ctx.shadowBlur = 16 * dpr
        for (const i of this.glow.pieces) {
          const g = this.groupOf[i]
          ctx.save()
          ctx.translate(this.homeX(i) + g.dx, this.homeY(i) + g.dy)
          ctx.stroke(this.paths[i])
          ctx.restore()
        }
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0
      }
    }
    // Tipp: goldener, pulsierender Umriss am Zielplatz auf dem Brett
    if (this.hintGlow) {
      const k = (now - this.hintGlow.t0) / 2800
      if (k >= 1) this.hintGlow = null
      else {
        animating = true
        const a = (0.55 + 0.45 * Math.sin(k * Math.PI * 7)) * Math.min(1, (1 - k) * 4)
        ctx.lineJoin = 'round'
        ctx.fillStyle = `rgba(255,210,90,${0.28 * a})`
        ctx.strokeStyle = `rgba(214,150,20,${0.95 * a})`
        ctx.lineWidth = 5 / scale
        for (const i of this.hintGlow.pieces) {
          ctx.save()
          ctx.translate(this.homeX(i), this.homeY(i))
          ctx.fill(this.paths[i]); ctx.stroke(this.paths[i])
          ctx.restore()
        }
        // das gemeinte Teil in der Leiste golden einrahmen (vorne links)
        if (this.hintGlow.fromTray && this.trayH) {
          const ts = this.trayCell, top = this.ch - this.trayH
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          ctx.strokeStyle = `rgba(214,150,20,${0.95 * a})`; ctx.lineWidth = 4
          ctx.beginPath(); ctx.roundRect(8 + 3 - this.trayScroll, top + 8 + 3, ts - 6, ts - 6, 8); ctx.stroke()
        }
      }
    }
    if (animating) this.invalidate()
  }
}

function u(r: () => number) { return (r() * 2 - 1) * JIT }

/**
 * Zeichnet eine Kante mit Nase. horizontal: läuft entlang x (Länge len), Nase zeigt entlang y (Maß depth).
 * reverse: von Ende zu Anfang (für untere und linke Seite, damit der Umriss im Uhrzeigersinn bleibt).
 */
export function edgeTo(p: Path2D, e: Edge, x0: number, y0: number, len: number, depth: number, horizontal: boolean, reverse: boolean) {
  const t = TAB
  const pts: [number, number][] = [
    [0, 0], [0.2, e.a], [0.5 + e.b + e.d, -t + e.c], [0.5 - t + e.b, t + e.c],
    [0.5 - 2 * t + e.b - e.d, 3 * t + e.c], [0.5 + 2 * t + e.b - e.d, 3 * t + e.c], [0.5 + t + e.b, t + e.c],
    [0.5 + e.b + e.d, -t + e.c], [0.8, e.e], [1, 0],
  ]
  const P = (n: number): [number, number] => {
    const l = pts[n][0] * len, w = pts[n][1] * depth * e.flip
    return horizontal ? [x0 + l, y0 + w] : [x0 + w, y0 + l]
  }
  const seq = reverse ? [8, 7, 6, 5, 4, 3, 2, 1, 0] : [1, 2, 3, 4, 5, 6, 7, 8, 9]
  for (let n = 0; n < 9; n += 3) {
    const a = P(seq[n]), b = P(seq[n + 1]), c = P(seq[n + 2])
    p.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1])
  }
}

/** Zufällige Kante mit Nase, für 2D und für die 3D-Puzzles. */
export function makeEdge(r: () => number): Edge {
  return { flip: r() < 0.5 ? 1 : -1, a: u(r), b: u(r), c: u(r), d: u(r), e: u(r) }
}
