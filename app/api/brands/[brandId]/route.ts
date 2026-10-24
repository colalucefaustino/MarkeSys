import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/supabase/server'
import { getBrand } from '@/lib/dossier'
import { getBrandState } from '@/lib/tabs'

const Patch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().max(120).nullable().optional(),
  size_segment: z.enum(['micro', 'pyme', 'grande']).nullable().optional(),
  website_url: z.string().trim().max(300).nullable().optional(),
  no_web_no_catalog: z.boolean().optional(),
})

export async function GET(_: Request, ctx: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await ctx.params
  const brand = await getBrand(brandId)
  if (!brand) return NextResponse.json({ error: 'Marca no encontrada' }, { status: 404 })
  return NextResponse.json({ brand, state: await getBrandState(brandId) })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await ctx.params
  const parsed = Patch.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { error } = await db()
    .from('brands')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', brandId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_: Request, ctx: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await ctx.params
  const { error } = await db().from('brands').delete().eq('id', brandId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
