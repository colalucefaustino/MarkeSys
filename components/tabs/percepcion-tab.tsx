'use client'

import { useState } from 'react'
import { MessageSquareQuote, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useBrand } from '@/components/brand/brand-context'
import { RunProgress } from '@/components/shared/run-progress'
import { ApproveBar, Empty, PageHead, postJSON, useActions } from '@/components/tabs/shared'
import { cn } from '@/lib/utils'

export function PercepcionTab() {
  const { data } = useBrand()
  const { brandId, busy, run, startAgent, approve } = useActions()
  const [text, setText] = useState('')
  const a3 = data.runs.A3
  const sec = data.percepcion
  const p = sec?.data as any
  const running = a3 && (a3.status === 'queued' || a3.status === 'running')
  const skipped = data.state.tabs.estrategia && !data.state.tabs.estrategia.locked
  const skipBtn = (
    <Button variant="ghost" onClick={() => approve('CP3', undefined, 'salteado', 'Salteaste Percepción. Seguí en Nicho y posicionamiento.')} disabled={busy === 'CP3'}>
      {busy === 'CP3' && <Loader2 className="animate-spin" />} Saltear este paso
    </Button>
  )

  if (running)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <RunProgress run={a3} title="Analizando lo que dicen tus clientes" />
        <p className="text-sm text-muted-foreground">¿Tarda demasiado? Podés seguir sin este paso.</p>
        {skipBtn}
      </div>
    )

  const pasteBox = (
    <div className="w-full space-y-2 text-left">
      <label htmlFor="reviews" className="text-sm font-medium">Pegá reseñas de clientes (una por línea)</label>
      <Textarea id="reviews" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: Me atendieron re bien y me asesoraron con el talle…" />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={!text.trim() || !!busy}
          onClick={() => run('paste', async () => { await postJSON('/api/reviews', { brandId, text }); setText('') }, 'Reseñas guardadas')}
        >
          Guardar reseñas
        </Button>
        <Button disabled={!data.reviewsCount || !!busy} onClick={() => startAgent('A3')}>
          {busy === 'A3' && <Loader2 className="animate-spin" />} Analizar {data.reviewsCount ? `${data.reviewsCount} reseñas` : ''}
        </Button>
      </div>
    </div>
  )

  if (!p?.temas) {
    return (
      <Empty icon={<MessageSquareQuote className="size-5" />} title="¿Qué valoran de vos tus clientes?" text="Comparamos lo que vos decís de tu marca con lo que dicen tus clientes. Pegá reseñas de Google, Instagram o WhatsApp, o subilas en Medios.">
        {pasteBox}
        {a3?.status === 'failed' && <p className="text-sm text-destructive">{a3.error}</p>}
        {skipped ? <p className="text-sm text-success">Paso salteado. Ya podés seguir en Nicho y posicionamiento.</p> : skipBtn}
      </Empty>
    )
  }

  const max = Math.max(1, ...p.temas.map((t: any) => t.menciones))
  const respuestas = p.respuestas ?? {}
  const brechas = (p.brechas ?? []) as any[]
  const pendientes = brechas.filter((b, i) => b.tipo === 'brecha' && !respuestas[i]).length
  const approved = sec?.status === 'approved'

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHead
        eyebrow="Diagnóstico · Percepción"
        title="Tu marca no es solo lo que creés"
        text={`Analizamos ${p.cantidad_resenas} reseñas y las comparamos con lo que vos comunicás.`}
        right={<Button variant="outline" size="sm" onClick={() => startAgent('A3')} disabled={!!busy}>Volver a analizar</Button>}
      />
      {!p.suficiente && <p className="rounded-lg bg-warning/15 px-4 py-2 text-sm">Hay menos de 5 reseñas: tomalo como un indicio, no como una conclusión.</p>}

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-3 font-semibold">Lo que más mencionan</h2>
        <ul className="space-y-3">
          {p.temas.map((t: any) => (
            <li key={t.tema}>
              <div className="flex justify-between gap-2 text-sm">
                <span className="font-medium">{t.tema}</span>
                <span className="tabular-nums text-muted-foreground">{t.menciones} reseñas · {t.sentimiento}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-muted">
                <div className={cn('h-2 rounded-full', t.sentimiento === 'negativo' ? 'bg-destructive' : t.sentimiento === 'mixto' ? 'bg-warning' : 'bg-primary')} style={{ width: `${(t.menciones / max) * 100}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">“{t.ejemplo}”</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Coincidencias y brechas</h2>
        {brechas.map((b, i) => (
          <div key={i} className={cn('rounded-xl border p-4', b.tipo === 'brecha' ? 'bg-warning/10' : 'bg-success/10')}>
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <div><p className="text-xs font-semibold text-muted-foreground uppercase">Vos decís</p>{b.dueno_dice}</div>
              <div><p className="text-xs font-semibold text-muted-foreground uppercase">Tus clientes valoran</p>{b.clientes_valoran}</div>
              <div><p className="text-xs font-semibold text-muted-foreground uppercase">Tu comunicación muestra</p>{b.comunicacion_muestra}</div>
            </div>
            {b.tipo === 'brecha' && (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-medium">{b.pregunta}</p>
                <div className="flex flex-wrap gap-2">
                  {b.opciones.map((o: string) => (
                    <Button
                      key={o}
                      size="sm"
                      variant={respuestas[i] === o ? 'default' : 'outline'}
                      disabled={approved}
                      onClick={() => run('ans', () => postJSON('/api/dossier/field', { brandId, section: 'percepcion', path: `respuestas.${i}`, value: o }))}
                    >
                      {o}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </section>

      <ApproveBar
        label="Punto de control 3 · Percepción"
        hint={approved ? 'Aprobada.' : pendientes ? `Respondé ${pendientes} pregunta${pendientes > 1 ? 's' : ''} para definir qué reforzar.` : 'Tus respuestas definen qué refuerza la estrategia.'}
        approved={approved}
        busy={busy === 'CP3'}
        disabled={pendientes > 0}
        onApprove={() => approve('CP3', 'percepcion', 'aprobado', 'Percepción aprobada')}
        extra={skipBtn}
      />
    </div>
  )
}
