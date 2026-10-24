import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const brandId = new URL(req.url).searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'Falta brandId' }, { status: 400 })

  const { data: queries } = await db()
    .from('visibility_queries')
    .select('id,text,kind,approved,origin')
    .eq('brand_id', brandId)
    .order('kind')
    .order('id')
  const ids = (queries ?? []).map((q) => q.id)
  const { data: results } = ids.length
    ? await db().from('visibility_results').select('query_id,channel,status,appears,position,mentions,sources').in('query_id', ids)
    : { data: [] as any[] }
  const { data: competitors } = await db()
    .from('competitors')
    .select('id,name,url,instagram,source,detected_in,confirmed')
    .eq('brand_id', brandId)
    .order('source')

  return NextResponse.json({ queries: queries ?? [], results: results ?? [], competitors: competitors ?? [] })
}

const Create = z.object({ brandId: z.string().uuid(), text: z.string().trim().min(4).max(140) })

export async function POST(req: Request) {
  const parsed = Create.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Escribí una búsqueda de al menos 4 caracteres' }, { status: 400 })
  const { count } = await db().from('visibility_queries').select('id', { count: 'exact', head: true }).eq('brand_id', parsed.data.brandId)
  if ((count ?? 0) >= 20) return NextResponse.json({ error: 'El máximo es de 20 búsquedas.' }, { status: 400 })
  const { data, error } = await db()
    .from('visibility_queries')
    .insert({ brand_id: parsed.data.brandId, text: parsed.data.text, kind: 'cliente', approved: true, origin: 'cliente' })
    .select('id,text,kind,approved,origin')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ query: data })
}

const Patch = z.object({ id: z.string().uuid(), text: z.string().trim().min(4).max(140) })

export async function PATCH(req: Request) {
  const parsed = Patch.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  await db().from('visibility_queries').update({ text: parsed.data.text, origin: 'cliente' }).eq('id', parsed.data.id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  await db().from('visibility_queries').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
