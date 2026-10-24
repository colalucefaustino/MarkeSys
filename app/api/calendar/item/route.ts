import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/supabase/server'
import { latestSections } from '@/lib/dossier'

const Body = z.object({
  brandId: z.string().uuid(),
  itemId: z.string(),
  patch: z.object({
    status: z.enum(['propuesta', 'aprobada', 'descartada', 'producida']).optional(),
    copy: z.string().max(2000).optional(),
    idea: z.string().max(500).optional(),
    script: z.any().optional(),
  }),
})

export async function PATCH(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { brandId, itemId, patch } = parsed.data
  const { latest } = await latestSections(brandId)
  const row = latest.calendario
  if (!row) return NextResponse.json({ error: 'No hay calendario' }, { status: 404 })
  const data = structuredClone(row.data ?? {}) as any
  data.items = (data.items ?? []).map((i: any) => (i.id === itemId ? { ...i, ...patch } : i))
  if (patch.status === undefined && 'all' === itemId) data.items = data.items
  await db().from('dossier_sections').update({ data }).eq('id', row.id)
  return NextResponse.json({ ok: true })
}

/** Aprobar todo lo que está como propuesta (CP5). */
export async function POST(req: Request) {
  const b = z.object({ brandId: z.string().uuid() }).safeParse(await req.json().catch(() => null))
  if (!b.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { latest } = await latestSections(b.data.brandId)
  const row = latest.calendario
  if (!row) return NextResponse.json({ error: 'No hay calendario' }, { status: 404 })
  const data = structuredClone(row.data ?? {}) as any
  data.items = (data.items ?? []).map((i: any) => (i.status === 'propuesta' ? { ...i, status: 'aprobada' } : i))
  await db().from('dossier_sections').update({ data }).eq('id', row.id)
  return NextResponse.json({ ok: true })
}
