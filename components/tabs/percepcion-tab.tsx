'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, MessageSquareQuote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useBrand } from '@/components/brand/brand-context'
import { Empty, PageHead, postJSON, useActions } from '@/components/tabs/shared'
import { cn } from '@/lib/utils'

/** Mismo umbral que lib/agents/strategy.ts (MIN_REVIEWS). */
const MIN_REVIEWS = 5

// Percepción ya no es una etapa propia: las reseñas se cargan acá y se analizan
// dentro de la misma llamada de Estrategia (si hay 5 o más).
export function PercepcionTab() {
  const { data } = useBrand()
  const { brandId, busy, run } = useActions()
  const [text, setText] = useState('')
  const p = data.percepcion?.data as any
  const count = data.reviewsCount
  const estrategiaOpen = !data.state.tabs.estrategia?.locked
  const hasStrategy = !!(data.estrategia?.data as any)?.nichos?.length

  const status =
    count >= MIN_REVIEWS
      ? `Tenés ${count} reseñas cargadas: se analizan cuando armes ${hasStrategy ? 'de nuevo ' : ''}tu estrategia.`
      : count > 0
        ? `Tenés ${count} reseña${count > 1 ? 's' : ''}. Con ${MIN_REVIEWS} o más se suma el análisis a tu estrategia.`
        : `Con ${MIN_REVIEWS} o más reseñas, tu estrategia también tiene en cuenta lo que dicen tus clientes.`

  const goStrategy = estrategiaOpen ? (
    <Button nativeButton={false} render={<Link href={`/marca/${brandId}/estrategia`} />}>
      {hasStrategy ? 'Ver mi estrategia' : 'Ir a Nicho y posicionamiento'} <ArrowRight />
    </Button>
  ) : (
    <p className="text-sm text-muted-foreground">La estrategia se habilita cuando apruebes el diagnóstico de Visibilidad.</p>
  )

  const pasteBox = (
    <div className="w-full space-y-2 text-left">
      <label htmlFor="reviews" className="text-sm font-medium">Pegá reseñas de clientes (una por línea)</label>
      <Textarea id="reviews" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej.: Me atendieron re bien y me asesoraron con el talle…" />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          disabled={!text.trim() || !!busy}
          onClick={() => run('paste', async () => { await postJSON('/api/reviews', { brandId, text }); setText('') }, 'Reseñas guardadas')}
        >
          Guardar reseñas
        </Button>
        <p className="text-sm text-muted-foreground">{status}</p>
      </div>
    </div>
  )

  if (!p?.temas) {
    return (
      <Empty
        icon={<MessageSquareQuote className="size-5" />}
        title="¿Qué valoran de vos tus clientes?"
        text="Pegá reseñas de Google, Instagram o WhatsApp, o subilas en Medios. Las comparo con lo que vos comunicás cuando arme tu estrategia, en la misma pasada."
      >
        {pasteBox}
        {goStrategy}
      </Empty>
    )
  }

  const max = Math.max(1, ...p.temas.map((t: any) => t.menciones))
  const brechas = (p.brechas ?? []) as any[]

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHead
        eyebrow="Diagnóstico · Percepción"
        title="Tu marca no es solo lo que creés"
        text={`Analicé ${p.cantidad_resenas} reseñas junto con tu estrategia y las comparé con lo que vos comunicás.`}
        right={goStrategy}
      />

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

      {brechas.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Coincidencias y brechas</h2>
          {brechas.map((b, i) => (
            <div key={i} className={cn('rounded-xl border p-4', b.tipo === 'brecha' ? 'bg-warning/10' : 'bg-success/10')}>
              <div className="grid gap-3 text-sm md:grid-cols-3">
                <div><p className="text-xs font-semibold text-muted-foreground uppercase">Vos decís</p>{b.dueno_dice}</div>
                <div><p className="text-xs font-semibold text-muted-foreground uppercase">Tus clientes valoran</p>{b.clientes_valoran}</div>
                <div><p className="text-xs font-semibold text-muted-foreground uppercase">Tu comunicación muestra</p>{b.comunicacion_muestra}</div>
              </div>
              {b.tipo === 'brecha' && b.pregunta && (
                <p className="mt-3 text-sm"><span className="font-medium">Para pensar:</span> {b.pregunta}</p>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-3 font-semibold">Sumar más reseñas</h2>
        {pasteBox}
      </section>
    </div>
  )
}
