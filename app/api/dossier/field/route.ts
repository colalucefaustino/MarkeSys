import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/supabase/server'
import { saveField } from '@/lib/dossier'

const Body = z.object({
  brandId: z.string().uuid(),
  section: z.enum(['ficha', 'visibilidad', 'percepcion', 'estrategia', 'calendario']).default('ficha'),
  path: z.string().min(1).max(120),
  value: z.unknown(),
})

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { brandId, section, path, value } = parsed.data

  await saveField(brandId, section, path, value, 'confirmado', 'Editado por vos')

  if (section === 'ficha') {
    const patch: Record<string, unknown> = {}
    if (path === 'marca.nombre' && typeof value === 'string' && value.trim()) patch.name = value.trim()
    if (path === 'marca.ciudad' && typeof value === 'string') patch.city = value.trim() || null
    if (path === 'tamano.segmento' && (value === 'micro' || value === 'pyme' || value === 'grande')) patch.size_segment = value
    if (Object.keys(patch).length) await db().from('brands').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', brandId)
  }

  return NextResponse.json({ ok: true })
}
