'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowRight, Check, Circle, Loader2, Paperclip, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { useBrand } from '@/components/brand/brand-context'
import { useCopilot } from '@/components/brand/chat-context'
import { ChatView } from '@/components/copilot/chat-view'
import { ACCEPT, uploadFile, type MediaKind } from '@/lib/upload'
import { isPlaceholderName } from '@/lib/brand-constants'

function ArranquePanel() {
  const { brandId, data, refresh } = useBrand()
  const router = useRouter()
  const brand = data.brand
  const [name, setName] = useState(isPlaceholderName(brand.name) ? '' : brand.name)
  const [city, setCity] = useState(brand.city ?? '')
  const [web, setWeb] = useState(brand.website_url ?? '')
  const [none, setNone] = useState(!!brand.no_web_no_catalog)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const hasCatalog = data.media.some((m) => m.kind === 'catalogo' || m.kind === 'stock')
  const hasSource = !!web.trim() || hasCatalog || none
  const canStart = !!name.trim() && !!city.trim() && hasSource

  async function onCatalog(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try {
      await uploadFile(brandId, 'catalogo', files[0])
      await refresh()
      toast.success('Catálogo subido')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pude subir el catálogo')
    } finally {
      setUploading(false)
    }
  }

  async function start() {
    setBusy(true)
    try {
      const patch = await fetch(`/api/brands/${brandId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          city: city.trim(),
          website_url: web.trim() || null,
          no_web_no_catalog: none && !web.trim() && !hasCatalog,
        }),
      })
      if (!patch.ok) throw new Error('No pude guardar los datos')
      const res = await fetch(`/api/brands/${brandId}/start`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'No pude arrancar')
      await refresh()
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Algo salió mal')
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col justify-center gap-6 p-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold text-balance">Contanos de tu negocio</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Con estos datos básicos el sistema empieza a leer tu web o tu catálogo. Después el Copiloto te hace unas pocas preguntas para completar el resto.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre del negocio</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">Ciudad</Label>
            <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ej: Córdoba" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="web">Web o tienda online</Label>
          <Input id="web" value={web} onChange={(e) => setWeb(e.target.value)} placeholder="https://mitienda.com.ar" inputMode="url" />
          <p className="text-xs text-muted-foreground">Si no tenés web, subí un catálogo o marcá la casilla de abajo.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="animate-spin" /> : <Paperclip />}
            {hasCatalog ? 'Cambiar catálogo' : 'Subir catálogo'}
          </Button>
          {hasCatalog && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <Check className="size-3.5" /> Catálogo cargado
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            hidden
            accept={ACCEPT.catalogo}
            onChange={(e) => {
              void onCatalog(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        <div className="flex items-start gap-2">
          <Checkbox id="none" checked={none} onCheckedChange={(v) => setNone(v === true)} className="mt-0.5" />
          <Label htmlFor="none" className="font-normal leading-snug">
            No tengo web ni catálogo. Prefiero contárselo al Copiloto.
          </Label>
        </div>
      </div>

      <Button size="lg" onClick={start} disabled={!canStart || busy}>
        {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}
        {busy ? 'Arrancando…' : 'Empezar'}
      </Button>
    </div>
  )
}

function UploadInline({ kind, label }: { kind: MediaKind; label: string }) {
  const { brandId, refresh } = useBrand()
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        disabled={busy}
        onClick={() => ref.current?.click()}
        aria-label={`Subir ${label}`}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Paperclip />} Subir
      </Button>
      <input
        ref={ref}
        type="file"
        hidden
        accept={ACCEPT[kind]}
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          setBusy(true)
          try {
            await uploadFile(brandId, kind, f)
            await refresh()
            toast.success('Archivo subido')
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No pude subir el archivo')
          } finally {
            setBusy(false)
          }
        }}
      />
    </>
  )
}

function ChecklistPanel() {
  const { brandId, data } = useBrand()
  const router = useRouter()
  const a1 = data.runs.A1
  const running = a1 && (a1.status === 'queued' || a1.status === 'running')
  const required = data.checklist.filter((i) => i.level === 'obligatorio')
  const requiredDone = required.filter((i) => i.done).length
  const ready = requiredDone === required.length

  const groups: { title: string; level: 'obligatorio' | 'recomendado' | 'opcional' }[] = [
    { title: 'Obligatorio', level: 'obligatorio' },
    { title: 'Recomendado', level: 'recomendado' },
    { title: 'Opcional', level: 'opcional' },
  ]

  return (
    <aside className="flex min-h-0 w-full shrink-0 flex-col gap-4 overflow-y-auto border-b bg-card p-4 lg:w-80 lg:border-b-0 lg:border-l">
      <div>
        <h2 className="text-sm font-semibold">Tu Expediente</h2>
        <p className="text-xs text-muted-foreground">
          {requiredDone} de {required.length} datos obligatorios
        </p>
      </div>

      {a1 && (
        <div className="space-y-1.5 rounded-lg border bg-background p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            {running ? <Loader2 className="size-3.5 animate-spin" /> : a1.status === 'failed' ? <TriangleAlert className="size-3.5 text-destructive" /> : <Check className="size-3.5 text-emerald-600" />}
            {running ? 'Leyendo tu información…' : a1.status === 'failed' ? 'No pude leer todo' : 'Lectura inicial lista'}
          </p>
          {a1.status === 'failed' && a1.error && <p className="text-xs text-muted-foreground">{a1.error}</p>}
          <ul className="space-y-1">
            {a1.progress.map((s) => (
              <li key={s.id} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                {s.status === 'done' ? (
                  <Check className="mt-0.5 size-3 shrink-0 text-emerald-600" />
                ) : s.status === 'running' ? (
                  <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin" />
                ) : s.status === 'failed' ? (
                  <TriangleAlert className="mt-0.5 size-3 shrink-0 text-destructive" />
                ) : (
                  <Circle className="mt-0.5 size-3 shrink-0" />
                )}
                <span>
                  {s.label}
                  {s.detail ? <span className="block text-[11px] opacity-80">{s.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {groups.map((g) => {
        const items = data.checklist.filter((i) => i.level === g.level)
        if (!items.length) return null
        return (
          <div key={g.level} className="space-y-1">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{g.title}</h3>
            <ul>
              {items.map((i) => (
                <li key={i.id} className="flex items-center gap-2 py-1 text-sm">
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded-full border',
                      i.done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-border',
                    )}
                  >
                    {i.done && <Check className="size-3" />}
                  </span>
                  <span className={cn('flex-1', i.done && 'text-muted-foreground')}>{i.label}</span>
                  {!i.done && i.uploadKind && <UploadInline kind={i.uploadKind} label={i.label} />}
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      <Button className="mt-auto" disabled={!ready} onClick={() => router.push(`/marca/${brandId}/marca`)}>
        Revisar mi Ficha <ArrowRight />
      </Button>
      {!ready && <p className="-mt-2 text-center text-xs text-muted-foreground">Completá lo obligatorio con el Copiloto.</p>}
    </aside>
  )
}

export function CopilotoTab() {
  const { data } = useBrand()
  const { messages, busy, send } = useCopilot()
  const kicked = useRef(false)
  const a1 = data.runs.A1
  const a1Settled = !!a1 && (a1.status === 'done' || a1.status === 'failed')
  const inArranque = data.brand.stage === 'arranque'

  useEffect(() => {
    if (inArranque || kicked.current || busy || messages.length > 0 || !a1Settled) return
    kicked.current = true
    send('Hola, ya cargué los datos básicos de mi negocio. ¿Cómo seguimos?')
  }, [inArranque, busy, messages.length, a1Settled, send])

  if (inArranque) return <ArranquePanel />

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <ChatView
          placeholder="Respondé acá o tocá el micrófono…"
          emptyHint={a1Settled ? 'El Copiloto está por escribirte…' : 'Estoy leyendo tu información. En unos segundos arrancamos.'}
        />
      </div>
      <ChecklistPanel />
    </div>
  )
}
