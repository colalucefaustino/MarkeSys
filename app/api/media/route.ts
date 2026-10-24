import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/supabase/server'
import { parseMedia } from '@/lib/media/parse'

export const maxDuration = 120

const Kinds = ['catalogo', 'stock', 'ventas', 'branding', 'logo', 'fotos', 'videos', 'grabacion', 'skill', 'resenas', 'otro'] as const

const Body = z.object({
  brandId: z.string().uuid(),
  kind: z.enum(Kinds),
  path: z.string().min(1),
  name: z.string().max(240),
  mime: z.string().max(120).optional(),
  size: z.number().optional(),
  planItemId: z.string().uuid().optional(),
})

export async function GET(req: Request) {
  const brandId = new URL(req.url).searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'Falta brandId' }, { status: 400 })
  const { data } = await db().from('media').select('*').eq('brand_id', brandId).order('created_at', { ascending: false })
  const items = await Promise.all(
    (data ?? []).map(async (m: any) => {
      const bucket = m.kind === 'videos' || m.kind === 'grabacion' ? 'brand-files' : 'brand-files'
      const { data: signed } = await db().storage.from(bucket).createSignedUrl(m.storage_path, 3600)
      return { ...m, url: signed?.signedUrl ?? null }
    }),
  )
  return NextResponse.json({ media: items })
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const b = parsed.data

  // Un logo o manual nuevo reemplaza al anterior; el resto se acumula.
  if (b.kind === 'logo' || b.kind === 'branding') {
    const { data: old } = await db().from('media').select('id,storage_path').eq('brand_id', b.brandId).eq('kind', b.kind)
    if (old?.length) {
      await db().storage.from('brand-files').remove(old.map((o: any) => o.storage_path))
      await db().from('media').delete().in('id', old.map((o: any) => o.id))
    }
  }

  const { data, error } = await db()
    .from('media')
    .insert({
      brand_id: b.brandId,
      kind: b.kind,
      storage_path: b.path,
      original_name: b.name,
      mime: b.mime ?? null,
      size_bytes: b.size ?? null,
      plan_item_id: b.planItemId ?? null,
      parse_status: 'pending',
    })
    .select('*')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'No pude guardar' }, { status: 500 })

  after(() => parseMedia(data.id))
  return NextResponse.json({ media: data })
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const { data } = await db().from('media').select('storage_path').eq('id', id).maybeSingle()
  if (data) await db().storage.from('brand-files').remove([data.storage_path])
  await db().from('media').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
