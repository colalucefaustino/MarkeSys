'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { Sparkles } from 'lucide-react'
import type { AiStatus } from '@/lib/ai-status'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null))
const TZ = 'America/Argentina/Buenos_Aires'

/** "hoy a las 4:00", "mañana a las 4:00" o "el jueves 30/10 a las 4:00" en hora argentina. */
function whenBack(iso: string | null) {
  if (!iso) return 'cuando se renueve el cupo'
  const d = new Date(iso)
  const day = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: TZ })
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const hour = d.toLocaleTimeString('es-AR', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hourCycle: 'h23' })
  if (day(d) === day(now)) return `hoy a las ${hour}`
  if (day(d) === day(tomorrow)) return `mañana a las ${hour}`
  return `el ${d.toLocaleDateString('es-AR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'numeric' })} a las ${hour}`
}

const usd = (n: number) => `US$\u00a0${n.toFixed(2).replace('.', ',')}`

function describe(s: AiStatus): { label: string; detail: string; tone: string } | null {
  switch (s.estado) {
    case 'respaldo':
      return {
        label: 'IA en respaldo',
        detail:
          `Se terminó el cupo diario del servicio de IA principal. Todo sigue funcionando con el servicio de respaldo y el principal vuelve ${whenBack(s.gemini_vuelve)}.` +
          (s.saldo_gateway !== null ? ` Crédito de respaldo: ${usd(s.saldo_gateway)}.` : ''),
        tone: 'border-info/40 bg-info/10 text-info',
      }
    case 'credito_bajo':
      return {
        label: 'Crédito de IA bajo',
        detail: `Quedan ${usd(s.saldo_gateway ?? 0)} de crédito de respaldo. Hoy todo funciona normal; si se termina el cupo diario, algunas funciones van a tener que esperar a que se renueve.`,
        tone: 'border-warning/50 bg-warning/10 text-[#8a5f00]',
      }
    case 'sin_ia':
      return {
        label: 'IA en pausa',
        detail: `Se terminó el cupo diario de IA y el crédito de respaldo. Vuelve ${whenBack(s.gemini_vuelve)}. Mientras tanto podés revisar y editar todo lo que ya está armado.`,
        tone: 'border-stale/40 bg-stale/10 text-stale',
      }
    default:
      return null
  }
}

/** Indicador chico en la barra superior. Solo aparece cuando la IA tiene algún límite. */
export function AiStatusPill() {
  const { data } = useSWR<AiStatus | null>('/api/ai/status', fetcher, {
    refreshInterval: 5 * 60_000,
    revalidateOnFocus: true,
  })
  return data ? <AiStatusView status={data} /> : null
}

export function AiStatusView({ status, defaultOpen = false }: { status: AiStatus; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const info = describe(status)
  if (!info) return null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', info.tone)}
      >
        <Sparkles className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">{info.label}</span>
        <span className="sr-only sm:hidden">{info.label}</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={info.label}
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border bg-card p-3 text-sm shadow-lg"
        >
          <p className="font-medium">{info.label}</p>
          <p className="mt-1 text-muted-foreground">{info.detail}</p>
        </div>
      )}
    </div>
  )
}
