'use client'

import { createContext, useContext, type ReactNode } from 'react'
import useSWR from 'swr'
import type { BrandState } from '@/lib/tabs'
import type { ChecklistItem } from '@/lib/checklist'
import type { ScriptedStep } from '@/lib/copilot/scripted-shared'

export interface RunSummary {
  id: string
  agent: string
  status: 'queued' | 'running' | 'done' | 'failed'
  error: string | null
  input?: Record<string, string> | null
  progress: { id: string; label: string; status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'; detail?: string }[]
  output: any
}

export interface Overview {
  brand: {
    id: string
    name: string
    city: string | null
    size_segment: string | null
    stage: string
    website_url: string | null
    no_web_no_catalog: boolean | null
  }
  state: BrandState
  checklist: ChecklistItem[]
  /** Preguntas fijas pendientes (se responden con botones, sin IA). */
  scripted: ScriptedStep[]
  media: {
    id: string
    kind: string
    original_name: string | null
    mime: string | null
    parse_status: 'pending' | 'parsing' | 'parsed' | 'failed'
    parse_summary: string | null
    created_at: string
  }[]
  ficha: { id: string; status: string; version: number; data: Record<string, any> } | null
  visibilidad: { id: string; status: string; version: number; data: Record<string, any> } | null
  percepcion: { id: string; status: string; version: number; data: Record<string, any> } | null
  estrategia: { id: string; status: string; version: number; data: Record<string, any> } | null
  calendario: { id: string; status: string; version: number; data: Record<string, any> } | null
  provenance: Record<string, { origin: 'confirmado' | 'inferido' | 'externo' | 'pendiente'; source_ref: string | null }>
  productsCount: number
  reviewsCount: number
  objectives: { id: string; description: string; deadline: string; type: string | null }[]
  channels: { id: string; type: string; handle_or_url: string | null; origin: string | null }[]
  competitors: { id: string; name: string; url: string | null; instagram: string | null }[]
  runs: { A1: RunSummary | null; A2: RunSummary | null; A3: RunSummary | null; A4: RunSummary | null; A5: RunSummary | null }
}

interface Ctx {
  brandId: string
  data: Overview
  refresh: () => Promise<unknown>
}

const BrandCtx = createContext<Ctx | null>(null)

const fetcher = (u: string) =>
  fetch(u).then((r) => {
    if (!r.ok) throw new Error('No pude cargar la marca')
    return r.json()
  })

export function BrandProvider({
  brandId,
  initial,
  children,
}: {
  brandId: string
  initial: Overview
  children: ReactNode
}) {
  const { data, mutate } = useSWR<Overview>(`/api/brands/${brandId}/overview`, fetcher, {
    fallbackData: initial,
    revalidateOnFocus: true,
    refreshInterval: (latest) => {
      const runs = latest?.runs
      const active = [runs?.A1, runs?.A2, runs?.A3, runs?.A4, runs?.A5].some((r) => r && (r.status === 'queued' || r.status === 'running'))
      const parsing = latest?.media?.some((m) => m.parse_status === 'pending' || m.parse_status === 'parsing')
      return active || parsing ? 2500 : 0
    },
  })
  return (
    <BrandCtx.Provider value={{ brandId, data: data ?? initial, refresh: () => mutate() }}>
      {children}
    </BrandCtx.Provider>
  )
}

export function useBrand() {
  const ctx = useContext(BrandCtx)
  if (!ctx) throw new Error('useBrand fuera de BrandProvider')
  return ctx
}
