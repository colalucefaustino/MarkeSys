import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai'
import { db } from '@/lib/supabase/server'
import { getDossier } from '@/lib/dossier'
import { MODEL_MAIN, friendlyAiError } from '@/lib/ai'
import { buildSystemPrompt } from '@/lib/copilot/system-prompt'
import { copilotTools } from '@/lib/copilot/tools'

export const maxDuration = 120

/** Las herramientas de interacción sin respuesta (el dueño escribió en vez de tocar un chip) se cierran como salteadas. */
function closePendingTools(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => {
    if (m.role !== 'assistant') return m
    return {
      ...m,
      parts: m.parts.map((p: any) =>
        typeof p.type === 'string' && p.type.startsWith('tool-') && p.state === 'input-available'
          ? { ...p, state: 'output-available', output: { skipped: true } }
          : p,
      ),
    }
  })
}

async function saveMessages(brandId: string, msgs: UIMessage[], tab: string, inputMode: string) {
  const ids = msgs.map((m) => m.id)
  const { data: existing } = await db().from('messages').select('id,content').eq('brand_id', brandId)
  const toDelete = (existing ?? []).filter((r: any) => ids.includes(r.content?.id)).map((r: any) => r.id)
  if (toDelete.length) await db().from('messages').delete().in('id', toDelete)
  const base = Date.now()
  await db()
    .from('messages')
    .insert(
      msgs.map((m, i) => ({
        brand_id: brandId,
        role: m.role,
        content: m,
        input_mode: m.role === 'user' ? inputMode : 'texto',
        tab,
        created_at: new Date(base + i).toISOString(),
      })),
    )
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    messages: UIMessage[]
    brandId: string
    tab: string
    inputMode?: 'texto' | 'voz' | 'chip'
  }
  const { brandId, tab } = body
  const inputMode = body.inputMode ?? 'texto'

  const dossier = await getDossier(brandId)
  if (!dossier.brand) return new Response('Marca no encontrada', { status: 404 })

  const messages = closePendingTools(body.messages)

  const result = streamText({
    model: MODEL_MAIN,
    system: buildSystemPrompt(dossier, tab),
    messages: await convertToModelMessages(messages),
    tools: copilotTools(brandId),
    stopWhen: isStepCount(8),
    abortSignal: req.signal,
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      onError: (e) => friendlyAiError(e) ?? 'Marky no pudo responder. Probá de nuevo en un momento.',
      onEnd: async ({ messages: all, isAborted, isCancelled }) => {
        if (isAborted || isCancelled) return
        try {
          await saveMessages(brandId, all.slice(-2), tab, inputMode)
        } catch (e) {
          console.log('[v0] no se pudo guardar el chat', e)
        }
      },
    }),
    consumeSseStream: consumeStream,
  })
}
