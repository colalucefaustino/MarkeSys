'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBrand } from '@/components/brand/brand-context'
import { RunProgress } from '@/components/shared/run-progress'
import { ApproveBar, Empty, PageHead, fmtDate, postJSON, useActions } from '@/components/tabs/shared'
import { cn } from '@/lib/utils'

const COLORS = ['#F28C38', '#3B2A1F', '#C2550F', '#B9A58F']
const ACC = '#8FA88B'
export const FMT: Record<string, string> = {
  post: 'Post', carrusel: 'Carrusel', historia: 'Historia', reel: 'Reel', whatsapp: 'WhatsApp', email: 'Email',
  accion_seo: 'Acción web', accion_geo: 'Acción Google', accion_local: 'Acción local',
}
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function CalendarioTab() {
  const { data } = useBrand()
  const { brandId, busy, run, startAgent, approve } = useActions()
  const a5 = data.runs.A5
  const sec = data.calendario
  const c = (sec?.data ?? {}) as any
  const running = a5 && (a5.status === 'queued' || a5.status === 'running')
  const [view, setView] = useState<'cal' | 'list' | 'camp'>('cal')
  const [month, setMonth] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const items = (c.items ?? []) as any[]
  const approved = sec?.status === 'approved'
  const color = (i: number) => (i >= 0 ? COLORS[i % COLORS.length] : ACC)

  const cur = month ?? (c.horizonte?.inicio ?? iso(new Date())).slice(0, 7)
  const cells = useMemo(() => {
    const [y, m] = cur.split('-').map(Number)
    const first = new Date(y, m - 1, 1, 12)
    const off = (first.getDay() + 6) % 7
    const days = new Date(y, m, 0).getDate()
    const n = Math.ceil((off + days) / 7) * 7
    return Array.from({ length: n }, (_, i) => new Date(y, m - 1, 1 - off + i, 12))
  }, [cur])

  if (running) return <div className="flex h-full items-center justify-center p-6"><RunProgress run={a5} title="Armando tu calendario" /></div>

  if (!items.length) {
    return (
      <Empty icon={<CalendarDays className="size-5" />} title="Tu plan, con el porqué de cada pieza" text={`El calendario dura lo que duran tus objetivos (${data.objectives.map((o) => `${o.description}, hasta ${fmtDate(o.deadline)}`).join(' · ') || 'todavía no cargaste objetivos'}).`}>
        <Button size="lg" disabled={!!busy || !data.objectives.length} onClick={() => startAgent('A5')}>
          {busy === 'A5' && <Loader2 className="animate-spin" />} Armar mi calendario
        </Button>
        {!data.objectives.length && <p className="text-sm text-muted-foreground">Pedile al Copiloto que te proponga objetivos con fecha.</p>}
        {a5?.status === 'failed' && <p className="text-sm text-destructive">{a5.error}</p>}
      </Empty>
    )
  }

  const shift = (d: number) => {
    const [y, m] = cur.split('-').map(Number)
    const dt = new Date(y, m - 1 + d, 1)
    setMonth(iso(dt).slice(0, 7))
  }
  const sel = items.find((i) => i.id === open)
  const setStatus = (id: string, status: string) => run('item', () => postJSON('/api/calendar/item', { brandId, itemId: id, patch: { status } }, 'PATCH'))
  const cnt = (s: string) => items.filter((i) => i.status === s).length
  const h = c.horizonte

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <PageHead
        eyebrow="Plan · Calendario"
        title={`Plan de ${h.semanas} semanas`}
        text={`Del ${fmtDate(h.inicio)} al ${fmtDate(h.fin)}, organizado por ${h.granularidad}, con ${h.piezas_por_semana} piezas por semana. La duración sale de tus objetivos.`}
        right={
          <div className="inline-flex rounded-lg bg-muted p-1">
            {[['cal', 'Calendario'], ['camp', 'Campañas'], ['list', 'Lista']].map(([k, l]) => (
              <button key={k} onClick={() => setView(k as any)} className={cn('rounded-md px-3 py-1.5 text-sm', view === k ? 'bg-card font-semibold shadow-sm' : 'text-muted-foreground')}>{l}</button>
            ))}
          </div>
        }
      />
      <div className="flex flex-wrap gap-2 text-xs">
        {c.campanas.map((k: any, i: number) => (
          <span key={k.nombre} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1"><i className="size-2 rounded-full" style={{ background: color(i) }} />{k.nombre}</span>
        ))}
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1"><i className="size-2 rounded-full" style={{ background: ACC }} />Acciones de visibilidad</span>
      </div>

      <div className="rounded-xl border bg-card p-4">
        {view === 'cal' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" aria-label="Mes anterior" onClick={() => shift(-1)}><ChevronLeft /></Button>
              <h2 className="min-w-40 text-center font-semibold">{MESES[Number(cur.slice(5)) - 1]} {cur.slice(0, 4)}</h2>
              <Button variant="outline" size="icon" aria-label="Mes siguiente" onClick={() => shift(1)}><ChevronRight /></Button>
            </div>
            <div className="overflow-x-auto">
              <div className="grid min-w-[700px] grid-cols-7 overflow-hidden rounded-lg border">
                {['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((d) => <div key={d} className="border-b bg-muted px-2 py-1 text-xs text-muted-foreground uppercase">{d}</div>)}
                {cells.map((d) => {
                  const ds = iso(d)
                  const ev = items.filter((i) => i.fecha === ds)
                  const inMonth = ds.slice(0, 7) === cur
                  return (
                    <div key={ds} className={cn('min-h-24 space-y-1 border-r border-b p-1', !inMonth && 'bg-muted/40')}>
                      <p className="text-xs text-muted-foreground tabular-nums">{d.getDate()}</p>
                      {ev.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => setOpen(e.id)}
                          className={cn('block w-full truncate rounded border-l-[3px] bg-background px-1.5 py-0.5 text-left text-[11px]', e.status === 'descartada' && 'line-through opacity-40', e.status === 'aprobada' && 'ring-1 ring-success')}
                          style={{ borderLeftColor: color(e.campana) }}
                          title={e.idea}
                        >
                          {FMT[e.formato] ?? e.formato} · {e.idea}
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
        {view === 'camp' && (
          <ul className="space-y-3">
            {c.campanas.map((k: any, i: number) => (
              <li key={k.nombre} className="rounded-lg border p-3" style={{ borderLeft: `4px solid ${color(i)}` }}>
                <p className="font-semibold">{k.nombre} <span className="text-sm font-normal text-muted-foreground">· {fmtDate(k.inicio)} → {fmtDate(k.fin)}</span></p>
                <p className="text-sm">{k.objetivo}</p>
                <p className="text-sm text-muted-foreground">Mensaje: {k.mensaje_clave} · Meta: {k.kpi}</p>
              </li>
            ))}
          </ul>
        )}
        {view === 'list' && (
          <ul className="divide-y">
            {items.map((e) => (
              <li key={e.id}>
                <button className="flex w-full items-center gap-3 py-2 text-left text-sm" onClick={() => setOpen(e.id)}>
                  <i className="size-2 shrink-0 rounded-full" style={{ background: color(e.campana) }} />
                  <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{fmtDate(e.fecha)}</span>
                  <span className="rounded bg-muted px-1.5 text-xs">{FMT[e.formato] ?? e.formato}</span>
                  <span className="min-w-0 flex-1 truncate">{e.idea}</span>
                  {e.promo_propuesta && <span className="rounded bg-warning/20 px-1.5 text-xs">Propuesta</span>}
                  <span className={cn('text-xs', e.status === 'aprobada' ? 'text-success' : e.status === 'descartada' ? 'text-destructive' : 'text-muted-foreground')}>{e.status}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ApproveBar
        label="Punto de control 5 · Calendario"
        hint={approved ? 'Aprobado. Ya podés producir el contenido.' : `${items.length} ítems · ${cnt('aprobada')} aprobados · ${cnt('descartada')} descartados. Tocá uno para ver su porqué.`}
        approved={approved}
        busy={busy === 'CP5' || busy === 'all'}
        cta="Aprobar calendario"
        extra={<Button variant="outline" onClick={() => startAgent('A5')} disabled={!!busy}>Rehacer</Button>}
        onApprove={() =>
          run('all', async () => {
            await postJSON('/api/calendar/item', { brandId })
            await postJSON('/api/approvals', { brandId, checkpoint: 'CP5', section: 'calendario', decision: 'aprobado' })
          }, 'Calendario aprobado')
        }
      />

      {sel && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setOpen(null)}>
          <aside className="flex h-full w-full max-w-md flex-col gap-4 overflow-auto bg-card p-6" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-label="Detalle de la pieza">
            <div className="flex items-start justify-between gap-2">
              <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: color(sel.campana) + '22' }}>{sel.campana >= 0 ? c.campanas[sel.campana]?.nombre : 'Acción de visibilidad'}</span>
              <Button variant="ghost" size="icon" aria-label="Cerrar" onClick={() => setOpen(null)}><X /></Button>
            </div>
            <h2 className="text-xl font-semibold">{sel.idea}</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-muted px-2 py-0.5">{fmtDate(sel.fecha)}</span>
              <span className="rounded bg-muted px-2 py-0.5">{FMT[sel.formato] ?? sel.formato}</span>
              <span className="rounded bg-muted px-2 py-0.5">{sel.canal}</span>
              <span className="rounded bg-muted px-2 py-0.5">{sel.muestra_precio ? 'con precio' : 'sin precio'}</span>
              {sel.producto && <span className="rounded bg-muted px-2 py-0.5">{sel.producto}</span>}
              {sel.fecha_comercial && <span className="rounded bg-info/15 px-2 py-0.5 text-info">{sel.fecha_comercial}</span>}
              {sel.promo_propuesta && <span className="rounded bg-warning/20 px-2 py-0.5">Promo propuesta</span>}
            </div>
            {sel.copy && <div><p className="text-xs font-semibold text-muted-foreground uppercase">Texto</p><p>{sel.copy}</p></div>}
            <div className="rounded-lg bg-info/10 p-3 text-sm"><b className="text-info">¿Por qué?</b> {sel.porque}</div>
            {sel.promo_propuesta && <p className="text-xs text-muted-foreground">Es una propuesta: no nos confirmaste que hagas este descuento. Si no la aprobás, no sale.</p>}
            <div className="mt-auto flex flex-wrap gap-2">
              <Button onClick={() => setStatus(sel.id, 'aprobada')} disabled={sel.status === 'aprobada' || !!busy}>{sel.status === 'aprobada' ? 'Aprobada' : 'Aprobar'}</Button>
              <Button variant="outline" onClick={() => setStatus(sel.id, 'descartada')} disabled={sel.status === 'descartada' || !!busy}>Descartar</Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
