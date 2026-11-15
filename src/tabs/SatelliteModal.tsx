// Satellitenbild als Puzzle: Ort suchen, Ausschnitt verschieben, als Foto speichern.
// Grund: EOxCloudless (Sentinel-2, CC BY-NC-SA 4.0, nur nicht kommerziell), weltweit, rund 10 m pro Bildpunkt.
// Darüber in Deutschland: amtliche Luftbilder der Bundesländer (20 bis 40 cm pro Bildpunkt, frei nutzbar).
// Ortssuche: Nominatim von OpenStreetMap (höchstens eine Anfrage pro Sekunde, nur auf Knopfdruck).
import { useEffect, useRef, useState } from 'react'
import { Icon, Modal } from '../ui/common'

const LAYER = 's2cloudless-2025_3857'
const YEAR = '2025'
const eoxUrl = (z: number, x: number, y: number) => `https://tiles.maps.eox.at/wmts/1.0.0/${LAYER}/default/g/${z}/${y}/${x}.jpg`
export const SAT_CREDIT = `EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data ${YEAR}), CC BY-NC-SA 4.0`
const MIN_Z = 3
const EOX_Z = 14 // feiner hat Sentinel-2 keine Details mehr
const DOP_FROM = 15 // ab hier kommen die Luftbilder vom Land, falls es sie gibt
const T = 256

// Nur Länder, deren Server die Bilder direkt an die App herausgeben (CORS). Schleswig-Holstein,
// Sachsen-Anhalt, Hamburg, Bremen und das Saarland fehlen deshalb, dort bleibt es beim Satellitenbild.
interface Source { url: string; layer: string; credit: string; maxZ: number }
export const DOP: Record<string, Source> = {
  'Nordrhein-Westfalen': { url: 'https://www.wms.nrw.de/geobasis/wms_nw_dop', layer: 'nw_dop_rgb', credit: 'Land NRW, dl-de/zero-2.0', maxZ: 19 },
  'Bayern': { url: 'https://geoservices.bayern.de/od/wms/dop/v1/dop40', layer: 'by_dop40c', credit: 'Bayerische Vermessungsverwaltung, CC BY 4.0', maxZ: 18 },
  'Berlin': { url: 'https://gdi.berlin.de/services/wms/truedop_2024', layer: 'truedop_2024', credit: 'Geoportal Berlin, TrueOrthophotos 2024, dl-de/zero-2.0', maxZ: 19 },
  'Brandenburg': { url: 'https://isk.geobasis-bb.de/mapproxy/dop20c/service/wms', layer: 'bebb_dop20c', credit: 'GeoBasis-DE/LGB, dl-de/by-2.0', maxZ: 19 },
  'Sachsen': { url: 'https://geodienste.sachsen.de/wms_geosn_dop-rgb/guest', layer: 'sn_dop_020', credit: 'GeoSN, dl-de/by-2.0', maxZ: 19 },
  'Thüringen': { url: 'https://www.geoproxy.geoportal-th.de/geoproxy/services/DOP', layer: 'th_dop', credit: 'GDI-Th, dl-de/by-2.0', maxZ: 19 },
  'Baden-Württemberg': { url: 'https://owsproxy.lgl-bw.de/owsproxy/ows/WMS_LGL-BW_ATKIS_DOP_20_C', layer: 'IMAGES_DOP_20_RGB', credit: 'LGL, www.lgl-bw.de, dl-de/by-2.0', maxZ: 19 },
  'Niedersachsen': { url: 'https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms', layer: 'ni_dop20', credit: 'LGLN, CC BY 4.0', maxZ: 19 },
  'Hessen': { url: 'https://www.gds-srv.hessen.de/cgi-bin/lika-services/ogc-free-images.ows', layer: 'he_dop20_rgb', credit: 'HVBG, dl-de/zero-2.0', maxZ: 19 },
  'Mecklenburg-Vorpommern': { url: 'https://www.geodaten-mv.de/dienste/adv_dop', layer: 'mv_dop', credit: 'GeoBasis-DE/M-V', maxZ: 19 },
  'Rheinland-Pfalz': { url: 'https://geo4.service24.rlp.de/wms/rp_dop20.fcgi', layer: 'rp_dop20', credit: 'GeoBasis-DE/LVermGeoRP, dl-de/by-2.0', maxZ: 19 },
}

const R = 20037508.342789244
function dopUrl(src: Source, z: number, x: number, y: number) {
  const size = (2 * R) / 2 ** z
  const minx = -R + x * size, maxy = R - y * size
  return `${src.url}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${src.layer}&STYLES=&CRS=EPSG:3857&BBOX=${minx},${maxy - size},${minx + size},${maxy}&WIDTH=${T}&HEIGHT=${T}&FORMAT=image/png&TRANSPARENT=TRUE`
}

