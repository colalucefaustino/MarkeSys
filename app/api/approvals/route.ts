import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/supabase/server'
import { latestSections, type SectionKey } from '@/lib/dossier'

const Body = z.object({
  brandId: z.string().uuid(),
  checkpoint: z.enum(['CP1', 'CP2a', 'CP2', 'CP3', 'CP4a', 'CP4', 'CP5', 'CP6']),
  section: z.enum(['ficha', 'visibilidad', 'percepcion', 'estrategia', 'calendario']).optional(),
  decision: z.enum(['aprobado', 'editado', 'rechazado', 'salteado']),
  comment: z.string().max(1000).optional(),
})

const STAGE_AFTER: Record<string, string> = {
  CP1: 'diagnostico',
  CP2: 'diagnostico',
  CP3: 'estrategia',
  CP4: 'plan',
  CP5: 'ejecucion',
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const b = parsed.data

  await db().from('approvals').insert({
    brand_id: b.brandId,
    checkpoint: b.checkpoint,
    section: b.section ?? null,
    decision: b.decision,
    comment: b.comment ?? null,
  })

  if (b.section && b.decision === 'aprobado') {
    const { latest } = await latestSections(b.brandId)
    const row = latest[b.section as SectionKey]
    if (!row) return NextResponse.json({ error: 'La sección todavía no existe' }, { status: 400 })
    await db()
      .from('dossier_sections')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', row.id)
  }

  if (b.section && b.decision === 'rechazado') {
    const { latest } = await latestSections(b.brandId)
    const row = latest[b.section as SectionKey]
    if (row) await db().from('dossier_sections').update({ status: 'draft' }).eq('id', row.id)
  }

  if (b.decision === 'aprobado' && STAGE_AFTER[b.checkpoint]) {
    const { data: brand } = await db().from('brands').select('stage').eq('id', b.brandId).single()
    const order = ['arranque', 'onboarding', 'diagnostico', 'estrategia', 'plan', 'ejecucion']
    const next = STAGE_AFTER[b.checkpoint]
    if (brand && order.indexOf(next) > order.indexOf(brand.stage)) {
      await db().from('brands').update({ stage: next, updated_at: new Date().toISOString() }).eq('id', b.brandId)
    }
  }

  return NextResponse.json({ ok: true })
}
