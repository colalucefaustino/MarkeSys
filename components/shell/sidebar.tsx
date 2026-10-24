'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  CalendarDays,
  Check,
  ImageIcon,
  Lock,
  Megaphone,
  MessageSquare,
  PenLine,
  Search,
  Sparkles,
  Store,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { TAB_GROUPS, type TabStatus } from '@/lib/tabs'
import { useBrand } from '@/components/brand/brand-context'
import { cn } from '@/lib/utils'

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  store: Store,
  search: Search,
  message: MessageSquare,
  target: Target,
  calendar: CalendarDays,
  pen: PenLine,
  image: ImageIcon,
  megaphone: Megaphone,
  chart: BarChart3,
}

const STATUS_LABEL: Record<TabStatus, string> = {
  bloqueada: 'Bloqueada',
  en_curso: 'En curso',
  esperando: 'Esperando tu aprobación',
  aprobada: 'Aprobada',
  desactualizada: 'Desactualizada',
}

function StatusMark({ status, locked }: { status?: TabStatus; locked: boolean }) {
  if (locked) return <Lock className="size-3.5 text-muted-foreground" aria-label="Bloqueada" />
  if (!status) return null
  if (status === 'aprobada')
    return (
      <span className="flex size-4 items-center justify-center rounded-full bg-success/15 text-success" title={STATUS_LABEL[status]}>
        <Check className="size-3" />
        <span className="sr-only">{STATUS_LABEL[status]}</span>
      </span>
    )
  const color = status === 'esperando' ? 'bg-warning' : status === 'desactualizada' ? 'bg-stale' : 'bg-info'
  return (
    <span className={cn('size-2 rounded-full', color)} title={STATUS_LABEL[status]}>
      <span className="sr-only">{STATUS_LABEL[status]}</span>
    </span>
  )
}

export function Sidebar() {
  const { brandId, data } = useBrand()
  const pathname = usePathname()
  const current = pathname.split('/')[3] ?? 'copiloto'

  return (
    <nav aria-label="Secciones" className="hidden w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r bg-sidebar p-3 md:flex">
      {TAB_GROUPS.map((g, gi) => (
        <div key={gi} className="flex flex-col gap-0.5">
          {g.label && (
            <p className="px-2.5 pb-1 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label}</p>
          )}
          {g.tabs.map((t) => {
            const Icon = ICONS[t.icon] ?? Sparkles
            const st = data.state.tabs[t.key]
            const active = current === t.key
            return (
              <Link
                key={t.key}
                href={`/marca/${brandId}/${t.key}`}
                aria-current={active ? 'page' : undefined}
                title={st.locked ? st.reason : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                  active ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : 'text-sidebar-foreground hover:bg-muted',
                  st.locked && !active && 'text-muted-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1 truncate">{t.label}</span>
                <StatusMark status={st.status} locked={st.locked} />
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

/** Navegación horizontal para pantallas chicas. */
export function MobileNav() {
  const { brandId, data } = useBrand()
  const pathname = usePathname()
  const current = pathname.split('/')[3] ?? 'copiloto'
  return (
    <nav aria-label="Secciones" className="flex gap-1 overflow-x-auto border-b bg-sidebar px-2 py-1.5 md:hidden">
      {TAB_GROUPS.flatMap((g) => g.tabs).map((t) => {
        const st = data.state.tabs[t.key]
        return (
          <Link
            key={t.key}
            href={`/marca/${brandId}/${t.key}`}
            aria-current={current === t.key ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm',
              current === t.key ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : 'text-muted-foreground',
            )}
          >
            {t.label}
            {st.locked && <Lock className="size-3" />}
          </Link>
        )
      })}
    </nav>
  )
}
