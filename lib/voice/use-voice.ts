'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'

const MAX_MS = 60_000
const SILENCE_MS = 2_000
const SILENCE_LEVEL = 0.04

type SR = any

function getSpeechRecognition(): (new () => SR) | null {
  if (typeof window === 'undefined') return null
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const m of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return ''
}

const fetcher = (u: string) => fetch(u).then((r) => r.json())

export interface VoiceResult {
  text: string
  audioUrl?: string | null
}

export function useVoice(brandId: string) {
  const { data: status } = useSWR<{ elevenlabs: boolean }>('/api/voice/status', fetcher, { revalidateOnFocus: false })
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [level, setLevel] = useState(0)
  const [speaking, setSpeaking] = useState(false)

  const forceBrowserStt = useRef(false)
  const forceBrowserTts = useRef(false)
  const cleanup = useRef<(() => void) | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const speakResolve = useRef<(() => void) | null>(null)
  const resolveRecording = useRef<((r: VoiceResult | null) => void) | null>(null)

  const stopAll = useCallback(() => {
    cleanup.current?.()
    cleanup.current = null
  }, [])

  useEffect(() => () => stopAll(), [stopAll])

  /** Empieza a grabar. Resuelve con el texto cuando termina (tocando de nuevo, silencio o 60 s). */
  const record = useCallback((): Promise<VoiceResult | null> => {
    return new Promise(async (resolve) => {
      resolveRecording.current = resolve
      const useEleven = status?.elevenlabs && !forceBrowserStt.current && typeof MediaRecorder !== 'undefined'

      if (!useEleven) {
        const SRCtor = getSpeechRecognition()
        if (!SRCtor) {
          toast.error('No pude usar el micrófono, escribime.')
          resolve(null)
          return
        }
        const rec = new SRCtor()
        rec.lang = 'es-AR'
        rec.interimResults = false
        rec.continuous = false
        let finished = false
        const done = (text: string | null) => {
          if (finished) return
          finished = true
          setRecording(false)
          setLevel(0)
          cleanup.current = null
          resolve(text ? { text } : null)
        }
        rec.onresult = (e: any) => done(Array.from(e.results).map((r: any) => r[0].transcript).join(' ').trim())
        rec.onerror = (e: any) => {
          if (e.error === 'not-allowed') toast.error('El micrófono está bloqueado. Habilitalo desde el candado de la barra del navegador.')
          else if (e.error !== 'no-speech' && e.error !== 'aborted') toast.error('No pude usar el micrófono, escribime.')
          done(null)
        }
        rec.onend = () => done(null)
        cleanup.current = () => rec.stop()
        setRecording(true)
        try {
          rec.start()
        } catch {
          done(null)
        }
        return
      }

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        toast.error('El micrófono está bloqueado. Habilitalo desde el candado de la barra del navegador.')
        resolve(null)
        return
      }

      const mime = pickMime()
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      const chunks: BlobPart[] = []
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Uint8Array(analyser.fftSize)
      let spoke = false
      let silentSince = Date.now()
      const startedAt = Date.now()
      let raf = 0
      let stopped = false

      const stop = () => {
        if (stopped) return
        stopped = true
        cancelAnimationFrame(raf)
        if (recorder.state !== 'inactive') recorder.stop()
      }

      const tick = () => {
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += ((v - 128) / 128) ** 2
        const rms = Math.sqrt(sum / buf.length)
        setLevel(Math.min(1, rms * 6))
        const now = Date.now()
        if (rms > SILENCE_LEVEL) {
          spoke = true
          silentSince = now
        }
        if ((spoke && now - silentSince > SILENCE_MS) || now - startedAt > MAX_MS) {
          stop()
          return
        }
        raf = requestAnimationFrame(tick)
      }

      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        ctx.close().catch(() => {})
        setRecording(false)
        setLevel(0)
        cleanup.current = null
        if (!spoke) {
          resolve(null)
          return
        }
        setTranscribing(true)
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
          const form = new FormData()
          form.append('audio', blob, 'voz')
          form.append('brandId', brandId)
          const res = await fetch('/api/voice/transcribe', { method: 'POST', body: form })
          if (!res.ok) throw new Error('stt')
          const json = (await res.json()) as VoiceResult
          resolve(json.text ? json : null)
        } catch {
          forceBrowserStt.current = true
          toast.error('No pude transcribir el audio. Probá de nuevo o escribime.')
          resolve(null)
        } finally {
          setTranscribing(false)
        }
      }

      cleanup.current = stop
      setRecording(true)
      recorder.start()
      raf = requestAnimationFrame(tick)
    })
  }, [status?.elevenlabs, brandId])

  /** Termina la grabación en curso (el texto se resuelve en la promesa de `record`). */
  const stopRecording = useCallback(() => {
    cleanup.current?.()
  }, [])

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    setSpeaking(false)
    speakResolve.current?.()
    speakResolve.current = null
  }, [])

  const speakWithBrowser = useCallback((text: string) => {
    return new Promise<void>((resolve) => {
      if (typeof speechSynthesis === 'undefined') return resolve()
      const u = new SpeechSynthesisUtterance(text.slice(0, 800))
      const voices = speechSynthesis.getVoices()
      const v = voices.find((x) => x.lang === 'es-AR') ?? voices.find((x) => x.lang.startsWith('es'))
      if (v) u.voice = v
      u.lang = v?.lang ?? 'es-AR'
      u.onend = () => resolve()
      u.onerror = () => resolve()
      speakResolve.current = resolve
      speechSynthesis.speak(u)
    })
  }, [])

  /** Reproduce un texto. Resuelve al terminar el audio. */
  const speak = useCallback(
    async (text: string) => {
      stopSpeaking()
      setSpeaking(true)
      try {
        if (status?.elevenlabs && !forceBrowserTts.current) {
          const res = await fetch('/api/voice/speak', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text }),
          })
          if (res.ok) {
            const url = URL.createObjectURL(await res.blob())
            const audio = new Audio(url)
            audioRef.current = audio
            await new Promise<void>((resolve) => {
              speakResolve.current = resolve
              audio.onended = () => resolve()
              audio.onerror = () => resolve()
              audio.play().catch(() => resolve())
            })
            URL.revokeObjectURL(url)
            return
          }
          forceBrowserTts.current = true
        }
        await speakWithBrowser(text)
      } finally {
        setSpeaking(false)
      }
    },
    [status?.elevenlabs, stopSpeaking, speakWithBrowser],
  )

  return { record, stopRecording, recording, transcribing, level, speak, stopSpeaking, speaking, stopAll }
}
