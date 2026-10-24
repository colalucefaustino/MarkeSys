import { NextResponse } from 'next/server'
import { db } from '@/lib/supabase/server'
import { getBrand } from '@/lib/dossier'
import { startAgent } from '@/lib/agents/start'
import { isPlaceholderName } from '@/lib/brand-constants'

export const maxDuration = 300

export async function POST(_: Request, ctx: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await ctx.params
  const brand = await getBrand(brandId)
  if (!brand) return NextResponse.json({ error: 'Marca no encontrada' }, { status: 404 })

  const { count } = await db().from('media').select('id', { count: 'exact', head: true }).eq('brand_id', brandId).in('kind', ['catalogo', 'stock'])
  const ok = !isPlaceholderName(brand.name) && !!brand.city && (!!brand.website_url || (count ?? 0) > 0 || !!brand.no_web_no_catalog)
  if (!ok) {
    return NextResponse.json({ error: 'Falta nombre, ciudad y web, catálogo o la casilla "No tengo".' }, { status: 400 })
  }

  await db().from('brands').update({ stage: 'onboarding', updated_at: new Date().toISOString() }).eq('id', brandId)
  const res = await startAgent(brandId, 'A1', {})
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 })
  return NextResponse.json({ runId: res.runId })
}
