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
  const hour = new Date().getHours()
  const greeting = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend'

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-5">
      <header className="mb-5 flex items-center gap-4">
        <Logo size={60} />
        <div className="min-w-0">
          <div className="text-[17px] text-ink2">{greeting}</div>
          <h1 className="text-[30px] font-extrabold leading-tight tracking-tight">Puzzlestube</h1>
        </div>
      </header>

      {/* großes Titelbild: Bild des Tages */}
      <button className="kachel relative mb-4 block w-full overflow-hidden rounded-2xl bg-wood-dark text-left shadow-[0_6px_18px_rgba(50,30,10,0.22)]" onClick={() => onPick(today.id)}>
        <div className="aspect-[16/10] w-full sm:aspect-[21/9] lg:aspect-auto lg:h-[340px]">
          <img src={`galerie/${today.file}.jpg`} alt="" className="bild h-full w-full object-cover" draggable={false} onLoad={(e) => e.currentTarget.classList.add('da')} ref={(el) => { if (el?.complete && el.naturalWidth) el.classList.add('da') }} />
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 bg-[rgba(27,22,16,0.62)] px-4 py-3 text-white">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-[#F2D38A]">Bild des Tages</div>
            <div className="truncate text-[21px] font-bold leading-tight">{today.title}</div>
          </div>
          <span className="flex h-12 flex-none items-center gap-2 rounded-xl bg-white px-4 text-[18px] font-bold text-ink"><Icon name="puzzle" size={24} />Puzzeln</span>
        </div>
      </button>

      {last && (
        <button className="kachel card mb-4 flex w-full items-center gap-4 overflow-hidden p-3 text-left" onClick={() => onResume(last)}>
          <img src={last.thumb} alt="" className="h-[76px] w-[100px] flex-none rounded-lg object-cover" draggable={false} />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-green">Weiterpuzzeln</div>
            <div className="truncate text-[19px] font-bold leading-tight">{last.title}</div>
            <div className="mb-1.5 text-[15px] text-ink2">{last.cols * last.rows} Teile · {last.percent}%</div>
            <Bar percent={last.percent} />
          </div>
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-green text-white"><Icon name="next" size={26} /></span>
        </button>
      )}

      {/* zwei große Kacheln für eigene Bilder */}
      <div className="mb-8 grid grid-cols-2 gap-3">
        <button className="kachel flex min-h-[104px] flex-col justify-between rounded-2xl bg-green p-4 text-left text-white shadow-[0_4px_12px_rgba(27,68,59,0.35)]" onClick={() => input.current?.click()}>
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15"><Icon name="plus" size={26} /></span>
          <span className="text-[19px] font-bold leading-tight">Eigenes Foto</span>
        </button>
        <button className="kachel card flex min-h-[104px] flex-col justify-between rounded-2xl p-4 text-left" onClick={() => setSat(true)}>
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F2E3C4] text-[#8A5A12]"><Icon name="globe" size={26} /></span>
          <span className="text-[19px] font-bold leading-tight">Von oben</span>
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
              <button className="flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-[17px] font-semibold text-green active:bg-black/5" onClick={() => setOpen(isOpen ? null : cat)} aria-expanded={isOpen}>
                {isOpen ? 'Weniger' : `Alle ${items.length}`}<Icon name={isOpen ? 'back' : 'next'} size={20} />
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
    <button className={`kachel card relative overflow-hidden p-0 text-left ${small ? 'w-[168px] flex-none snap-start sm:w-[210px]' : ''}`} onClick={onClick}>
      <div className="aspect-[4/3] w-full bg-wood-dark">
        {src && <img src={src} alt="" className="bild h-full w-full object-cover" draggable={false} loading="lazy" onLoad={(e) => e.currentTarget.classList.add('da')} ref={(el) => { if (el?.complete && el.naturalWidth) el.classList.add('da') }} />}
      </div>
      {badge}
      <div className="px-3 py-2.5">
        <div className={`${small ? 'line-clamp-2 text-[17px]' : 'text-[19px]'} font-semibold leading-tight`}>{title}</div>
        {sub && <div className="text-[18px] text-ink2">{sub}</div>}
      </div>
    </button>
  )
}
