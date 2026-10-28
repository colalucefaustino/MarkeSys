'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowRight, Check, Loader2, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useBrand } from '@/components/brand/brand-context'
import { ProvenanceBadge, type Origin } from '@/components/shared/provenance-badge'
import { SocialHandles } from '@/components/shared/social-handles'

type FieldType = 'text' | 'textarea' | 'number' | 'list' | 'bool' | 'select'
interface FieldDef {
  path: string
  label: string
  type: FieldType
  options?: { value: string; label: string }[]
  hint?: string
}

const PRECIOS = [
  { value: 'siempre', label: 'Siempre' },
  { value: 'nunca', label: 'Nunca' },
  { value: 'solo_promos', label: 'Solo en promociones' },
  { value: 'solo_historias', label: 'Solo en historias' },
]

const SECTIONS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Identidad',
    fields: [
      { path: 'marca.nombre', label: 'Nombre', type: 'text' },
      { path: 'marca.ciudad', label: 'Ciudad', type: 'text' },
      { path: 'marca.rubro', label: 'Rubro', type: 'text' },
      { path: 'marca.historia', label: 'Historia', type: 'textarea' },
      { path: 'marca.diferencial', label: 'Diferencial', type: 'textarea' },
      { path: 'marca.canales_venta', label: 'Canales de venta', type: 'list', hint: 'Separados por coma' },
      { path: 'marca.otros_nombres', label: 'Otros nombres del negocio', type: 'list', hint: 'Nombre del local, de la web o de las redes si es distinto a la marca' },
    ],
  },
  {
    title: 'Tamaño',
    fields: [
      {
        path: 'tamano.segmento',
        label: 'Segmento',
        type: 'select',
        options: [
          { value: 'micro', label: 'Micro' },
          { value: 'pyme', label: 'Pyme' },
          { value: 'grande', label: 'Grande' },
        ],
      },
      { path: 'tamano.empleados', label: 'Empleados', type: 'number' },
      { path: 'tamano.sucursales', label: 'Sucursales', type: 'number' },
      { path: 'tamano.equipo_marketing', label: 'Tiene equipo de marketing', type: 'bool' },
    ],
  },
  {
    title: 'Productos y precios',
    fields: [
      {
        path: 'productos_resumen.cantidad',
        label: 'Cantidad de artículos',
        type: 'select',
        options: ['Menos de 20', '20 a 100', '100 a 500', 'Más de 500'].map((v) => ({ value: v, label: v })),
        hint: 'Si subís el catálogo se cuenta solo',
      },
      { path: 'productos_resumen.descripcion', label: 'Productos principales', type: 'textarea' },
      { path: 'productos_resumen.categorias', label: 'Categorías', type: 'list', hint: 'Separadas por coma' },
      { path: 'precios_en_publicaciones', label: 'Precios en publicaciones', type: 'select', options: PRECIOS },
      {
        path: 'posicionamiento_precio',
        label: 'Posicionamiento de precio',
        type: 'select',
        options: [
          { value: 'economico', label: 'Económico' },
          { value: 'medio', label: 'Medio' },
          { value: 'premium', label: 'Premium' },
        ],
      },
      { path: 'compite_por', label: 'Compite por', type: 'textarea' },
      { path: 'beneficios_comunicables', label: 'Beneficios para comunicar', type: 'list', hint: 'Separados por coma' },
    ],
  },
  {
    title: 'Comunicación',
    fields: [
      {
        path: 'comunicacion.trato',
        label: 'Trato',
        type: 'select',
        options: [
          { value: 'vos', label: 'Vos' },
          { value: 'usted', label: 'Usted' },
        ],
      },
      { path: 'comunicacion.tono', label: 'Tono', type: 'list', hint: 'Separados por coma' },
      { path: 'comunicacion.frases_si', label: 'Frases que sí', type: 'list', hint: 'Una por línea o separadas por coma' },
      { path: 'comunicacion.frases_no', label: 'Frases que no', type: 'list', hint: 'Una por línea o separadas por coma' },
      { path: 'comunicacion.referencias', label: 'Marcas de referencia', type: 'list', hint: 'Separadas por coma' },
    ],
  },
  {
    title: 'Público',
    fields: [
      { path: 'publico.actual', label: 'Público actual', type: 'textarea' },
      { path: 'publico.deseado', label: 'Público deseado', type: 'textarea' },
      { path: 'publico.preocupaciones_compra', label: 'Preocupaciones al comprar', type: 'list', hint: 'Separadas por coma' },
    ],
  },
  {
    title: 'Identidad visual',
    fields: [
      { path: 'identidad_visual.estilo', label: 'Estilo', type: 'textarea' },
      { path: 'identidad_visual.tipografias', label: 'Tipografías', type: 'list', hint: 'Separadas por coma' },
    ],
  },
  {
    title: 'Capacidad de producción',
    fields: [
      {
        path: 'capacidad.historias_por_dia',
        label: 'Historias por día',
        type: 'select',
        options: [
          { value: '0', label: 'No sube historias' },
          { value: '2', label: '1 o 2 por día' },
          { value: '4', label: '3 a 5 por día' },
          { value: '6', label: 'Más de 5 por día' },
        ],
      },
      { path: 'capacidad.piezas_por_semana', label: 'Posts o reels por semana', type: 'number' },
      { path: 'capacidad.formatos_posibles', label: 'Formatos posibles', type: 'list', hint: 'Separados por coma' },
      { path: 'restricciones', label: 'Restricciones', type: 'list', hint: 'Una por línea o separadas por coma' },
    ],
  },
]

