'use client'

import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBrand } from '@/components/brand/brand-context'
import { cn } from '@/lib/utils'

export async function postJSON(url: string, body: unknown, method = 'POST') {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? 'Algo salió mal')
  return json
}

export function useActions() {
  const { brandId, refresh } = useBrand()
  const [busy, setBusy] = useState<string | null>(null)
  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key)
    try {
      await fn()
      await refresh()
      if (ok) toast.success(ok)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Algo salió mal')
    } finally {
      setBusy(null)
    }
  }
  const startAgent = (agent: string, params?: Record<string, string>) =>
    run(agent, () => postJSON('/api/agents/run', { brandId, agent, params }))
  const approve = (checkpoint: string, section: string | undefined, decision = 'aprobado', ok?: string) =>
    run(checkpoint, () => postJSON('/api/approvals', { brandId, checkpoint, section, decision }), ok)
  return { brandId, busy, run, startAgent, approve }
}

export function PageHead({ eyebrow, title, text, right }: { eyebrow: string; title: string; text?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-2xl space-y-1">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{eyebrow}</p>
        <h1 className="text-2xl font-bold tracking-tight text-balance">{title}</h1>
        {text && <p className="text-sm text-muted-foreground text-pretty">{text}</p>}
      </div>
      {right}
    </div>
  )
}

export function Empty({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">{icon}</div>
      <h1 className="text-xl font-semibold text-balance">{title}</h1>
      <p className="text-sm text-muted-foreground text-pretty">{text}</p>
      {children}
    </div>
  )
}

export function ApproveBar({
  label,
  hint,
  approved,
  busy,
  disabled,
  onApprove,
  extra,
  cta = 'Aprobar',
}: {
  label: string
  hint: string
  approved: boolean
  busy?: boolean
  disabled?: boolean
  onApprove: () => void
  extra?: ReactNode
  cta?: string
}) {
  return (
    <div
      className={cn(
        'sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-l-4 bg-card p-4 shadow-sm',
        approved ? 'border-l-success' : 'border-l-warning',
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {approved ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-sm font-medium text-success">
          <Check className="size-4" /> Aprobado
        </span>
      ) : (
        <div className="flex flex-wrap gap-2">
          {extra}
          <Button onClick={onApprove} disabled={busy || disabled}>
            {busy && <Loader2 className="animate-spin" />} {cta}
          </Button>
        </div>
      )}
    </div>
  )
}

export const money = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const fmtDate = (iso: string) => {
  const d = new Date(iso + 'T12:00:00')
  return `${d.getDate()} ${MES[d.getMonth()]}`
}
