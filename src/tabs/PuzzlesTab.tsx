import { useEffect, useRef, useState } from 'react'
import { CATEGORIES, GALLERY, galleryThumb } from '../gallery'
import { type Album, type Photo, addCanvasPhoto, addPhotos, all, deleteAlbum, deletePhoto, keepStorage, put, uid } from '../db'
import { DOP, SAT_CREDIT, SatelliteModal } from './SatelliteModal'
import { Confirm, Icon, Loading, Logo, Modal } from '../ui/common'

export function PuzzlesTab({ onPick }: { onPick: (imageId: string) => void }) {
  const [credits, setCredits] = useState(false)
  const [sat, setSat] = useState(false)
  const [albums, setAlbums] = useState<Album[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [edit, setEdit] = useState<string | null>(null)
  const [ask, setAsk] = useState<{ title: string; text: string; run: () => Promise<void> } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const reload = async () => {
    const [a, p] = await Promise.all([all<Album>('albums'), all<Photo>('photos')])
    setAlbums(a.sort((x, y) => y.createdAt - x.createdAt))
    setPhotos(p.sort((x, y) => x.createdAt - y.createdAt))
  }
  useEffect(() => { void reload() }, [])

  const upload = async (files: FileList | null) => {
    if (!files || !files.length) return
    const list = Array.from(files)
    setBusy(list.length === 1 ? 'Dein Foto wird gespeichert' : `${list.length} Fotos werden gespeichert`)
    setNote('')
    try {
      keepStorage()
      let albumId = 'einzeln'
      if (list.length > 1) {
        albumId = uid()
        const day = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        const same = albums.filter((a) => a.name.startsWith(`Album vom ${day}`)).length
        await put('albums', { id: albumId, name: `Album vom ${day}${same ? ` (${same + 1})` : ''}`, createdAt: Date.now() } satisfies Album)
      } else if (!albums.some((a) => a.id === 'einzeln')) {
        await put('albums', { id: 'einzeln', name: 'Einzelne Fotos', createdAt: Date.now() } satisfies Album)
      }
      const failed = await addPhotos(list, albumId)
      if (failed) setNote(failed === list.length ? 'Die Datei konnte nicht gelesen werden. Bitte ein Foto auswählen.' : `${failed} Dateien konnten nicht gelesen werden. Die anderen Fotos sind gespeichert.`)
      await reload()
    } catch {
      setNote('Das Speichern hat nicht geklappt. Vielleicht ist der Speicher des Geräts voll.')
    }
    setBusy('')
    if (input.current) input.current.value = ''
  }

  const saveSat = async (cv: HTMLCanvasElement, name: string) => {
    keepStorage()
    if (!albums.some((a) => a.id === 'satellit')) await put('albums', { id: 'satellit', name: 'Satellitenbilder', createdAt: Date.now() } satisfies Album)
    const id = await addCanvasPhoto(cv, name, 'satellit')
    await reload()
    setSat(false)
    onPick(id)
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-5">
      <header className="mb-5 flex items-center gap-3">
        <Logo size={52} />
        <div>
          <h1 className="h1">Puzzlestube</h1>
          <div className="text-[18px] text-ink2">von screame</div>
        </div>
      </header>

      <button className="btn btn-primary mb-2 w-full !min-h-[68px] !text-[22px] sm:w-auto sm:!px-8" onClick={() => input.current?.click()}>
        <Icon name="plus" size={30} /><span>Eigene Fotos hochladen</span>
      </button>
      <button className="btn mb-2 ml-0 w-full !min-h-[68px] !text-[22px] sm:ml-3 sm:w-auto sm:!px-8" onClick={() => setSat(true)}>
        <Icon name="globe" size={30} /><span>Satellitenbild von oben</span>
      </button>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />
      <p className="mb-6 text-[18px] text-ink2">Ein Foto oder gleich mehrere auswählen. Mehrere Fotos kommen zusammen in ein Album. Alles bleibt nur auf diesem Gerät.</p>
      {note && <p className="card mb-6 border-danger p-4 text-[20px] text-danger" role="alert">{note}</p>}

      {albums.map((a) => {
        const ps = photos.filter((p) => p.albumId === a.id)
        if (!ps.length) return null
        const editing = edit === a.id
        return (
          <section key={a.id} className="mb-8">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="h2 flex flex-1 items-center gap-2"><Icon name={a.id === 'satellit' ? 'globe' : 'photos'} />{a.name}</h2>
              <button className={`btn !min-h-[52px] !px-4 ${editing ? 'btn-primary' : ''}`} onClick={() => setEdit(editing ? null : a.id)}>
                {editing ? <><Icon name="check" /><span>Fertig</span></> : <><Icon name="trash" /><span>Löschen</span></>}
              </button>
            </div>
            {editing && <p className="mb-3 text-[19px] text-ink2">Tippe bei einem Bild auf „Löschen“. Fertig drücken, wenn du nichts mehr löschen willst.</p>}
            <Grid>
              {ps.map((p) => editing ? (
                <div key={p.id} className="card overflow-hidden p-0">
                  <div className="aspect-[4/3] w-full bg-wood-dark"><img src={p.thumb} alt="" className="h-full w-full object-cover opacity-80" draggable={false} /></div>
                  <div className="truncate px-3 pt-2 text-[20px] font-semibold">{p.name || 'Eigenes Foto'}</div>
                  <button className="m-2 flex min-h-[52px] w-[calc(100%-16px)] items-center justify-center gap-2 rounded-lg border-2 border-danger text-[19px] font-semibold text-danger"
                    onClick={() => setAsk({ title: 'Bild löschen?', text: `„${p.name || 'Eigenes Foto'}“ und alle Spielstände dazu werden von diesem Gerät gelöscht.`, run: () => deletePhoto(p.id) })}>
                    <Icon name="trash" size={22} />Löschen
                  </button>
                </div>
              ) : <Tile key={p.id} src={p.thumb} title={p.name || 'Eigenes Foto'} onClick={() => onPick(p.id)} />)}
            </Grid>
            {editing && ps.length > 1 && (
              <button className="btn btn-danger mt-3 w-full sm:w-auto"
                onClick={() => setAsk({ title: `Alle ${ps.length} Bilder löschen?`, text: `„${a.name}“ mit allen Bildern und Spielständen wird von diesem Gerät gelöscht.`, run: async () => { await deleteAlbum(a.id); setEdit(null) } })}>
                <Icon name="trash" />Alle {ps.length} löschen
              </button>
            )}
          </section>
        )
      })}

      <nav className="card mb-8 p-4" aria-label="Themen">
        <div className="mb-3 text-[20px] font-semibold">Fertige Bilder nach Thema</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {CATEGORIES.map((cat) => (
            <button key={cat} className="btn !min-h-[56px] !justify-between !px-4 text-left" onClick={() => document.getElementById(`thema-${cat}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              <span>{cat}</span><span className="text-[18px] font-normal text-ink2">{GALLERY.filter((g) => g.category === cat).length}</span>
            </button>
          ))}
        </div>
      </nav>

      {CATEGORIES.map((cat) => (
        <section key={cat} id={`thema-${cat}`} className="mb-8 scroll-mt-4">
          <h2 className="h2 mb-3">{cat}</h2>
          <Grid>
            {GALLERY.filter((g) => g.category === cat).map((g) => <Tile key={g.id} src={galleryThumb(g)} title={g.title} onClick={() => onPick(g.id)} />)}
          </Grid>
        </section>
      ))}
      <button className="btn" onClick={() => setCredits(true)}>Bildnachweis</button>
      {credits && (
        <Modal title="Bildnachweis" onClose={() => setCredits(false)}>
          <p className="mb-3 text-[19px]">Alle mitgelieferten Fotos stammen aus Wikimedia Commons und sind gemeinfrei (Public Domain oder CC0). Danke an die Fotografinnen und Fotografen.</p>
          <ul className="flex flex-col gap-2 text-[18px]">
            {GALLERY.map((g) => <li key={g.id}><b>{g.title}:</b> {g.author}, {g.license === 'CC0' ? 'CC0' : 'gemeinfrei'}</li>)}
          </ul>
          <p className="mt-4 text-[18px]"><b>Satellitenbilder:</b> {SAT_CREDIT}. Nur für private, nicht kommerzielle Nutzung.</p>
          <p className="mt-2 text-[18px]"><b>Luftbilder der Länder:</b> {Object.entries(DOP).map(([land, s]) => `${land}: ${s.credit}`).join('; ')}.</p>
        </Modal>
      )}
      {ask && (
        <Confirm title={ask.title} text={ask.text} yes="Ja, löschen" onNo={() => setAsk(null)}
          onYes={async () => { const x = ask; setAsk(null); await x.run(); await reload() }} />
      )}
      {sat && <SatelliteModal onClose={() => setSat(false)} onSave={saveSat} />}
      {busy && <div className="fixed inset-0 z-50"><Loading text={busy} /></div>}
    </div>
  )
}

export function Grid({ children }: { children: React.ReactNode }) {
  return <div className="reihe grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{children}</div>
}

export function Tile({ src, title, sub, onClick, badge }: { src?: string; title: string; sub?: string; onClick: () => void; badge?: React.ReactNode }) {
  return (
    <button className="kachel card relative overflow-hidden p-0 text-left" onClick={onClick}>
      <div className="aspect-[4/3] w-full bg-wood-dark">
        {src && <img src={src} alt="" className="bild h-full w-full object-cover" draggable={false} loading="lazy" onLoad={(e) => e.currentTarget.classList.add('da')} ref={(el) => { if (el?.complete && el.naturalWidth) el.classList.add('da') }} />}
      </div>
      {badge}
      <div className="px-3 py-2.5">
        <div className="text-[20px] font-semibold leading-tight">{title}</div>
        {sub && <div className="text-[18px] text-ink2">{sub}</div>}
      </div>
    </button>
  )
}
