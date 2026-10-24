'use client'

import { useRef, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { FileText, Film, Loader2, Trash2, Upload, TriangleAlert, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useBrand } from '@/components/brand/brand-context'
import { ACCEPT, uploadFile, type MediaKind } from '@/lib/upload'

interface MediaItem {
  id: string
  kind: MediaKind
  original_name: string | null
  mime: string | null
  size_bytes: number | null
  parse_status: 'pending' | 'parsing' | 'parsed' | 'failed'
  parse_summary: string | null
  url: string | null
  created_at: string
}

const CATEGORIES: { kind: MediaKind; label: string; use: string; multiple?: boolean }[] = [
  { kind: 'fotos', label: 'Fotos de productos', use: 'Se usan para reconocer productos y, más adelante, para diseñar tus piezas.', multiple: true },
  { kind: 'logo', label: 'Logo', use: 'Sirve para sacar tus colores y para ponerlo en las piezas.' },
  { kind: 'branding', label: 'Manual de marca', use: 'De acá salen colores, tipografías, tono y lo que no se puede hacer.' },
  { kind: 'catalogo', label: 'Catálogo', use: 'Arma la lista de productos con precios.' },
  { kind: 'stock', label: 'Stock', use: 'Detecta qué conviene empujar y qué hay de más.' },
  { kind: 'ventas', label: 'Historial de ventas', use: 'Alimenta el dashboard y muestra qué se vende más.' },
  { kind: 'resenas', label: 'Reseñas', use: 'Se usan en el análisis de percepción.' },
  { kind: 'videos', label: 'Videos', use: 'Quedan guardados para producir tus reels e historias.', multiple: true },
  { kind: 'skill', label: 'Skill de edición', use: 'Tu guía de edición de video (archivo .md). Se aplicará en la fase de contenido.' },
]

const fetcher = (u: string) => fetch(u).then((r) => r.json())

function formatSize(n: number | null) {
  if (!n) return ''
  if (n > 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1000))} KB`
}

function UploadButton({ cat, onDone }: { cat: (typeof CATEGORIES)[number]; onDone: () => Promise<unknown> }) {
  const { brandId, refresh } = useBrand()
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    try {
      const list = cat.multiple ? Array.from(files) : [files[0]]
      for (const f of list) await uploadFile(brandId, cat.kind, f)
      await Promise.all([onDone(), refresh()])
      toast.success(list.length > 1 ? `${list.length} archivos subidos` : 'Archivo subido')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pude subir el archivo')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Upload />}
        {busy ? 'Subiendo…' : 'Subir'}
      </Button>
      <input
        ref={ref}
        type="file"
        hidden
        multiple={cat.multiple}
        accept={ACCEPT[cat.kind]}
        onChange={(e) => {
          void onFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </>
  )
}

export function MediosTab() {
  const { brandId, data, refresh } = useBrand()
  const parsing = data.media.some((m) => m.parse_status === 'pending' || m.parse_status === 'parsing')
  const { data: res, mutate } = useSWR<{ media: MediaItem[] }>(`/api/media?brandId=${brandId}`, fetcher, {
    refreshInterval: parsing ? 3000 : 0,
  })
  const [toDelete, setToDelete] = useState<MediaItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const media = res?.media ?? []

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    try {
      const r = await fetch(`/api/media?id=${toDelete.id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error()
      await Promise.all([mutate(), refresh()])
      toast.success('Archivo borrado')
      setToDelete(null)
    } catch {
      toast.error('No pude borrar el archivo')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-balance">Medios</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Todo lo que subís queda acá. Cada archivo se lee y se usa para completar la Ficha de tu marca.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((c) => {
          const count = media.filter((m) => m.kind === c.kind).length
          return (
            <div key={c.kind} className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">{c.label}</h2>
                  {count > 0 && <span className="text-xs text-muted-foreground tabular-nums">{count} cargado{count > 1 ? 's' : ''}</span>}
                </div>
                <p className="text-xs text-muted-foreground text-pretty">{c.use}</p>
              </div>
              <div>
                <UploadButton cat={c} onDone={() => mutate()} />
              </div>
            </div>
          )
        })}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Archivos cargados</h2>
        {media.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Todavía no subiste nada.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {media.map((m) => {
              const cat = CATEGORIES.find((c) => c.kind === m.kind)
              const isImg = m.mime?.startsWith('image/') && m.url
              const isVideo = m.mime?.startsWith('video/')
              return (
                <li key={m.id} className="flex flex-col overflow-hidden rounded-xl border bg-card">
                  <div className="flex aspect-video items-center justify-center bg-muted">
                    {isImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url!} alt={m.original_name ?? 'Archivo'} className="size-full object-cover" />
                    ) : isVideo ? (
                      <Film className="size-8 text-muted-foreground" />
                    ) : (
                      <FileText className="size-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{m.original_name ?? 'Sin nombre'}</p>
                        <p className="text-xs text-muted-foreground">
                          {cat?.label ?? m.kind} {formatSize(m.size_bytes) && `· ${formatSize(m.size_bytes)}`}
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label={`Borrar ${m.original_name}`} onClick={() => setToDelete(m)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="text-xs">
                      {m.parse_status === 'parsed' ? (
                        <p className="flex gap-1.5 text-muted-foreground">
                          <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                          <span className="text-pretty">{m.parse_summary ?? 'Leído'}</span>
                        </p>
                      ) : m.parse_status === 'failed' ? (
                        <p className="flex gap-1.5 text-destructive">
                          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                          <span className="text-pretty">{m.parse_summary ?? 'No pude leer este archivo. Probá con otro formato.'}</span>
                        </p>
                      ) : (
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin" /> Leyendo archivo…
                        </p>
                      )}
                    </div>
                    {cat && <p className="mt-auto text-[11px] text-muted-foreground/80 text-pretty">Se usa para: {cat.use}</p>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Borrar este archivo?</DialogTitle>
            <DialogDescription>
              Se va a borrar {toDelete?.original_name ?? 'el archivo'}. Los datos que ya se cargaron en la Ficha no se tocan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setToDelete(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="animate-spin" />} Borrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
