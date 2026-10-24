'use client'

import Link from 'next/link'
import { Logo } from '@/components/logo'
import { BrandSwitcher } from '@/components/shell/brand-switcher'
import { STAGES, stageIndex } from '@/lib/tabs'
import { useBrand } from '@/components/brand/brand-context'
import { cn } from '@/lib/utils'

export function Topbar() {
  const { data } = useBrand()
  const idx = stageIndex(data.brand.stage)
  const score = data.state.visibilityScore

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-card px-4">
      <Link href="/" className="flex items-center gap-2" aria-label="Inicio">
        <Logo />
      </Link>
      <div className="hidden h-6 w-px bg-border sm:block" />
      <div className="min-w-0">
        <BrandSwitcher />
      </div>

      <ol className="mx-auto hidden items-center gap-1 lg:flex" aria-label="Etapa del proyecto">
        {STAGES.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1">
            <span
              aria-current={i === idx ? 'step' : undefined}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs',
                i < idx && 'text-success',
                i === idx && 'bg-accent font-medium text-accent-foreground',
                i > idx && 'text-muted-foreground',
              )}
            >
              {s.label}
            </span>
            {i < STAGES.length - 1 && <span className="h-px w-4 bg-border" />}
          </li>
        ))}
      </ol>

      <div className="ml-auto flex items-center gap-3">
        {score !== null && (
          <span className="rounded-full border px-2.5 py-1 text-xs">
            Visibilidad <strong className="font-semibold">{score}</strong>/100
          </span>
        )}
      </div>
    </header>
  )
}
