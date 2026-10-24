import { after } from 'next/server'
import { db } from '@/lib/supabase/server'
import { createRun, RunProgress, type AgentKey } from '@/lib/agents/runs'
import { latestSections } from '@/lib/dossier'

export type StartResult =
  | { ok: true; runId: string; agent: AgentKey }
  | { ok: false; error: string }

/** Encola un agente y lo ejecuta en segundo plano con `after`. */
export async function startAgent(
  brandId: string,
  agent: AgentKey,
  params: Record<string, string> = {},
): Promise<StartResult> {
  if (!['A1', 'A2', 'A3', 'A4', 'A5'].includes(agent)) {
    return { ok: false, error: `El agente ${agent} todavía no está disponible.` }
  }

  if (agent !== 'A1') {
    const { approvedEver } = await latestSections(brandId)
    if (!approvedEver.ficha) return { ok: false, error: 'Primero hay que aprobar la Ficha de marca (CP1).' }
    if (agent === 'A4' && !approvedEver.visibilidad) return { ok: false, error: 'Falta aprobar el diagnóstico de Visibilidad.' }
    if (agent === 'A5' && !approvedEver.estrategia) return { ok: false, error: 'Falta aprobar la estrategia.' }
  }

  const run = await createRun(brandId, agent, params)

  after(async () => {
    const progress = new RunProgress(run.id)
    try {
      if (agent === 'A1') {
        const { runA1 } = await import('@/lib/agents/a1')
        await runA1(brandId, run.id, progress, params)
      } else if (agent === 'A2') {
        const { runA2 } = await import('@/lib/agents/a2')
        await runA2(brandId, run.id, progress, params)
      } else {
        const st = await import('@/lib/agents/strategy')
        if (agent === 'A3') await st.runA3(brandId, run.id, progress)
        else if (agent === 'A4') await st.runA4(brandId, run.id, progress, params)
        else await st.runA5(brandId, run.id, progress)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error inesperado'
      console.log('[v0] agent failed', agent, message)
      await progress.fail(message)
      if (agent === 'A1') {
        await db().from('media').update({ parse_status: 'failed' }).eq('brand_id', brandId).eq('parse_status', 'parsing')
      }
    }
  })

  return { ok: true, runId: run.id, agent }
}
