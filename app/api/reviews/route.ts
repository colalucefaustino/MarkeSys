import { NextResponse } from 'next/server'
import { z } from 'zod'
import { insertReviews } from '@/lib/media/parse'

const Body = z.object({ brandId: z.string().uuid(), text: z.string().min(6).max(40000) })

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Pegá al menos una reseña' }, { status: 400 })
  const items = parsed.data.text
    .split(/\n\s*\n|\r?\n/)
    .map((t) => t.trim())
    .filter((t) => t.length > 5)
    .map((text) => ({ text }))
  if (!items.length) return NextResponse.json({ error: 'No encontré reseñas en el texto' }, { status: 400 })
  await insertReviews(parsed.data.brandId, items, 'pegado')
  return NextResponse.json({ count: items.length })
}