function getPath(obj: any, path: string) {
  return path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj)
}

function isEmpty(v: unknown) {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
}

function display(v: unknown, f: FieldDef) {
  if (isEmpty(v)) return null
  if (f.type === 'bool') return v ? 'Sí' : 'No'
  if (f.type === 'select') return f.options?.find((o) => o.value === String(v))?.label ?? String(v)
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

function Row({ def, value, origin, source, onSave }: { def: FieldDef; value: unknown; origin: Origin; source?: string | null; onSave: (path: string, v: unknown) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  function begin() {
    setDraft(Array.isArray(value) ? value.join(def.type === 'list' ? ', ' : '\n') : value === undefined || value === null ? '' : def.type === 'bool' ? (value ? 'si' : 'no') : String(value))
    setEditing(true)
  }

  async function commit() {
    let out: unknown = draft.trim()
    if (def.type === 'number') {
      if (out === '') return setEditing(false)
      const n = Number(String(out).replace(',', '.'))
      if (!Number.isFinite(n)) return toast.error('Ingresá un número válido')
      out = n
    }
    if (def.type === 'list') out = draft.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
    if (def.type === 'bool') out = draft === 'si'
    setSaving(true)
    try {
      await onSave(def.path, out)
      setEditing(false)
    } catch {
      toast.error('No pude guardar el cambio')
    } finally {
      setSaving(false)
    }
  }

  const shown = display(value, def)

  return (
    <div className="flex flex-col gap-1.5 py-3 sm:flex-row sm:gap-4">
      <div className="flex shrink-0 items-start justify-between gap-2 sm:w-52 sm:flex-col sm:justify-start">
        <span className="text-sm font-medium">{def.label}</span>
        <ProvenanceBadge
          origin={shown === null && origin !== 'pendiente' ? 'pendiente' : shown === null ? 'pendiente' : origin}
          source={source}
          onClick={origin === 'inferido' && shown !== null ? () => onSave(def.path, value) : undefined}
        />
      </div>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="space-y-2">
            {def.type === 'textarea' || (def.type === 'list' && def.path.includes('frases')) ? (
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} autoFocus />
            ) : def.type === 'select' ? (
              <Select value={draft} onValueChange={(v) => setDraft(v ?? '')}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue placeholder="Elegí una opción" />
                </SelectTrigger>
                <SelectContent>
                  {def.options?.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : def.type === 'bool' ? (
              <Select value={draft} onValueChange={(v) => setDraft(v ?? '')}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Elegí" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="si">Sí</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                inputMode={def.type === 'number' ? 'decimal' : undefined}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return
                    void commit()
                  }
                  if (e.key === 'Escape') setEditing(false)
                }}
              />
            )}
            {def.hint && <p className="text-xs text-muted-foreground">{def.hint}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={commit} disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Check />} Guardar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                <X /> Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <p className={shown === null ? 'flex-1 text-sm text-muted-foreground italic' : 'flex-1 whitespace-pre-line text-sm text-pretty'}>
              {shown ?? 'Sin dato todavía'}
            </p>
            <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={begin} aria-label={`Editar ${def.label}`}>
              <Pencil className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export function MarcaTab() {
  const { brandId, data, refresh } = useBrand()
  const router = useRouter()
  const [approving, setApproving] = useState(false)
  const ficha = data.ficha

  if (!ficha) {
    return (
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-lg font-semibold">Tu Ficha todavía no existe</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Completá el arranque con Marky y la armamos con lo que cargues y lo que contes.
        </p>
        <Button nativeButton={false} render={<Link href={`/marca/${brandId}/copiloto`} />}>
          Ir a Marky
        </Button>
      </div>
    )
  }

  const approved = ficha.status === 'approved'
  const missing = data.checklist.filter((i) => i.level === 'obligatorio' && !i.done)
  const colores: { hex: string; uso: string }[] = ficha.data?.identidad_visual?.colores ?? []
  const assumptions: string[] = ficha.data?.assumptions ?? []

  async function save(path: string, value: unknown) {
    const res = await fetch('/api/dossier/field', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brandId, section: 'ficha', path, value }),
    })
    if (!res.ok) throw new Error('save')
    await refresh()
  }

  async function approve() {
    setApproving(true)
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brandId, checkpoint: 'CP1', section: 'ficha', decision: 'aprobado' }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'No pude aprobar')
      await refresh()
      router.refresh()
      toast.success('Ficha aprobada. Se desbloqueó Visibilidad digital.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pude aprobar')
    } finally {
      setApproving(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 pb-28">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-balance">Ficha de {data.brand.name}</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Revisá lo que armamos. Lo marcado como Inferido es una suposición: tocalo para confirmarlo o editalo con el lápiz.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Productos', value: data.productsCount },
          { label: 'Canales', value: data.channels.length },
          { label: 'Competidores', value: data.competitors.length },
          { label: 'Objetivos', value: data.objectives.length },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-3">
            <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {data.objectives.length > 0 && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Objetivos</h2>
          <ul className="space-y-1.5 text-sm">
            {data.objectives.map((o) => (
              <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>{o.description}</span>
                <span className="text-xs text-muted-foreground tabular-nums">hasta {o.deadline}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.channels.length > 0 && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Canales detectados</h2>
          <ul className="space-y-1.5 text-sm">
            {data.channels.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="capitalize">
                  {c.type.replace('_', ' ')}
                  {c.handle_or_url ? <span className="ml-2 break-all text-muted-foreground normal-case">{c.handle_or_url}</span> : null}
                </span>
                {c.origin && <ProvenanceBadge origin={c.origin as Origin} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Redes</h2>
        <SocialHandles note="Las uso para medir si te encuentran en redes y compararte con tu competencia." />
      </section>

      {SECTIONS.map((s) => (
        <section key={s.title} className="rounded-xl border bg-card px-4">
          <h2 className="border-b py-3 text-sm font-semibold">{s.title}</h2>
          <div className="divide-y">
            {s.fields.map((f) => {
              const p = data.provenance[`ficha.${f.path}`]
              return (
                <Row
                  key={f.path}
                  def={f}
                  value={getPath(ficha.data, f.path)}
                  origin={p?.origin ?? 'pendiente'}
                  source={p?.source_ref}
                  onSave={save}
                />
              )
            })}
          </div>
          {s.title === 'Identidad visual' && colores.length > 0 && (
            <div className="border-t py-3">
              <p className="mb-2 text-sm font-medium">Colores</p>
              <div className="flex flex-wrap gap-3">
                {colores.map((c) => (
                  <div key={c.hex + c.uso} className="flex items-center gap-2 text-xs">
                    <span className="size-6 rounded-md border" style={{ backgroundColor: c.hex }} />
                    <span>
                      <span className="block font-medium uppercase">{c.hex}</span>
                      <span className="text-muted-foreground">{c.uso}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      ))}

      {assumptions.length > 0 && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h2 className="mb-2 text-sm font-semibold">Supuestos que hicimos</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 px-4 py-3 backdrop-blur lg:left-[var(--sidebar-w,16rem)]">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {approved
              ? `Ficha aprobada (versión ${ficha.version}).`
              : missing.length
                ? `Falta: ${missing.map((m) => m.label.toLowerCase()).join(', ')}.`
                : 'Si todo está bien, aprobá la Ficha para seguir con el diagnóstico.'}
          </p>
          {approved ? (
            <Button nativeButton={false} render={<Link href={`/marca/${brandId}/visibilidad`} />}>
              Ir a Visibilidad digital <ArrowRight />
            </Button>
          ) : (
            <Button onClick={approve} disabled={approving || missing.length > 0}>
              {approving ? <Loader2 className="animate-spin" /> : <Check />} Aprobar Ficha
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
