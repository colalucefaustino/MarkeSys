import { NextResponse } from 'next/server'
import { db } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) return NextResponse.json({ error: 'Sin ElevenLabs' }, { status: 503 })

  const form = await req.formData()
  const file = form.get('audio')
  const brandId = String(form.get('brandId') ?? '')
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: 'Sin audio' }, { status: 400 })

  const out = new FormData()
  out.append('file', file, 'voz.webm')
  out.append('model_id', process.env.ELEVENLABS_STT_MODEL || 'scribe_v1')
  out.append('language_code', 'spa')

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': key },
    body: out,
  })
  if (!res.ok) {
    console.log('[v0] elevenlabs stt failed', res.status, await res.text().catch(() => ''))
    return NextResponse.json({ error: 'No pude transcribir' }, { status: 502 })
  }
  const json = (await res.json()) as { text?: string }
  const text = (json.text ?? '').trim()

  let audioUrl: string | null = null
  if (brandId) {
    const ext = file.type.includes('mp4') ? 'mp4' : 'webm'
    const path = `${brandId}/${crypto.randomUUID()}.${ext}`
    const up = await db().storage.from('voice-messages').upload(path, file, { contentType: file.type || 'audio/webm' })
    if (!up.error) {
      const { data } = await db().storage.from('voice-messages').createSignedUrl(path, 60 * 60 * 24 * 7)
      audioUrl = data?.signedUrl ?? null
    }
  }
  return NextResponse.json({ text, audioUrl })
}