const world = (z: number) => T * 2 ** z
function project(lat: number, lon: number, z: number) {
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180)
  return { x: ((lon + 180) / 360) * world(z), y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world(z) }
}

interface Hit { name: string; lat: number; lon: number; z: number; src?: Source }

function zoomFor(bbox: string[] | undefined, maxZ: number): number {
  if (!bbox) return 11
  const span = Math.max(Math.abs(+bbox[1] - +bbox[0]), Math.abs(+bbox[3] - +bbox[2]))
  if (!span) return Math.min(maxZ, 17)
  return Math.max(MIN_Z, Math.min(maxZ, Math.round(Math.log2(360 / span)) + 1))
}

interface Tile { key: string; src: string; left: number; top: number; size: number }
/** Kacheln einer Ebene (Zoom lz), die einen Ausschnitt w × h um (cx, cy) bei Zoom z bedecken. */
function cover(cx: number, cy: number, z: number, w: number, h: number, lz: number, tag: string, url: (z: number, x: number, y: number) => string): Tile[] {
  const size = T * 2 ** (z - lz), n = 2 ** lz
  const left0 = cx - w / 2, top0 = cy - h / 2
  const out: Tile[] = []
  for (let ty = Math.max(0, Math.floor(top0 / size)); ty <= Math.min(n - 1, Math.floor((top0 + h) / size)); ty++)
    for (let tx = Math.floor(left0 / size); tx <= Math.floor((left0 + w) / size); tx++)
      out.push({ key: `${tag}/${lz}/${tx}/${ty}`, src: url(lz, ((tx % n) + n) % n, ty), left: tx * size - left0, top: ty * size - top0, size })
  return out
}
/** Was bei Zoom z zu sehen ist: Satellit als Grund, darüber das Luftbild des Landes. */
function layers(cx: number, cy: number, z: number, w: number, h: number, src?: Source): Tile[] {
  const base = cover(cx, cy, z, w, h, Math.min(z, EOX_Z), 'eox', eoxUrl)
  if (!src || z < DOP_FROM) return base
  return [...base, ...cover(cx, cy, z, w, h, Math.min(z, src.maxZ), 'dop', (a, b, c) => dopUrl(src, a, b, c))]
}

function loadTile(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => res(im)
    im.onerror = () => rej(new Error('Kachel fehlt'))
    im.src = url
  })
}

/** Rendert den Ausschnitt um (cx, cy) bei Zoom z in ein Bild mit 1600 × 1200 Punkten. */
async function render(cx: number, cy: number, z: number, viewW: number, src?: Source): Promise<HTMLCanvasElement> {
  const W = 1600, H = 1200
  // eine Stufe feiner holen, damit das Puzzle scharf wird
  const ez = Math.min(src ? src.maxZ : EOX_Z, z + 1)
  const f = 2 ** (ez - z)
  const scale = W / (viewW * f)
  const tiles = layers(cx * f, cy * f, ez, W / scale, H / scale, src)
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const c = cv.getContext('2d')!
  c.fillStyle = '#1d2a33'; c.fillRect(0, 0, W, H)
  c.imageSmoothingQuality = 'high'
  const imgs = await Promise.allSettled(tiles.map((t) => loadTile(t.src)))
  if (imgs.every((x) => x.status === 'rejected')) throw new Error('Keine Verbindung')
  // Reihenfolge bleibt: erst Satellit, dann Luftbild darüber
  imgs.forEach((r, i) => {
    if (r.status !== 'fulfilled') return
    const t = tiles[i]
    c.drawImage(r.value, t.left * scale, t.top * scale, t.size * scale + 0.5, t.size * scale + 0.5)
  })
  return cv
}

