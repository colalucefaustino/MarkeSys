import { getDossier, provenanceMap } from '@/lib/dossier'
import { getBrandState } from '@/lib/tabs'
import { computeChecklist } from '@/lib/checklist'
import { pendingScriptedSteps } from '@/lib/copilot/scripted'
import { latestRun } from '@/lib/agents/runs'
import type { Overview } from '@/components/brand/brand-context'

export async function getOverview(brandId: string): Promise<Overview | null> {
  const [d, state, a1, a2, a3, a4, a5] = await Promise.all([
    getDossier(brandId),
    getBrandState(brandId),
    latestRun(brandId, 'A1'),
    latestRun(brandId, 'A2'),
    latestRun(brandId, 'A3'),
    latestRun(brandId, 'A4'),
    latestRun(brandId, 'A5'),
  ])
  if (!d.brand || !state) return null
  return {
    brand: d.brand,
    state,
    checklist: computeChecklist(d),
    scripted: pendingScriptedSteps(d),
    media: d.media,
    ficha: d.sections.ficha ?? null,
    visibilidad: d.sections.visibilidad ?? null,
    percepcion: d.sections.percepcion ?? null,
    estrategia: d.sections.estrategia ?? null,
    calendario: d.sections.calendario ?? null,
    provenance: provenanceMap(d),
    productsCount: d.products.length,
    reviewsCount: d.reviewsCount,
    objectives: d.objectives.map((o) => ({ id: o.id, description: o.description, deadline: o.deadline, type: o.type })),
    channels: d.channels.map((c) => ({ id: c.id, type: c.type, handle_or_url: c.handle_or_url, origin: c.origin })),
    competitors: d.competitors.map((c) => ({ id: c.id, name: c.name, url: c.url, instagram: c.instagram })),
    runs: { A1: a1 as any, A2: a2 as any, A3: a3 as any, A4: a4 as any, A5: a5 as any },
  } as Overview
}
