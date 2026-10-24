'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Check, Loader2, RefreshCw, X, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useBrand } from '@/components/brand/brand-context'
import type { QueryRow } from '@/components/visibilidad/queries-panel'

export interface ResultRow {
  query_id: string
  channel: string
  status: string
  appears: boolean | null
  position: number | null
}
export interface CompetitorRow {
  id: string
  name: string
  source: string | null
  detected_in: string[] | null
  confirmed: boolean | null
}

const CHANNEL_LABEL: Record<string, string> = {
  llm: 'IA',
  google_web: 'Google',
  google_maps: 'Maps',
}
const CHANNEL_LONG: Record<string, string> = {
  llm: 'Asistentes de IA',
  google_web: 'Google',
  google_maps: 'Google Maps',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  general: 'General',
}
const ESTADO: Record<string, string> = { failed: 'No se pudo medir', skipped: 'No se midió' }

function scoreTone(n: number) {
  return n >= 60 ? 'text-emerald-600 dark:text-emerald-400' : n >= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
}

function Cell({ r }: { r?: ResultRow }) {
  if (!r || r.status !== 'ok') return <Minus className="mx-auto size-3.5 text-muted-foreground/50" aria-label="Sin dato" />
  if (!r.appears) return <X className="mx-auto size-4 text-red-500" aria-label="No aparece" />
  return (
    <span className="mx-auto inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
      <Check className="size-3.5" />
      {r.position ? `#${r.position}` : ''}
    </span>
  )
}

