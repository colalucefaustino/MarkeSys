import { Check, Circle, Loader2, MinusCircle, TriangleAlert } from 'lucide-react'
import type { RunSummary } from '@/components/brand/brand-context'

export function RunProgress({ run, title }: { run: RunSummary; title: string }) {
  return (
    <div className="mx-auto w-full max-w-lg space-y-4 rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2">
        {run.status === 'failed' ? (
          <TriangleAlert className="size-4 text-destructive" />
        ) : run.status === 'done' ? (
          <Check className="size-4 text-emerald-600" />
        ) : (
          <Loader2 className="size-4 animate-spin" />
        )}
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <ul className="space-y-2">
        {run.progress.map((s) => (
          <li key={s.id} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 shrink-0">
              {s.status === 'done' ? (
                <Check className="size-4 text-emerald-600" />
              ) : s.status === 'running' ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : s.status === 'failed' ? (
                <TriangleAlert className="size-4 text-destructive" />
              ) : s.status === 'skipped' ? (
                <MinusCircle className="size-4 text-muted-foreground" />
              ) : (
                <Circle className="size-4 text-muted-foreground/50" />
              )}
            </span>
            <span className="min-w-0">
              {s.label}
              {s.detail && <span className="block text-xs text-muted-foreground">{s.detail}</span>}
            </span>
          </li>
        ))}
        {run.progress.length === 0 && <li className="text-sm text-muted-foreground">Preparando…</li>}
      </ul>
      {run.status === 'failed' && run.error && <p className="text-sm text-destructive">{run.error}</p>}
    </div>
  )
}
