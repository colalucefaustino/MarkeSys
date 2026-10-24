import { cn } from '@/lib/utils'

export type Origin = 'confirmado' | 'inferido' | 'externo' | 'pendiente'

const MAP: Record<Origin, { label: string; className: string }> = {
  confirmado: { label: 'Confirmado', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  inferido: { label: 'Inferido', className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  externo: { label: 'Externo', className: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  pendiente: { label: 'Falta', className: 'border-border bg-muted text-muted-foreground' },
}

export function ProvenanceBadge({
  origin,
  source,
  onClick,
}: {
  origin: Origin
  source?: string | null
  onClick?: () => void
}) {
  const m = MAP[origin]
  const cls = cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none', m.className)
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={source ? `Fuente: ${source}. Tocá para confirmar.` : 'Tocá para confirmar'} className={cn(cls, 'hover:brightness-95')}>
        {m.label} · confirmar
      </button>
    )
  }
  return (
    <span className={cls} title={source ? `Fuente: ${source}` : undefined}>
      {m.label}
    </span>
  )
}
