import { NextResponse } from 'next/server'
import type { UIMessage } from 'ai'
import { db } from '@/lib/supabase/server'
import { getBrand, saveFields } from '@/lib/dossier'
import { findStep } from '@/lib/copilot/scripted'

/**
 * Respuesta a una pregunta fija del Copiloto: se guarda sin pasar por la IA.
 * También deja la pregunta y la respuesta en el historial del chat, así la IA
 * las ve como contexto cuando el dueño escribe algo libre.
 */
export async function POST(req: Request) {
  const { brandId, stepId, optionIndex } = (await req.json()) as { brandId: string; stepId: string; optionIndex: number }
  const step = findStep(stepId)
  const option = step?.options[optionIndex]
  if (!step || !option || option.value === undefined || !step.path) {
    return NextResponse.json({ error: 'Respuesta inválida' }, { status: 400 })
  }
  const brand = await getBrand(brandId)
  if (!brand) return NextResponse.json({ error: 'Marca no encontrada' }, { status: 404 })

  await saveFields(brandId, 'ficha', [
    { path: step.path, value: option.value, origin: 'confirmado', sourceRef: 'chat' },
    ...Object.entries(option.extra ?? {}).map(([path, value]) => ({ path, value, origin: 'confirmado' as const, sourceRef: 'chat' })),
  ])
  if (step.id === 'tamano') {
    await db().from('brands').update({ size_segment: option.value, updated_at: new Date().toISOString() }).eq('id', brandId)
  }

  const now = Date.now()
  const messages: UIMessage[] = [
    { id: `fija-${step.id}-q-${now}`, role: 'assistant', parts: [{ type: 'text', text: `${step.question}\n${step.why}` }] },
    { id: `fija-${step.id}-a-${now}`, role: 'user', parts: [{ type: 'text', text: option.label }] },
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
