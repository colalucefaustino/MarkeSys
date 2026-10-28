import { NextResponse } from 'next/server'
import { friendlyAiError } from '@/lib/ai'
import { z } from 'zod'
import { db } from '@/lib/supabase/server'
import { latestSections } from '@/lib/dossier'
import { writeScript } from '@/lib/agents/strategy'

export const maxDuration = 120

export async function POST(req: Request) {
  const b = z.object({ brandId: z.string().uuid(), itemId: z.string() }).safeParse(await req.json().catch(() => null))
  if (!b.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { latest } = await latestSections(b.data.brandId)
  const row = latest.calendario
  const item = (row?.data as any)?.items?.find((i: any) => i.id === b.data.itemId)
  if (!row || !item) return NextResponse.json({ error: 'No encontré la pieza' }, { status: 404 })
  try {
    const script = await writeScript(b.data.brandId, item)
    const data = structuredClone(row.data) as any
    data.items = data.items.map((i: any) => (i.id === item.id ? { ...i, script } : i))
    await db().from('dossier_sections').update({ data }).eq('id', row.id)
    return NextResponse.json({ script })
  } catch (e) {
    return NextResponse.json({ error: friendlyAiError(e) ?? (e instanceof Error ? e.message : 'No pude escribir el guion') }, { status: 500 })
  }
}
