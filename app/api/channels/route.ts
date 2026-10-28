import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/supabase/server'

const Body = z.object({
  brandId: z.string().uuid(),
  type: z.enum(['instagram', 'tiktok']),
  handle: z.string().trim().min(2).max(120),
})

/** "https://instagram.com/lola.ropa/?hl=es" o "@lola.ropa" → "@lola.ropa" */
function cleanHandle(h: string) {
  const user = h
    .trim()
    .replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\/@?/i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
  return /^[a-z0-9._]{2,40}$/i.test(user) ? `@${user}` : null
}

/** Cargar o reemplazar el Instagram o TikTok del negocio. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { brandId, type, handle } = parsed.data
  const clean = cleanHandle(handle)
  if (!clean) return NextResponse.json({ error: 'Escribí el usuario tal como aparece, por ejemplo @lola.ropa' }, { status: 400 })
  await db().from('brand_channels').delete().eq('brand_id', brandId).eq('type', type)
  const { error } = await db().from('brand_channels').insert({ brand_id: brandId, type, handle_or_url: clean, origin: 'confirmado' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await db().from('brands').update({ updated_at: new Date().toISOString() }).eq('id', brandId)
  return NextResponse.json({ ok: true, handle: clean })
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  await db().from('brand_channels').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
