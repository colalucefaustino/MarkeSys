'use client'

import { useEffect, useState } from 'react'
import { Target, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useBrand } from '@/components/brand/brand-context'
import { RunProgress } from '@/components/shared/run-progress'
import { ApproveBar, Empty, PageHead, postJSON, useActions } from '@/components/tabs/shared'
import { cn } from '@/lib/utils'

const MODOS = [
  { k: 'descubrir', l: 'Descubrir nicho' },
  { k: 'validar', l: 'Validar mi nicho' },
  { k: 'profundizar', l: 'Profundizar en mi nicho' },
]

function Field({ id, label, value, onSave, disabled }: { id: string; label: string; value: string; onSave: (v: string) => void; disabled?: boolean }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <div className="grid gap-1.5 md:grid-cols-[160px_1fr] md:items-center">
      <label htmlFor={id} className="text-sm text-muted-foreground">{label}</label>
      <Input id={id} value={v} disabled={disabled} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />
    </div>
  )
}

export function EstrategiaTab() {
  const { data } = useBrand()
  const { brandId, busy, run, startAgent, approve } = useActions()
  const a4 = data.runs.A4
  const sec = data.estrategia
  const e = (sec?.data ?? {}) as any
  const running = a4 && (a4.status === 'queued' || a4.status === 'running')
  const seg = data.brand.size_segment ?? 'pyme'
  const defMode = seg === 'micro' ? 'descubrir' : seg === 'grande' ? 'profundizar' : 'validar'
  const approved = sec?.status === 'approved'

  if (running) return <div className="flex h-full items-center justify-center p-6"><RunProgress run={a4} title="Pensando hacia dónde llevar tu marca" /></div>

  if (!e.nichos?.length) {
    return (
      <Empty icon={<Target className="size-5" />} title="¿Dónde te conviene pararte?" text={`Con tu diagnóstico te propongo hacia qué nicho ir, con la evidencia de cada opción. Como tu negocio es ${seg}, arranco en modo "${MODOS.find((m) => m.k === defMode)!.l}". Elegís vos.`}>
        <Button size="lg" onClick={() => startAgent('A4', { phase: 'nichos', modo: defMode })} disabled={!!busy}>
          {busy === 'A4' && <Loader2 className="animate-spin" />} Ver nichos recomendados
        </Button>
        {a4?.status === 'failed' && <p className="text-sm text-destructive">{a4.error}</p>}
      </Empty>
    )
  }

  const pos = e.posicionamiento
  const save = (path: string, value: unknown) => run('save', () => postJSON('/api/dossier/field', { brandId, section: 'estrategia', path, value }))

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHead
        eyebrow="Estrategia · Nicho y posicionamiento"
        title="¿Dónde te conviene pararte?"
        text="Cada opción muestra la evidencia de tu diagnóstico. Te recomiendo una, pero elegís vos."
        right={
          <div className="inline-flex rounded-lg bg-muted p-1" role="group" aria-label="Modo">
            {MODOS.map((m) => (
              <button
                key={m.k}
                disabled={approved || !!busy}
                onClick={() => startAgent('A4', { phase: 'nichos', modo: m.k })}
                className={cn('rounded-md px-3 py-1.5 text-sm', e.modo === m.k ? 'bg-card font-semibold shadow-sm' : 'text-muted-foreground')}
              >
                {m.l}
              </button>
            ))}
          </div>
        }
      />

      {e.investigacion && (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-card p-4">
            <h2 className="mb-2 font-semibold">Sub-segmentos de tu nicho</h2>
            <ul className="space-y-1.5 text-sm">{e.investigacion.sub_segmentos?.map((s: any) => <li key={s.nombre}><b>{s.nombre}:</b> {s.descripcion} <span className="text-xs text-info">· {s.fuente}</span></li>)}</ul>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <h2 className="mb-2 font-semibold">Preguntas que se hace tu nicho</h2>
            <ul className="space-y-1.5 text-sm">{e.investigacion.preguntas_frecuentes?.map((q: any) => <li key={q.pregunta}>{q.pregunta} <span className="text-xs text-info">· {q.fuente}</span></li>)}</ul>
          </div>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        {e.nichos.map((n: any) => {
          const chosen = e.nicho_elegido === n.nombre
          return (
            <article key={n.nombre} className={cn('flex flex-col gap-3 rounded-xl border bg-card p-4', n.recomendado && 'border-2 border-primary', chosen && 'bg-accent')}>
              <div className="flex flex-wrap gap-2 text-xs">
                {n.recomendado && <span className="rounded-full bg-primary px-2 py-0.5 font-semibold text-primary-foreground">Recomendado</span>}
                <span className={cn('rounded-full px-2 py-0.5', n.competencia === 'baja' ? 'bg-success/15 text-success' : n.competencia === 'media' ? 'bg-warning/20' : 'bg-destructive/15 text-destructive')}>competencia {n.competencia}</span>
              </div>
              <h3 className="text-lg font-semibold">{n.nombre}</h3>
              <p className="text-sm text-muted-foreground">{n.descripcion}</p>
              {n.porcentaje_catalogo != null && (
                <p className="flex justify-between text-sm"><span>Catálogo que encaja</span><b className="tabular-nums">{n.porcentaje_catalogo}%</b></p>
              )}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">Evidencia</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">{n.evidencia.map((ev: any, i: number) => <li key={i}>{ev.dato} <span className="text-xs text-info">· {ev.fuente}</span></li>)}</ul>
              </div>
              {n.riesgos?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Riesgos</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">{n.riesgos.map((r: string) => <li key={r}>{r}</li>)}</ul>
                </div>
              )}
              <p className="text-sm"><b>Persona:</b> {n.persona}</p>
              <div className="mt-auto">
                {chosen ? (
                  <span className="text-sm font-semibold text-success">✓ Elegido</span>
                ) : (
                  <Button size="sm" variant={n.recomendado ? 'default' : 'outline'} disabled={approved || !!busy} onClick={() => startAgent('A4', { phase: 'posicionamiento', nicho: n.nombre })}>
                    Elegir este
                  </Button>
                )}
              </div>
            </article>
          )
        })}
      </section>

      {pos && (
        <section className="space-y-3 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Tu posicionamiento <span className="text-sm font-normal text-muted-foreground">· editable</span></h2>
          <Field id="pv" label="Propuesta de valor" value={pos.propuesta_valor} disabled={approved} onSave={(v) => save('posicionamiento.propuesta_valor', v)} />
          {pos.mensajes_clave.map((m: string, i: number) => (
            <Field key={i} id={`m${i}`} label={`Mensaje clave ${i + 1}`} value={m} disabled={approved} onSave={(v) => save(`posicionamiento.mensajes_clave.${i}`, v)} />
          ))}
          <Field id="tono" label="Tono" value={pos.tono?.descripcion ?? ''} disabled={approved} onSave={(v) => save('posicionamiento.tono.descripcion', v)} />
          <p className="text-sm"><b>Persona principal:</b> {pos.persona_principal?.nombre}. {pos.persona_principal?.descripcion}</p>
        </section>
      )}

      <ApproveBar
        label="Punto de control 4 · Estrategia"
        hint={approved ? 'Aprobada. Ya podés armar el calendario.' : pos ? 'Revisá la propuesta de valor y los mensajes antes de aprobar.' : 'Elegí un nicho para ver el posicionamiento.'}
        approved={approved}
        busy={busy === 'CP4'}
        disabled={!pos}
        onApprove={() => approve('CP4', 'estrategia', 'aprobado', 'Estrategia aprobada')}
      />
    </div>
  )
}
