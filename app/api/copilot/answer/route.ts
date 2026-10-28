import { NextResponse } from 'next/server'
import type { UIMessage } from 'ai'
import { z } from 'zod'
import { db } from '@/lib/supabase/server'
import { getDossier, saveFields } from '@/lib/dossier'
import { resolveAnswer } from '@/lib/copilot/scripted'

const Body = z.object({
  brandId: z.string().uuid(),
  stepId: z.string().min(1).max(40),
  values: z.array(z.string().max(120)).max(12).optional(),
  text: z.string().max(500).optional(),
  action: z.enum(['confirm', 'skip']).optional(),
  /** Ids que el navegador ya usó para mostrar la pregunta y la respuesta (evita duplicados). */
  messageIds: z.tuple([z.string().max(80), z.string().max(80)]).optional(),
})

/**
 * Respuesta a una pregunta fija de Marky: se guarda sin pasar por la IA.
 * La pregunta y la respuesta quedan en el historial del chat, así la IA las ve
 * como contexto cuando el dueño escribe algo libre.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { brandId, stepId, values, text, action, messageIds } = parsed.data

  const d = await getDossier(brandId)
  if (!d.brand) return NextResponse.json({ error: 'Marca no encontrada' }, { status: 404 })

  const r = resolveAnswer(d, stepId, { values, text, action })
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })

  await saveFields(
    brandId,
    'ficha',
    r.effect.fields.map((f) => ({ ...f, origin: 'confirmado' as const, sourceRef: 'chat' })),
  )
  const brandPatch: Record<string, unknown> = {}
  if (r.effect.segment && ['micro', 'pyme', 'grande'].includes(r.effect.segment)) brandPatch.size_segment = r.effect.segment
  const rubro = r.effect.fields.find((f) => f.path === 'marca.rubro')
  if (Object.keys(brandPatch).length || rubro) {
    await db().from('brands').update({ ...brandPatch, updated_at: new Date().toISOString() }).eq('id', brandId)
  }
  if (r.effect.competitors?.length) {
    const known = new Set(d.competitors.map((c) => String(c.name).toLowerCase()))
    const rows = r.effect.competitors
      .filter((n) => !known.has(n.toLowerCase()))
      .slice(0, 8)
      .map((n) => ({
        brand_id: brandId,
        name: n.replace(/^@/, ''),
        instagram: n.startsWith('@') ? n : null,
        source: 'cliente',
        confirmed: true,
      }))
    if (rows.length) await db().from('competitors').insert(rows)
  }

  const now = Date.now()
  const [qId, aId] = messageIds ?? [`fija-${stepId}-q-${now}`, `fija-${stepId}-a-${now}`]
  const messages: UIMessage[] = [
    { id: qId, role: 'assistant', parts: [{ type: 'text', text: `${r.question}\n${r.why}` }] },
    { id: aId, role: 'user', parts: [{ type: 'text', text: r.label }] },
  ]
  await db()
    .from('messages')
    .insert(
      messages.map((m, i) => ({
        brand_id: brandId,
        role: m.role,
        content: m,
        input_mode: m.role === 'user' ? 'chip' : 'texto',
        tab: 'copiloto',
        created_at: new Date(now + i).toISOString(),
      })),
    )

  return NextResponse.json({ messages })
}
