import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/supabase/server'

const TYPES = ['ventas', 'awareness', 'lanzamiento', 'liquidar_stock', 'fidelizacion', 'apertura_local', 'posicionamiento', 'otro'] as const

const Body = z.object({
  brandId: z.string().uuid(),
  objectives: z
    .array(
      z.object({
        description: z.string().trim().min(3).max(200),
        type: z.string().optional(),
        deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
        metric: z.string().max(80).optional(),
        target: z.number().optional(),
        proposed_by: z.enum(['copiloto', 'cliente']).optional(),
      }),
    )
    .min(1)
    .max(10),
})

/** Guarda los objetivos que el dueño eligió o escribió en la tarjeta de objetivos. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  const { brandId, objectives } = parsed.data
  const { count } = await db().from('objectives').select('id', { count: 'exact', head: true }).eq('brand_id', brandId)
  const rows = objectives.map((o, i) => ({
    brand_id: brandId,
    type: (TYPES as readonly string[]).includes(o.type ?? '') ? o.type : 'otro',
    description: o.description,
    deadline: o.deadline,
    metric: o.metric ?? null,
    target_value: o.target ?? null,
    priority: (count ?? 0) + i + 1,
    proposed_by: o.proposed_by ?? 'cliente',
    origin: 'confirmado',
  }))
  const { error } = await db().from('objectives').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ saved: rows.length })
}
