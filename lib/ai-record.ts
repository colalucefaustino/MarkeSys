import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider'

// Modo grabado (solo para desarrollo).
//
// Con AI_RECORD=1 en .env.local, la primera vez que la app hace un pedido de IA guarda la
// respuesta en .ai-cache/. Si después llega exactamente el mismo pedido (mismo prompt, mismas
// opciones), contesta con lo guardado sin llamar al proveedor: cero tokens.
// Cuando cambia un prompt, cambia la clave y se vuelve a pedir (y a guardar).
//
// Nunca se activa en Vercel, aunque la variable quede cargada por error.
// Para empezar de cero: borrá la carpeta .ai-cache.

export const RECORD_ENABLED = process.env.AI_RECORD?.trim() === '1' && !process.env.VERCEL
const CACHE_DIR = path.resolve(process.env.AI_RECORD_DIR?.trim() || '.ai-cache')

/** Clave del pedido: todo lo que cambia la respuesta (no la señal de corte ni los headers). */
function keyFor(label: string, kind: 'generate' | 'stream', o: LanguageModelV4CallOptions) {
  const { abortSignal: _a, headers: _h, ...rest } = o as LanguageModelV4CallOptions & Record<string, unknown>
  const json = JSON.stringify({ label, kind, ...rest }, (_k, v) => {
    // Archivos (fotos, PDF): se resumen con su hash para no meter megas en la clave.
    if (v instanceof Uint8Array) return `bytes:${createHash('sha256').update(v).digest('hex')}`
    if (v instanceof URL) return v.toString()
    return v
  })
  return createHash('sha256').update(json).digest('hex').slice(0, 32)
}

// Guardado con fechas: JSON pierde los Date (ej. response.timestamp), así que se marcan.
function save(value: unknown) {
  return JSON.stringify(
    value,
    function (this: Record<string, unknown>, k, v) {
      const raw = this[k]
      if (raw instanceof Date) return { __date: raw.toISOString() }
      if (raw instanceof Uint8Array) return { __bytes: Buffer.from(raw).toString('base64') }
      return v
    },
    1,
  )
}
function load<T>(text: string): T {
  return JSON.parse(text, (_k, v) => {
    if (v && typeof v === 'object' && typeof v.__date === 'string') return new Date(v.__date)
    if (v && typeof v === 'object' && typeof v.__bytes === 'string') return new Uint8Array(Buffer.from(v.__bytes, 'base64'))
    return v
  }) as T
}

async function readCache<T>(key: string): Promise<T | null> {
  try {
    return load<T>(await readFile(path.join(CACHE_DIR, `${key}.json`), 'utf8'))
  } catch {
    return null
  }
}
async function writeCache(key: string, label: string, value: unknown) {
  try {
    await mkdir(CACHE_DIR, { recursive: true })
    await writeFile(path.join(CACHE_DIR, `${key}.json`), save(value))
    console.info(`[ia-grabado] guardé ${label} ${key}`)
  } catch (e) {
    console.warn('[ia-grabado] no pude guardar:', e instanceof Error ? e.message : e)
  }
}

/** Envuelve un modelo para que grabe y reproduzca respuestas. Sin AI_RECORD=1 lo devuelve tal cual. */
export function recorded<M extends LanguageModelV4>(model: M, label: string): M {
  if (!RECORD_ENABLED) return model

  const wrapped: LanguageModelV4 = {
    specificationVersion: 'v4',
    provider: model.provider,
    modelId: model.modelId,
    supportedUrls: model.supportedUrls,

    async doGenerate(o) {
      const key = keyFor(label, 'generate', o)
      const hit = await readCache<Awaited<ReturnType<LanguageModelV4['doGenerate']>>>(key)
      if (hit) {
        console.info(`[ia-grabado] reutilizo ${label} ${key}`)
        return hit
      }
      const result = await model.doGenerate(o)
      const { request: _req, response, ...rest } = result
      // El body crudo del proveedor no hace falta y puede pesar mucho.
      await writeCache(key, label, { ...rest, response: response && { ...response, body: undefined } })
      return result
    },

    async doStream(o) {
      const key = keyFor(label, 'stream', o)
      const hit = await readCache<{ parts: LanguageModelV4StreamPart[] }>(key)
      if (hit) {
        console.info(`[ia-grabado] reutilizo ${label} ${key}`)
        return {
          stream: new ReadableStream<LanguageModelV4StreamPart>({
            start(c) {
              for (const p of hit.parts) c.enqueue(p)
              c.close()
            },
          }),
        }
      }
      const result = await model.doStream(o)
      const parts: LanguageModelV4StreamPart[] = []
      let failed = false
      const recorder = new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
        transform(part, c) {
          if (part.type === 'error') failed = true
          // 'raw' son los chunks crudos del proveedor: no hacen falta para reproducir.
          if (part.type !== 'raw') parts.push(part)
          c.enqueue(part)
        },
        async flush() {
          // Solo se guarda una respuesta completa y sin errores.
          if (!failed && parts.some((p) => p.type === 'finish')) await writeCache(key, label, { parts })
        },
      })
      return { ...result, stream: result.stream.pipeThrough(recorder) }
    },
  }
  return wrapped as M
}
