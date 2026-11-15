// Alles bleibt auf dem Gerät: Fotos, Alben und Spielstände liegen in IndexedDB.
import type { SavedState } from './puzzle/engine'
import { GALLERY, galleryThumb, loadGallery } from './gallery'

export interface Album { id: string; name: string; createdAt: number }
export interface Photo { id: string; albumId: string; name: string; blob: Blob; thumb: string; createdAt: number }
export interface Game {
  id: string; imageId: string; title: string; thumb: string
  cols: number; rows: number; seed: number; state: SavedState | null
  percent: number; done: boolean; updatedAt: number
}
export interface Game3D { id: string; model: string; count: number; placed: number[]; done: boolean; updatedAt: number }

let dbp: Promise<IDBDatabase> | null = null
function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const rq = indexedDB.open('puzzlestube', 1)
      rq.onupgradeneeded = () => {
        const d = rq.result
        for (const s of ['albums', 'photos', 'games', 'games3d']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' })
      }
      rq.onsuccess = () => res(rq.result)
      rq.onerror = () => rej(rq.error)
    })
  }
  return dbp
}
function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((d) => new Promise<T>((res, rej) => {
    const t = d.transaction(store, mode)
    const rq = fn(t.objectStore(store))
    t.oncomplete = () => res(rq.result)
    t.onerror = () => rej(t.error)
    t.onabort = () => rej(t.error)
  }))
}
export const all = <T>(store: string) => tx<T[]>(store, 'readonly', (s) => s.getAll())
export const get = <T>(store: string, id: string) => tx<T | undefined>(store, 'readonly', (s) => s.get(id))
export const put = (store: string, v: unknown) => tx(store, 'readwrite', (s) => s.put(v))
export const del = (store: string, id: string) => tx(store, 'readwrite', (s) => s.delete(id))

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
export const gameId = (imageId: string, cols: number, rows: number) => `${imageId}|${cols}x${rows}`

async function decode(file: Blob): Promise<HTMLCanvasElement> {
  let src: ImageBitmap | HTMLImageElement
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    src = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image()
      const url = URL.createObjectURL(file)
      im.onload = () => { URL.revokeObjectURL(url); res(im) }
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Bild nicht lesbar')) }
      im.src = url
    })
  }
  const max = 2000
  const k = Math.min(1, max / Math.max(src.width, src.height))
  const cv = document.createElement('canvas')
  cv.width = Math.max(1, Math.round(src.width * k))
  cv.height = Math.max(1, Math.round(src.height * k))
  const c = cv.getContext('2d')!
  c.imageSmoothingQuality = 'high'
  c.drawImage(src, 0, 0, cv.width, cv.height)
  return cv
}
function shrink(cv: HTMLCanvasElement, width: number) {
  const t = document.createElement('canvas')
  t.width = width
  t.height = Math.max(1, Math.round((cv.height / cv.width) * width))
  const c = t.getContext('2d')!
  c.imageSmoothingQuality = 'high'
  c.drawImage(cv, 0, 0, t.width, t.height)
  return t
}

/** Speichert hochgeladene Fotos verkleinert als JPEG. Gibt die Zahl der Fehlschläge zurück. */
export async function addPhotos(files: File[], albumId: string): Promise<number> {
  let failed = 0
  for (const f of files) {
    try {
      const cv = await decode(f)
      const blob = await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('leer'))), 'image/jpeg', 0.9))
      const photo: Photo = { id: 'u:' + uid(), albumId, name: f.name.replace(/\.[^.]+$/, ''), blob, thumb: shrink(cv, 480).toDataURL('image/jpeg', 0.8), createdAt: Date.now() }
      await put('photos', photo)
    } catch { failed++ }
  }
  return failed
}

/** Speichert ein fertiges Bild (z. B. Satellitenbild) als eigenes Foto und gibt die ID zurück. */
export async function addCanvasPhoto(cv: HTMLCanvasElement, name: string, albumId: string): Promise<string> {
  const blob = await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('leer'))), 'image/jpeg', 0.9))
  const photo: Photo = { id: 'u:' + uid(), albumId, name, blob, thumb: shrink(cv, 480).toDataURL('image/jpeg', 0.8), createdAt: Date.now() }
  await put('photos', photo)
  return photo.id
}

/** Liefert das volle Bild zu einer Bild-ID (Galerie oder eigenes Foto). */
export async function loadImage(imageId: string): Promise<HTMLCanvasElement> {
  const g = GALLERY.find((x) => x.id === imageId)
  if (g) return loadGallery(g)
  const p = await get<Photo>('photos', imageId)
  if (!p) throw new Error('Das Foto wurde nicht gefunden.')
  return decode(p.blob)
}
export async function imageInfo(imageId: string): Promise<{ title: string; thumb: string } | null> {
  const g = GALLERY.find((x) => x.id === imageId)
  if (g) return { title: g.title, thumb: galleryThumb(g) }
  const p = await get<Photo>('photos', imageId)
  return p ? { title: p.name || 'Eigenes Foto', thumb: p.thumb } : null
}

export async function deletePhoto(id: string) {
  await del('photos', id)
  for (const g of await all<Game>('games')) if (g.imageId === id) await del('games', g.id)
}
export async function deleteAlbum(id: string) {
  for (const p of await all<Photo>('photos')) if (p.albumId === id) await deletePhoto(p.id)
  await del('albums', id)
}

/** Bittet den Browser, die Daten nicht von sich aus zu löschen. */
export function keepStorage() {
  try { void navigator.storage?.persist?.() } catch { /* nicht überall vorhanden */ }
}

/** Räumt Spielstände weg, deren Galeriebild es nicht mehr gibt (z. B. die früheren gezeichneten Motive). */
export async function cleanOldGames() {
  for (const g of await all<Game>('games')) if (g.imageId.startsWith('g:') && !GALLERY.some((x) => x.id === g.imageId)) await del('games', g.id)
}