export function SatelliteModal({ onClose, onSave }: { onClose: () => void; onSave: (cv: HTMLCanvasElement, name: string) => Promise<void> }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [place, setPlace] = useState<Hit | null>(null)
  const [z, setZ] = useState(EOX_Z)
  const [c, setC] = useState({ x: 0, y: 0 }) // Mitte in Weltpunkten bei Zoom z
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(600)
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)
  const last = useRef(0)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [place])

  const search = async () => {
    const text = q.trim()
    if (!text) return
    const wait = 1100 - (Date.now() - last.current)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    last.current = Date.now()
    setBusy('Suche läuft'); setErr('')
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&accept-language=de&q=${encodeURIComponent(text)}`)
      if (!r.ok) throw new Error()
      const data = (await r.json()) as { display_name: string; lat: string; lon: string; boundingbox?: string[]; address?: { state?: string; city?: string; country_code?: string } }[]
      setHits(data.map((d) => {
        const a = d.address
        const src = a?.country_code === 'de' ? DOP[a.state || a.city || ''] : undefined
        return { name: d.display_name, lat: +d.lat, lon: +d.lon, z: zoomFor(d.boundingbox, src ? src.maxZ : EOX_Z), src }
      }))
    } catch {
      setErr('Die Suche hat nicht geklappt. Bitte die Internetverbindung prüfen.')
    }
    setBusy('')
  }

  const choose = (h: Hit) => {
    setPlace(h); setZ(h.z); setC(project(h.lat, h.lon, h.z)); setHits(null)
  }

  const maxZ = place?.src ? place.src.maxZ : EOX_Z
  const zoom = (d: number) => {
    const nz = Math.max(MIN_Z, Math.min(maxZ, z + d))
    if (nz === z) return
    const f = 2 ** (nz - z)
    setC((p) => ({ x: p.x * f, y: p.y * f })); setZ(nz)
  }

  const save = async () => {
    if (!place) return
    setBusy('Bild wird geladen'); setErr('')
    try {
      const cv = await render(c.x, c.y, z, w, place.src)
      await onSave(cv, place.name.split(',')[0])
    } catch {
      setErr('Das Bild konnte nicht geladen werden. Bitte die Internetverbindung prüfen.')
      setBusy('')
    }
  }

  const h = Math.round((w * 3) / 4)
  const tiles = place ? layers(c.x, c.y, z, w, h, place.src) : []
  const sharp = !!place?.src && z >= DOP_FROM

  return (
    <Modal title="Satellitenbild puzzeln" onClose={onClose} wide>
      <form className="mb-4 flex gap-3" onSubmit={(e) => { e.preventDefault(); void search() }}>
        <input className="card min-h-[56px] min-w-0 flex-1 px-4 text-[20px]" placeholder="Ort, Straße oder Region" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ort suchen" />
        <button className="btn btn-primary" type="submit" disabled={!!busy}>Suchen</button>
      </form>
      {err && <p className="mb-4 text-[19px] text-danger" role="alert">{err}</p>}
      {hits && (
        <ul className="mb-4 flex flex-col gap-2">
          {!hits.length && <li className="text-[19px] text-ink2">Nichts gefunden. Vielleicht anders schreiben?</li>}
          {hits.map((x, i) => (
            <li key={i}><button className="btn w-full !justify-start text-left" onClick={() => choose(x)}>{x.name}</button></li>
          ))}
        </ul>
      )}
      {place && (
        <>
          <div
            ref={box}
            className="relative mb-3 w-full touch-none select-none overflow-hidden rounded-xl bg-[#1d2a33]"
            style={{ height: h, cursor: 'grab' }}
            onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY } }}
            onPointerMove={(e) => {
              const d = drag.current
              if (!d || d.id !== e.pointerId) return
              const dx = e.clientX - d.x, dy = e.clientY - d.y
              d.x = e.clientX; d.y = e.clientY
              setC((p) => ({ x: p.x - dx, y: Math.max(h / 2, Math.min(world(z) - h / 2, p.y - dy)) }))
            }}
            onPointerUp={() => { drag.current = null }}
            onPointerCancel={() => { drag.current = null }}
            onWheel={(e) => zoom(e.deltaY < 0 ? 1 : -1)}
          >
            {tiles.map((t) => <img key={t.key} src={t.src} alt="" draggable={false} className="absolute max-w-none" style={{ left: t.left, top: t.top, width: t.size, height: t.size }} />)}
          </div>
          <div className="mb-3 flex flex-wrap gap-3">
            <button className="btn" onClick={() => zoom(-1)} disabled={z <= MIN_Z}><Icon name="zoomout" /><span>Weiter weg</span></button>
            <button className="btn" onClick={() => zoom(1)} disabled={z >= maxZ}><Icon name="zoomin" /><span>Näher ran</span></button>
            <button className="btn btn-primary flex-1" onClick={() => void save()} disabled={!!busy}><Icon name="check" /><span>Diesen Ausschnitt puzzeln</span></button>
          </div>
          <p className="mb-1 text-[17px] text-ink2">
            Mit dem Finger verschieben.{' '}
            {place.src
              ? 'Hier gibt es scharfe Luftbilder vom Land: näher ran zoomen, dann sieht man einzelne Häuser.'
              : `${z >= maxZ ? 'Näher geht es nicht. ' : ''}Hier gibt es nur Satellitenfotos: Felder, Wälder, Seen und Städte, aber keine einzelnen Häuser.`}
          </p>
        </>
      )}
      <p className="text-[15px] text-ink2">Bilder: {SAT_CREDIT}.{sharp ? ` Luftbild: ${place!.src!.credit}.` : ''} Ortssuche: © OpenStreetMap-Mitwirkende.</p>
      {busy && <p className="mt-3 text-[19px]" role="status">{busy} …</p>}
    </Modal>
  )
}
