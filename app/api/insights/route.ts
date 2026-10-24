import { NextResponse } from 'next/server'
import { z } from 'zod'
import { generateObject } from 'ai'
import { db } from '@/lib/supabase/server'
import { MODEL_FAST } from '@/lib/ai'

export const maxDuration = 120

export async function POST(req: Request) {
  const b = z.object({ brandId: z.string().uuid() }).safeParse(await req.json().catch(() => null))
  if (!b.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const brandId = b.data.brandId
  const [m, p, o] = await Promise.all([
    db().from('sales_monthly').select('month,total,orders').eq('brand_id', brandId).order('month'),
    db().from('sales_products').select('product,total,units').eq('brand_id', brandId).order('total', { ascending: false }).limit(10),
    db().from('objectives').select('description,deadline').eq('brand_id', brandId),
  ])
  if (!m.data?.length) return NextResponse.json({ error: 'No hay ventas cargadas' }, { status: 400 })
  try {
    const { object } = await generateObject({
      model: MODEL_FAST,
      schema: z.object({ hallazgos: z.array(z.object({ titulo: z.string(), dato: z.string(), accion: z.string() })).length(3) }),
      prompt: `Sos analista de un comercio argentino. Dá 3 hallazgos basados SOLO en estos números, cada uno con una acción concreta, en voseo.
Ventas por mes: ${JSON.stringify(m.data)}
Ventas por producto: ${JSON.stringify(p.data)}
Objetivos: ${JSON.stringify(o.data)}`,
    })
    await db().from('insights').insert({ brand_id: brandId, kind: 'ventas', data: object.hallazgos })
    return NextResponse.json({ insights: object.hallazgos })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No pude analizar' }, { status: 500 })
  }
}
