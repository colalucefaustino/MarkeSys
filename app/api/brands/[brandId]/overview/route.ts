import { NextResponse } from 'next/server'
import { getOverview } from '@/lib/overview'

export const dynamic = 'force-dynamic'

export async function GET(_: Request, ctx: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await ctx.params
  const overview = await getOverview(brandId)
  if (!overview) return NextResponse.json({ error: 'Marca no encontrada' }, { status: 404 })
  return NextResponse.json(overview)
}
