import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/supabase/server'

const Patch = z.object({
  id: z.string().uuid(),
  confirmed: z.boolean().optional(),
  instagram: z.string().trim().max(80).optional(),
})

export async function PATCH(req: Request) {
  const parsed = Patch.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { id, ...rest } = parsed.data
  await db().from('competitors').update(rest).eq('id', id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  await db().from('competitors').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
