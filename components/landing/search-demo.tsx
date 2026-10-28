'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

// Una búsqueda real del diagnóstico de la marca de ejemplo (Café Ombú, lib/demo/seed.ts),
// mostrada como en la app: canal por canal, si aparece y quién aparece en su lugar.
const QUERY = 'cafetería de especialidad en Rosario'
const ROWS = [
  { channel: 'Asistentes de IA', result: 'No te nombran', found: false },
  { channel: 'Google', result: 'No estás entre los 10 primeros', found: false },
  { channel: 'Google Maps', result: 'Aparecés en el puesto 7', found: true },
]
const RIVALS = ['Tostado Café Club', 'Cafetería Bloom', 'La Tostadora Rosario']

export function SearchDemo() {
  const [typed, setTyped] = useState(0)
  const [shown, setShown] = useState(0)

  // Un solo momento animado: se escribe la búsqueda y aparecen los resultados.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTyped(QUERY.length)
      setShown(ROWS.length + 1)
      return
    }
    let i = 0
    const type = setInterval(() => {
      i++
      setTyped(i)
      if (i >= QUERY.length) {
        clearInterval(type)
        let r = 0
        const reveal = setInterval(() => {
          r++
          setShown(r)
          if (r > ROWS.length) clearInterval(reveal)
        }, 380)
      }
    }, 38)
    return () => clearInterval(type)
  }, [])

  return (
    <figure className="w-full">
      <div className="rounded-[22px] border border-border bg-card p-4 shadow-[0_24px_60px_-28px_rgba(59,42,31,0.35)] sm:p-5">
        <div className="flex items-center gap-3 rounded-full border border-border bg-background px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 truncate text-[15px]" aria-label={QUERY}>
            {QUERY.slice(0, typed)}
            {typed < QUERY.length && <span className="ml-px inline-block h-4 w-px translate-y-0.5 animate-pulse bg-foreground" />}
          </span>
        </div>

        <ul className="mt-4 divide-y divide-border">
          {ROWS.map((r, i) => (
            <li
              key={r.channel}
              className={cn(
                'flex items-baseline justify-between gap-4 py-3 transition-opacity duration-500',
                shown > i ? 'opacity-100' : 'opacity-0',
              )}
            >
              <span className="text-sm text-muted-foreground">{r.channel}</span>
              <span className={cn('text-right text-[15px] font-medium', r.found ? 'text-success' : 'text-foreground')}>
                {r.result}
              </span>
            </li>
          ))}
        </ul>

        <div
          className={cn(
            'mt-2 rounded-2xl bg-accent px-4 py-3 transition-opacity duration-500',
            shown > ROWS.length ? 'opacity-100' : 'opacity-0',
          )}
        >
          <p className="text-sm text-accent-foreground">Quién aparece en tu lugar</p>
          <p className="mt-0.5 font-semibold">{RIVALS.join(', ')}</p>
        </div>
      </div>
      <figcaption className="mt-3 px-1 text-sm text-muted-foreground">
        Una de las búsquedas del diagnóstico de Café Ombú, la marca de ejemplo.
      </figcaption>
    </figure>
  )
}
