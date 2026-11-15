import { useEffect, useState } from 'react'
import { type Album, type Game, type Game3D, type Photo, all, del, deleteAlbum, deletePhoto } from '../db'
import { MODELS } from '../three/models'
import { modelThumbs } from '../three/stage'
import { Bar, Confirm, Icon, Modal } from '../ui/common'
import { Grid, Tile } from './PuzzlesTab'

interface Props {
  onResume: (g: Game) => void
  onPick: (imageId: string) => void
  onResume3D: (model: string, count: number) => void
  goPuzzles: () => void
}

export function CollectionTab({ onResume, onPick, onResume3D, goPuzzles }: Props) {
  const [games, setGames] = useState<Game[]>([])
  const [g3, setG3] = useState<Game3D[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [m3, setM3] = useState<Record<string, string>>({})
  const [openAlbum, setOpenAlbum] = useState<Album | null>(null)
  const [ask, setAsk] = useState<{ title: string; text: string; yes: string; run: () => Promise<void> } | null>(null)
  const [ready, setReady] = useState(false)

  const reload = async () => {
    const [g, t, a, p] = await Promise.all([all<Game>('games'), all<Game3D>('games3d'), all<Album>('albums'), all<Photo>('photos')])
    setGames(g.sort((x, y) => y.updatedAt - x.updatedAt))
    setG3(t.sort((x, y) => y.updatedAt - x.updatedAt))
    setAlbums(a.sort((x, y) => y.createdAt - x.createdAt))
    setPhotos(p.sort((x, y) => x.createdAt - y.createdAt))
    setReady(true)
    if (t.length) setM3(modelThumbs(setM3))
  }
  useEffect(() => { void reload() }, [])

  const running = games.filter((g) => !g.done && g.state)
  const finished = games.filter((g) => g.done)
  const running3 = g3.filter((g) => !g.done && g.placed.length > 0)
  const finished3 = g3.filter((g) => g.done)
  const name3 = (id: string) => MODELS.find((m) => m.id === id)?.name ?? '3D-Puzzle'
  const empty = ready && !running.length && !finished.length && !running3.length && !finished3.length && !photos.length
  const albumPhotos = openAlbum ? photos.filter((p) => p.albumId === openAlbum.id) : []

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-5">
      <h1 className="h1 mb-5">Meine Sammlung</h1>

      {empty && (
        <div className="card p-6 text-center">
          <p className="mb-4 text-[20px]">Noch nichts angefangen.</p>
          <button className="btn btn-primary" onClick={goPuzzles}>Erstes Puzzle aussuchen</button>
        </div>
      )}

      {(running.length > 0 || running3.length > 0) && (
        <section className="mb-8">
          <h2 className="h2 mb-3">Angefangen</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {running.map((g) => (
              <div key={g.id} className="card flex items-stretch gap-3 overflow-hidden p-0">
                <button className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left active:bg-black/5" onClick={() => onResume(g)}>
                  <img src={g.thumb} alt="" className="h-24 w-28 flex-none rounded-lg border border-black/15 object-cover" draggable={false} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[19px] font-bold">{g.title}</div>
                    <div className="mb-1.5 text-[16px] text-ink2">{g.cols * g.rows} Teile · {g.percent}%</div>
                    <Bar percent={g.percent} />
                  </div>
                </button>
                <button className="flex w-14 flex-none items-center justify-center border-l border-black/10 text-ink2" aria-label={`${g.title} löschen`}
                  onClick={() => setAsk({ title: 'Spielstand löschen?', text: `Der Stand von „${g.title}“ mit ${g.cols * g.rows} Teilen wird gelöscht. Das Bild bleibt erhalten.`, yes: 'Ja, löschen', run: () => del('games', g.id) as Promise<never> })}>
                  <Icon name="trash" />
                </button>
              </div>
            ))}
            {running3.map((g) => {
              const pct = Math.round((g.placed.length / 2 / g.count) * 100)
              return (
                <button key={g.id} className="kachel card flex items-center gap-3 p-3 text-left" onClick={() => onResume3D(g.model, g.count)}>
                  <div className="h-24 w-28 flex-none rounded-lg border border-black/15 bg-wood">{m3[g.model] && <img src={m3[g.model]} alt="" className="h-full w-full object-contain" draggable={false} />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[19px] font-bold">{name3(g.model)} (3D)</div>
                    <div className="mb-1.5 text-[16px] text-ink2">{g.count} Teile · {pct}%</div>
                    <Bar percent={pct} />
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {(finished.length > 0 || finished3.length > 0) && (
        <section className="mb-8">
          <h2 className="h2 mb-3 flex items-center gap-2"><span className="text-gold"><Icon name="trophy" /></span>Fertig</h2>
          <Grid>
            {finished.map((g) => (
              <Tile key={g.id} src={g.thumb} title={g.title} sub={`${g.cols * g.rows} Teile geschafft`} onClick={() => onPick(g.imageId)}
                badge={<span className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-lg bg-white text-gold"><Icon name="trophy" /></span>} />
            ))}
            {finished3.map((g) => (
              <button key={g.id} className="card relative overflow-hidden p-0 text-left" onClick={() => onResume3D(g.model, g.count)}>
                <div className="aspect-[4/3] w-full bg-wood">{m3[g.model] && <img src={m3[g.model]} alt="" className="h-full w-full object-contain" draggable={false} />}</div>
                <span className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-lg bg-white text-gold"><Icon name="trophy" /></span>
                <div className="px-3 py-2.5">
                  <div className="truncate text-[19px] font-bold">{name3(g.model)} (3D)</div>
                  <div className="text-[18px] text-ink2">{g.count} Teile geschafft</div>
                </div>
              </button>
            ))}
          </Grid>
        </section>
      )}

      {photos.length > 0 && (
        <section className="mb-8">
          <h2 className="h2 mb-3 flex items-center gap-2"><Icon name="photos" />Meine Fotoalben</h2>
          <Grid>
            {albums.map((a) => {
              const ps = photos.filter((p) => p.albumId === a.id)
              if (!ps.length) return null
              return <Tile key={a.id} src={ps[0].thumb} title={a.name} sub={ps.length === 1 ? '1 Foto' : `${ps.length} Fotos`} onClick={() => setOpenAlbum(a)} />
            })}
          </Grid>
        </section>
      )}

      {openAlbum && (
        <Modal title={openAlbum.name} onClose={() => setOpenAlbum(null)} wide>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {albumPhotos.map((p) => (
              <div key={p.id} className="card overflow-hidden p-0">
                <button className="block w-full" onClick={() => { setOpenAlbum(null); onPick(p.id) }} aria-label={`${p.name} puzzeln`}>
                  <img src={p.thumb} alt="" className="aspect-[4/3] w-full object-cover" draggable={false} />
                  <div className="px-2 py-2 text-[18px] font-semibold text-green">Puzzeln</div>
                </button>
                <button className="flex min-h-12 w-full items-center justify-center gap-2 border-t border-black/10 text-[18px] text-danger"
                  onClick={() => setAsk({ title: 'Foto löschen?', text: 'Das Foto und alle Spielstände dazu werden von diesem Gerät gelöscht.', yes: 'Ja, löschen', run: () => deletePhoto(p.id) })}>
                  <Icon name="trash" size={22} />Löschen
                </button>
              </div>
            ))}
          </div>
          <button className="btn btn-danger w-full"
            onClick={() => setAsk({ title: 'Ganzes Album löschen?', text: `„${openAlbum.name}“ mit allen Fotos und Spielständen wird von diesem Gerät gelöscht.`, yes: 'Ja, Album löschen', run: async () => { await deleteAlbum(openAlbum.id); setOpenAlbum(null) } })}>
            <Icon name="trash" />Ganzes Album löschen
          </button>
        </Modal>
      )}

      {ask && (
        <Confirm title={ask.title} text={ask.text} yes={ask.yes} onNo={() => setAsk(null)}
          onYes={async () => { const a = ask; setAsk(null); await a.run(); await reload(); if (openAlbum && !(await all<Photo>('photos')).some((p) => p.albumId === openAlbum.id)) setOpenAlbum(null) }} />
      )}
    </div>
  )
}
