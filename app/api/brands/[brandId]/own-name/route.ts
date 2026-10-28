import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/supabase/server'
import { latestSections, setProvenance } from '@/lib/dossier'
import { prettyName, sameName } from '@/lib/names'

const Body = z.object({ name: z.string().trim().min(2).max(120) })

/**
 * "Es mi negocio": un nombre que Visibilidad tomó como competidor en realidad es del
 * dueño (por ejemplo, el nombre del local distinto al de la marca). Se guarda como otro
 * nombre propio, se saca de competidores y del ranking. La próxima medición lo cuenta como propio.
 *
 * Se actualiza la versión actual de la Ficha sin crear una nueva: es un dato de
 * identificación y no tiene que marcar como desactualizadas las etapas aprobadas.
 */
export async function POST(req: Request, ctx: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await ctx.params
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Nombre inválido' }, { status: 400 })
  const name = prettyName(parsed.data.name)

  const { latest } = await latestSections(brandId)
  const ficha = latest.ficha
  if (!ficha) return NextResponse.json({ error: 'Todavía no hay Ficha' }, { status: 409 })
  const data = structuredClone(ficha.data ?? {}) as any
  data.marca ??= {}
  const current: string[] = data.marca.otros_nombres ?? []
  if (!current.some((n) => sameName(n, name))) data.marca.otros_nombres = [...current, name]
  await db().from('dossier_sections').update({ data }).eq('id', ficha.id)
  await setProvenance(brandId, 'ficha', 'marca.otros_nombres', 'confirmado', 'visibilidad')

  // Fuera de competidores…
  const { data: comps } = await db().from('competitors').select('id,name').eq('brand_id', brandId)
  const ids = (comps ?? []).filter((c) => sameName(c.name, name)).map((c) => c.id)
  if (ids.length) await db().from('competitors').delete().in('id', ids)

  // …y del ranking del último diagnóstico.
  const vis = latest.visibilidad
  if (vis?.data?.ranking_competidores) {
    const v = structuredClone(vis.data) as any
    v.ranking_competidores = (v.ranking_competidores as any[]).filter((r) => !sameName(r.nombre, name))
    await db().from('dossier_sections').update({ data: v }).eq('id', vis.id)
  }
  return NextResponse.json({ ok: true, name })
}
