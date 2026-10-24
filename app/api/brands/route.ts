import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db, must } from '@/lib/supabase/server'
import { PLACEHOLDER_BRAND_NAME } from '@/lib/brand-constants'

const Body = z.object({
  name: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  website_url: z.string().trim().max(300).optional(),
  no_web_no_catalog: z.boolean().optional(),
})

function normalizeUrl(u?: string) {
  if (!u) return null
  const t = u.trim()
  if (!t) return null
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

export async function GET() {
  const res = await db().from('brands').select('*').order('created_at', { ascending: false })
  return NextResponse.json(must(res))
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }
  const b = parsed.data
  const res = await db()
    .from('brands')
    .insert({
      name: b.name || PLACEHOLDER_BRAND_NAME,
      city: b.city || null,
      website_url: normalizeUrl(b.website_url),
      no_web_no_catalog: b.no_web_no_catalog ?? false,
    })
    .select('*')
    .single()
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })
  return NextResponse.json(res.data)
}
