import { useEffect, useRef, useState } from 'react'
import { CATEGORIES, GALLERY, galleryThumb } from '../gallery'
import { type Album, type Game, type Photo, addCanvasPhoto, addPhotos, all, deleteAlbum, deletePhoto, keepStorage, put, uid } from '../db'
import { DOP, SAT_CREDIT, SatelliteModal } from './SatelliteModal'
import { Bar, Confirm, Icon, Loading, Logo, Modal } from '../ui/common'

export function PuzzlesTab({ onPick, onResume }: { onPick: (imageId: string) => void; onResume: (g: Game) => void }) {
  const [credits, setCredits] = useState(false)
  const [sat, setSat] = useState(false)
  const [albums, setAlbums] = useState<Album[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [edit, setEdit] = useState<string | null>(null)
  const [ask, setAsk] = useState<{ title: string; text: string; run: () => Promise<void> } | null>(null)
  const [last, setLast] = useState<Game | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const reload = async () => {
    const [a, p] = await Promise.all([all<Album>('albums'), all<Photo>('photos')])
    setAlbums(a.sort((x, y) => y.createdAt - x.createdAt))
    setPhotos(p.sort((x, y) => x.createdAt - y.createdAt))
  }
  useEffect(() => {
    void reload()
    // zuletzt angefangenes Puzzle für die Karte "Weiterpuzzeln"
    void all<Game>('games').then((gs) => setLast(gs.filter((g) => !g.done && g.state && g.percent < 100).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null))
  }, [])

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

  // Bild des Tages: jeden Tag ein anderes aus der Galerie
  const today = GALLERY[Math.floor(Date.now() / 86400000) % GALLERY.length]

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-5">
      <header className="mb-5 flex items-center gap-3">
        <Logo size={56} />
        <div className="min-w-0">
          <h1 className="h1">Puzzlestube</h1>
          <div className="text-[16px] text-ink2">von screame</div>
        </div>
      </header>

      {/* Bild des Tages als großer Abzug mit Bildunterschrift */}
      <button className="kachel abzug mb-5 block w-full text-left" onClick={() => onPick(today.id)}>
        <div className="foto aspect-[16/10] w-full sm:aspect-[21/9] lg:aspect-auto lg:h-[340px]">
          <img src={`galerie/${today.file}.jpg`} alt="" className="bild h-full w-full object-cover" draggable={false} onLoad={(e) => e.currentTarget.classList.add('da')} ref={(el) => { if (el?.complete && el.naturalWidth) el.classList.add('da') }} />
        </div>
        <div className="flex items-center gap-3 px-1.5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] text-ink2">Bild des Tages</div>
            <div className="serif truncate text-[22px] font-bold leading-tight">{today.title}</div>
          </div>
          <span className="flex min-h-[50px] flex-none items-center gap-2 rounded-lg bg-green px-4 text-[18px] font-semibold text-white"><Icon name="puzzle" size={22} />Puzzeln</span>
        </div>
      </button>

      {last && (
        <button className="kachel card mb-5 flex w-full items-center gap-3 p-2.5 text-left" onClick={() => onResume(last)}>
          <img src={last.thumb} alt="" className="h-[68px] w-[90px] flex-none rounded-[3px] object-cover" draggable={false} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[18px] font-bold leading-tight">{last.title}</div>
            <div className="mb-1.5 text-[15px] text-ink2">Weiterpuzzeln · {last.percent}%</div>
            <Bar percent={last.percent} />
          </div>
          <span className="flex-none px-1 text-green"><Icon name="next" size={28} /></span>
        </button>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 sm:flex">
        <button className="btn btn-primary !min-h-[58px] !text-[18px]" onClick={() => input.current?.click()}>
          <Icon name="plus" size={24} /><span>Eigenes Foto</span>
        </button>
        <button className="btn !min-h-[58px] !text-[18px]" onClick={() => setSat(true)}>
          <Icon name="globe" size={24} /><span>Von oben</span>
        </button>
      </div>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />
      {note && <p className="card mb-6 border-danger p-4 text-[20px] text-danger" role="alert">{note}</p>}

      {albums.map((a) => {
        const ps = photos.filter((p) => p.albumId === a.id)
        if (!ps.length) return null
        const editing = edit === a.id
        return (
          <section key={a.id} className="mb-8">
            <div className="mb-3 flex items-center gap-3">
              <h2 className="h2 flex min-w-0 flex-1 items-center gap-2 truncate"><Icon name={a.id === 'satellit' ? 'globe' : 'photos'} />{a.name}</h2>
              <button className={`ibtn ${editing ? 'an' : ''}`} onClick={() => setEdit(editing ? null : a.id)} aria-label={editing ? 'Fertig mit Löschen' : `Bilder aus ${a.name} löschen`} title={editing ? 'Fertig' : 'Löschen'}>
                <Icon name={editing ? 'check' : 'trash'} />
              </button>
            </div>
            {editing ? (
              <Grid>
                {ps.map((p) => (
                  <div key={p.id} className="card overflow-hidden p-0">
                    <div className="aspect-[4/3] w-full bg-wood-dark"><img src={p.thumb} alt="" className="h-full w-full object-cover opacity-80" draggable={false} /></div>
                    <div className="truncate px-3 pt-2 text-[19px] font-semibold">{p.name || 'Eigenes Foto'}</div>
                    <button className="m-2 flex min-h-[52px] w-[calc(100%-16px)] items-center justify-center gap-2 rounded-lg border-2 border-danger text-[19px] font-semibold text-danger"
                      onClick={() => setAsk({ title: 'Bild löschen?', text: `„${p.name || 'Eigenes Foto'}“ und alle Spielstände dazu werden von diesem Gerät gelöscht.`, run: () => deletePhoto(p.id) })}>
                      <Icon name="trash" size={22} />Löschen
                    </button>
                  </div>
                ))}
              </Grid>
            ) : (
              <Row>{ps.map((p) => <Tile key={p.id} small src={p.thumb} title={p.name || 'Eigenes Foto'} onClick={() => onPick(p.id)} />)}</Row>
            )}
            {editing && ps.length > 1 && (
              <button className="btn btn-danger mt-3 w-full sm:w-auto"
                onClick={() => setAsk({ title: `Alle ${ps.length} Bilder löschen?`, text: `„${a.name}“ mit allen Bildern und Spielständen wird von diesem Gerät gelöscht.`, run: async () => { await deleteAlbum(a.id); setEdit(null) } })}>
                <Icon name="trash" />Alle {ps.length} löschen
              </button>
            )}
          </section>
        )
      })}

      {/* jedes Thema als wischbare Reihe, mit "Alle" zum Aufklappen */}
      {CATEGORIES.map((cat) => {
        const items = GALLERY.filter((g) => g.category === cat)
        const isOpen = open === cat
        return (
          <section key={cat} id={`thema-${cat}`} className="mb-7 scroll-mt-4">
            <div className="mb-3 flex items-center gap-3">
              <h2 className="h2 min-w-0 flex-1 truncate">{cat}</h2>
              <button className="min-h-[44px] px-1 text-[17px] font-semibold text-green underline decoration-green/40 underline-offset-4" onClick={() => setOpen(isOpen ? null : cat)} aria-expanded={isOpen}>
                {isOpen ? 'Weniger' : `Alle ${items.length}`}
              </button>
            </div>
            {isOpen
              ? <Grid>{items.map((g) => <Tile key={g.id} src={galleryThumb(g)} title={g.title} onClick={() => onPick(g.id)} />)}</Grid>
              : <Row>{items.map((g) => <Tile key={g.id} small src={galleryThumb(g)} title={g.title} onClick={() => onPick(g.id)} />)}</Row>}
          </section>
        )
      })}
      <button className="mt-2 min-h-[44px] px-1 text-[16px] text-ink2 underline underline-offset-4" onClick={() => setCredits(true)}>Bildnachweis</button>
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

/** Waagerecht wischbare Reihe von Kacheln. */
export function Row({ children }: { children: React.ReactNode }) {
  return <div className="reihe ohne-leiste -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2">{children}</div>
}

export function Tile({ src, title, sub, onClick, badge, small = false }: { src?: string; title: string; sub?: string; onClick: () => void; badge?: React.ReactNode; small?: boolean }) {
  return (
    <button className={`kachel abzug relative text-left ${small ? 'w-[168px] flex-none snap-start sm:w-[210px]' : ''}`} onClick={onClick}>
      <div className="foto aspect-[4/3] w-full">
        {src && <img src={src} alt="" className="bild h-full w-full object-cover" draggable={false} loading="lazy" onLoad={(e) => e.currentTarget.classList.add('da')} ref={(el) => { if (el?.complete && el.naturalWidth) el.classList.add('da') }} />}
      </div>
      {badge}
      <div className="px-1 pb-2.5 pt-2">
        <div className={`${small ? 'line-clamp-2 text-[16px]' : 'text-[18px]'} font-semibold leading-tight`}>{title}</div>
        {sub && <div className="text-[18px] text-ink2">{sub}</div>}
      </div>
    </button>
  )
}
