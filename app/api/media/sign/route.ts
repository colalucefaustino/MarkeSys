import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/supabase/server'

const Body = z.object({ brandId: z.string().uuid(), filename: z.string().min(1).max(200) })

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const safe = parsed.data.filename.normalize('NFD').replace(/[^\w.\-]+/g, '_')
  const path = `${parsed.data.brandId}/${crypto.randomUUID()}-${safe}`
  const { data, error } = await db().storage.from('brand-files').createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'No pude preparar la subida' }, { status: 500 })
  return NextResponse.json({ path, token: data.token })
}
