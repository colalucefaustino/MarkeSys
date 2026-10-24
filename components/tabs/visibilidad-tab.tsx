'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBrand } from '@/components/brand/brand-context'
import { RunProgress } from '@/components/shared/run-progress'
import { QueriesPanel, type QueryRow } from '@/components/visibilidad/queries-panel'
import { ResultsView, type CompetitorRow, type ResultRow } from '@/components/visibilidad/results-view'

interface VisData {
  queries: QueryRow[]
  results: ResultRow[]
  competitors: CompetitorRow[]
}

const fetcher = (u: string) => fetch(u).then((r) => r.json())

export function VisibilidadTab() {
  const { brandId, data, refresh } = useBrand()
  const [starting, setStarting] = useState(false)
  const a2 = data.runs.A2
  const running = !!a2 && (a2.status === 'queued' || a2.status === 'running')

  const { data: vis, mutate } = useSWR<VisData>(
    `/api/visibility/queries?brandId=${brandId}&r=${a2?.id ?? 'none'}:${a2?.status ?? ''}`,
    fetcher,
    { keepPreviousData: true },
  )

  async function start(phase: 'generate' | 'execute') {
    setStarting(true)
    try {
      const res = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brandId, agent: 'A2', params: { phase } }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'No pude arrancar')
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Algo salió mal')
    } finally {
      setStarting(false)
    }
  }

  if (running && a2) {
    const executing = a2.input?.phase === 'execute'
    return (
      <div className="flex h-full items-center justify-center p-6">
        <RunProgress run={a2} title={executing ? 'Midiendo tu visibilidad. Puede llevar un par de minutos.' : 'Armando las búsquedas'} />
      </div>
    )
  }

  const queries = vis?.queries ?? []
  const section = data.visibilidad
  const hasResults = !!section && Object.keys(section.data ?? {}).length > 0 && section.data.puntaje_global !== undefined

  if (a2?.status === 'failed') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <RunProgress run={a2} title="No pude completar la medición" />
        <div className="flex gap-2">
          {queries.length > 0 && (
            <Button onClick={() => start('execute')} disabled={starting}>
              Reintentar medición
            </Button>
          )}
          <Button variant="outline" onClick={() => start('generate')} disabled={starting}>
            Generar búsquedas de nuevo
          </Button>
        </div>
      </div>
    )
  }

  if (hasResults && section) {
    return (
      <ResultsView
        vis={section.data}
        status={section.status}
        queries={queries}
        results={vis?.results ?? []}
        competitors={vis?.competitors ?? []}
        onChange={() => mutate()}
        onRerun={() => start('execute')}
        rerunning={starting}
      />
    )
  }

  if (queries.length > 0) {
    return <QueriesPanel queries={queries} onChange={() => mutate()} onRun={() => start('execute')} onRegenerate={() => start('generate')} busy={starting} />
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Search className="size-5 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-semibold text-balance">¿Te encuentran tus clientes?</h1>
      <p className="text-sm text-muted-foreground text-pretty">
        Armamos búsquedas como las que haría un comprador y vemos si aparecés en asistentes de IA, Google y Google Maps. Antes de medir, vas a poder revisar la lista.
      </p>
      <Button size="lg" onClick={() => start('generate')} disabled={starting}>
        {starting && <Loader2 className="animate-spin" />} Generar búsquedas
      </Button>
    </div>
  )
}
