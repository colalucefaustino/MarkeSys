import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const brandId = new URL(req.url).searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'Falta brandId' }, { status: 400 })
  const [m, p, ins] = await Promise.all([
    db().from('sales_monthly').select('month,total,orders,is_demo').eq('brand_id', brandId).order('month'),
    db().from('sales_products').select('product,total,units,is_demo').eq('brand_id', brandId).order('total', { ascending: false }).limit(8),
    db().from('insights').select('data,created_at').eq('brand_id', brandId).eq('kind', 'ventas').order('created_at', { ascending: false }).limit(1),
  ])
  return NextResponse.json({ months: m.data ?? [], products: p.data ?? [], insights: ins.data?.[0]?.data ?? null })
}

/** Carga ventas de ejemplo (rotuladas is_demo). */
export async function POST(req: Request) {
  const b = z.object({ brandId: z.string().uuid() }).safeParse(await req.json().catch(() => null))
  if (!b.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const brandId = b.data.brandId
  const base = [3.1, 3.4, 3.2, 3.9, 4.4, 4.1]
  const now = new Date()
  const months = base.map((v, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { brand_id: brandId, month: d.toISOString().slice(0, 7), total: Math.round(v * 1e6), orders: Math.round((v * 1e6) / 31000), is_demo: true }
  })
  const { data: prods } = await db().from('products').select('name').eq('brand_id', brandId).limit(6)
  const names = (prods ?? []).map((p) => p.name)
  const fallback = ['Producto A', 'Producto B', 'Producto C', 'Producto D']
  const products = (names.length ? names : fallback).map((n, i) => ({ brand_id: brandId, product: n, total: Math.round((6 - i) * 820000), units: (6 - i) * 30, is_demo: true }))
  await db().from('sales_monthly').delete().eq('brand_id', brandId)
  await db().from('sales_products').delete().eq('brand_id', brandId)
  await db().from('sales_monthly').insert(months)
  await db().from('sales_products').insert(products)
  return NextResponse.json({ ok: true })
}
