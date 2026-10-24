import { createHash } from 'node:crypto'
import { db } from '@/lib/supabase/server'

export const maxDuration = 60

/** Quita markdown, emojis y URLs, y corta a 800 caracteres para que suene natural. */
export function cleanForSpeech(input: string) {
  return input
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>~|]/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800)
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { text?: string } | null
  const text = cleanForSpeech(body?.text ?? '')
  if (!text) return new Response('Sin texto', { status: 400 })

  const key = process.env.ELEVENLABS_API_KEY
  const voice = process.env.ELEVENLABS_VOICE_ID
  if (!key || !voice) return new Response('Sin ElevenLabs', { status: 503 })

  const model = process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2'
  const hash = createHash('sha256').update(`${voice}:${model}:${text}`).digest('hex')
  const path = `${hash}.mp3`

  const cached = await db().storage.from('tts-cache').download(path)
  if (cached.data) {
    return new Response(cached.data, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=86400' } })
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: model, language_code: 'es' }),
  })
  if (!res.ok) {
    console.log('[v0] elevenlabs tts failed', res.status, await res.text().catch(() => ''))
    return new Response('TTS falló', { status: 502 })
  }
  const audio = Buffer.from(await res.arrayBuffer())
  await db().storage.from('tts-cache').upload(path, audio, { contentType: 'audio/mpeg', upsert: true })
  return new Response(audio, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=86400' } })
}