export function ResultsView({
  vis,
  status,
  queries,
  results,
  competitors,
  onChange,
  onRerun,
  rerunning,
}: {
  vis: Record<string, any>
  status: string
  queries: QueryRow[]
  results: ResultRow[]
  competitors: CompetitorRow[]
  onChange: () => Promise<unknown>
  onRerun: () => void
  rerunning: boolean
}) {
  const { brandId, refresh } = useBrand()
  const [approving, setApproving] = useState(false)
  const approved = status === 'approved'

  const porCanal: { canal: string; puntaje: number; con_aparicion: number; total: number; estado: string }[] = vis.por_canal ?? []
  const acciones: { accion: string; canal: string; evidencia: string; prioridad: string; esfuerzo: string }[] = vis.acciones ?? []
  const ranking: { nombre: string; apariciones: number; canales: string[] }[] = vis.ranking_competidores ?? []
  const fuentes: { dominio: string; veces: number }[] = vis.fuentes_frecuentes ?? []
  const redes: any[] = vis.redes ?? []
  const detected = competitors.filter((c) => c.source === 'detectado')
  const score = Number(vis.puntaje_global ?? 0)
  const sn = vis.sn ?? vis.sin_nombre ?? { con_aparicion: 0, total: 0 }

  async function approve() {
    setApproving(true)
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brandId, checkpoint: 'CP2', section: 'visibilidad', decision: 'aprobado' }),
      })
      if (!res.ok) throw new Error()
      await refresh()
      toast.success('Diagnóstico de visibilidad aprobado')
    } catch {
      toast.error('No pude aprobar el diagnóstico')
    } finally {
      setApproving(false)
    }
  }

  async function competitor(id: string, patch: { confirmed: boolean } | 'delete') {
    await fetch(patch === 'delete' ? `/api/competitors?id=${id}` : '/api/competitors', {
      method: patch === 'delete' ? 'DELETE' : 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: patch === 'delete' ? undefined : JSON.stringify({ id, ...patch }),
    })
    await Promise.all([onChange(), refresh()])
  }

  const channels = ['llm', 'google_web', 'google_maps']

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 pb-28">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-balance">Diagnóstico de visibilidad digital</h1>
          <p className="text-sm text-muted-foreground">Medido el {vis.fecha}. Los resultados salen de búsquedas reales, no de opiniones.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRerun} disabled={rerunning}>
          {rerunning ? <Loader2 className="animate-spin" /> : <RefreshCw />} Volver a medir
        </Button>
      </header>

      <section className="grid gap-4 md:grid-cols-[220px_1fr]">
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card p-5 text-center">
          <p className={cn('text-5xl font-semibold tabular-nums', scoreTone(score))}>{score}</p>
          <p className="text-xs text-muted-foreground">de 100 · puntaje global</p>
          {sn.total > 0 && (
            <p className="mt-3 text-xs text-pretty text-muted-foreground">
              Sin decir tu nombre aparecés en <span className="font-medium text-foreground">{sn.con_aparicion} de {sn.total}</span> búsquedas.
            </p>
          )}
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Por canal</h2>
          {porCanal.map((c) => (
            <div key={c.canal} className="space-y-1">
              <div className="flex items-baseline justify-between text-sm">
                <span>{CHANNEL_LONG[c.canal]}</span>
                {c.estado === 'ok' ? (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    <span className={cn('text-sm font-semibold', scoreTone(c.puntaje))}>{c.puntaje}</span> · aparecés en {c.con_aparicion} de {c.total}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">{ESTADO[c.estado] ?? c.estado}</span>
                )}
              </div>
              <Progress value={c.estado === 'ok' ? c.puntaje : 0} className="h-1.5" />
            </div>
          ))}
        </div>
      </section>

      {acciones.length > 0 && (
        <section className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-3 text-sm font-semibold">Qué hacer primero</h2>
          <ul className="divide-y">
            {acciones.map((a, i) => (
              <li key={i} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{a.accion}</span>
                </div>
                <p className="text-xs text-muted-foreground text-pretty">Evidencia: {a.evidencia}</p>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded-full border px-2 py-0.5">{CHANNEL_LONG[a.canal] ?? a.canal}</span>
                  <span className={cn('rounded-full border px-2 py-0.5', a.prioridad === 'alta' && 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400')}>
                    Prioridad {a.prioridad}
                  </span>
                  <span className="rounded-full border px-2 py-0.5">Esfuerzo {a.esfuerzo}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border bg-card">
        <h2 className="border-b px-4 py-3 text-sm font-semibold">Búsqueda por búsqueda</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Búsqueda</th>
                {channels.map((c) => (
                  <th key={c} className="w-16 px-2 py-2 text-center font-medium">
                    {CHANNEL_LABEL[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {queries.map((q) => (
                <tr key={q.id}>
                  <td className="px-4 py-2 text-pretty">{q.text}</td>
                  {channels.map((c) => (
                    <td key={c} className="px-2 py-2 text-center">
                      <Cell r={results.find((r) => r.query_id === q.id && r.channel === c)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-3 text-sm font-semibold">Quién aparece en tu lugar</h2>
          {ranking.length ? (
            <ul className="divide-y">
              {ranking.slice(0, 8).map((r) => (
                <li key={r.nombre} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0 truncate">{r.nombre}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{r.apariciones} apariciones</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-muted-foreground">No se detectaron otros nombres.</p>
          )}
        </section>

        <section className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-3 text-sm font-semibold">Fuentes que más se citan</h2>
          {fuentes.length ? (
            <ul className="divide-y">
              {fuentes.slice(0, 8).map((f) => (
                <li key={f.dominio} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0 truncate">{f.dominio}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{f.veces} veces</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-muted-foreground">Sin fuentes registradas.</p>
          )}
        </section>
      </div>

      {redes.length > 0 && (
        <section className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-3 text-sm font-semibold">Redes</h2>
          <ul className="divide-y">
            {redes.map((r) => (
              <li key={r.red} className="space-y-1 px-4 py-3 text-sm">
                <p className="font-medium capitalize">
                  {r.red} <span className="font-normal text-muted-foreground">@{r.handle}</span>
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {r.seguidores != null ? `${Number(r.seguidores).toLocaleString('es-AR')} seguidores` : 'Seguidores sin dato'}
                  {r.posts_por_semana != null ? ` · ${r.posts_por_semana} publicaciones por semana` : ''}
                  {r.engagement != null ? ` · ${r.engagement}% de interacción` : ''}
                </p>
                {r.vs_competidores && <p className="text-xs text-muted-foreground">{r.vs_competidores}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {detected.length > 0 && (
        <section className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-3 text-sm font-semibold">Competidores detectados</h2>
          <ul className="divide-y">
            {detected.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span>{c.name}</span>
                {c.confirmed ? (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">Confirmado como competidor</span>
                ) : (
                  <span className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => competitor(c.id, { confirmed: true })}>
                      Sí, lo conozco
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => competitor(c.id, 'delete')}>
                      No es competidor
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {((vis.missing_inputs as string[]) ?? []).length > 0 && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h2 className="mb-2 text-sm font-semibold">Con estos datos el diagnóstico sería más completo</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {(vis.missing_inputs as string[]).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      )}

      {((vis.assumptions as string[]) ?? []).length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {(vis.assumptions as string[]).map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 px-4 py-3 backdrop-blur lg:left-[var(--sidebar-w,16rem)]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {approved ? 'Diagnóstico de visibilidad aprobado.' : 'Si lo entendiste, aprobalo para avanzar.'}
          </p>
          {approved ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="size-4" /> Aprobado
            </span>
          ) : (
            <Button onClick={approve} disabled={approving}>
              {approving ? <Loader2 className="animate-spin" /> : <Check />} Entendido, aprobar diagnóstico
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
