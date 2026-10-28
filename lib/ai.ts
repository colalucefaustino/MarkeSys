import { anthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { gateway } from 'ai'
import type { LanguageModelV4, LanguageModelV4CallOptions } from '@ai-sdk/provider'

// Proveedor de IA según la clave cargada en Vercel:
// 1) ANTHROPIC_API_KEY → Claude
// 2) GOOGLE_GENERATIVE_AI_API_KEY → Gemini (capa gratuita, lo que se usa hoy)
// 3) ninguna, o AI_PROVIDER=gateway → AI Gateway de Vercel
//
// Respaldo automático: si el proveedor principal es Gemini y se queda sin cupo
// ("You exceeded your current quota", error 429), el pedido se reintenta por el
// AI Gateway de Vercel con el mismo modelo de Gemini. Gemini queda marcado como
// agotado hasta que se reinicia su cupo (medianoche hora del Pacífico) y mientras
// tanto todo va directo al Gateway. Se apaga con AI_FALLBACK=off.

// Acepta la clave de Gemini con cualquiera de estos nombres (y le saca espacios o comillas).
function findKey(names: string[]) {
  for (const n of names) {
    const v = process.env[n]?.trim().replace(/^["']|["']$/g, '')
    if (v) return { name: n, value: v }
  }
  // por si el nombre quedó con espacios o con otra variante
  for (const [k, v] of Object.entries(process.env)) {
    if (/GOOGLE|GEMINI/i.test(k) && /KEY/i.test(k) && v?.trim().startsWith('AIza')) return { name: k, value: v.trim() }
  }
  return null
}
export const GOOGLE_KEY = findKey(['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY'])
const google = createGoogleGenerativeAI({ apiKey: GOOGLE_KEY?.value })
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY?.trim()

const FORCED = process.env.AI_PROVIDER?.trim().toLowerCase()
export const AI_PROVIDER: 'anthropic' | 'google' | 'gateway' =
  FORCED === 'gateway' ? 'gateway' : ANTHROPIC_KEY ? 'anthropic' : GOOGLE_KEY ? 'google' : 'gateway'

const CLAUDE_MAIN = process.env.CLAUDE_MODEL_MAIN || 'claude-sonnet-5-5'
const CLAUDE_FAST = process.env.CLAUDE_MODEL_FAST || 'claude-haiku-5-5'
const GEMINI_MAIN = process.env.GEMINI_MODEL_MAIN || 'gemini-3.5-flash'
const GEMINI_FAST = process.env.GEMINI_MODEL_FAST || 'gemini-3.5-flash-lite'

// Formato del Gateway: "proveedor/modelo" (claude-sonnet-5-5 → anthropic/claude-sonnet-5.5)
const claudeGatewayId = (m: string) => `anthropic/${m.replace(/-(\d+)-(\d+)$/, '-$1.$2')}`

// Modelos del Gateway. Si el principal es Gemini, por defecto el respaldo usa el mismo
// Gemini a través del Gateway, así las respuestas no cambian de estilo.
const GATEWAY_MAIN =
  process.env.GATEWAY_MODEL_MAIN || (AI_PROVIDER === 'google' ? `google/${GEMINI_MAIN}` : claudeGatewayId(CLAUDE_MAIN))
const GATEWAY_FAST =
  process.env.GATEWAY_MODEL_FAST || (AI_PROVIDER === 'google' ? `google/${GEMINI_FAST}` : claudeGatewayId(CLAUDE_FAST))

/** El Gateway funciona solo dentro de Vercel (OIDC) o con AI_GATEWAY_API_KEY. */
export const GATEWAY_AVAILABLE = Boolean(process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL)
export const FALLBACK_ENABLED =
  AI_PROVIDER === 'google' && GATEWAY_AVAILABLE && process.env.AI_FALLBACK?.trim().toLowerCase() !== 'off'

// ---------- Estado del cupo de Gemini ----------
// Vive en la memoria de cada instancia del servidor: alcanza para no gastar
// un pedido fallido por cada llamada una vez que el cupo se terminó.
let geminiExhaustedUntil = 0

/** Próxima medianoche en la hora del Pacífico (cuando Google reinicia el cupo diario). */
function nextPacificMidnight(now = new Date()): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  const h = Number(parts.hour) % 24
  const elapsedMs = ((h * 60 + Number(parts.minute)) * 60 + Number(parts.second)) * 1000
  return now.getTime() - elapsedMs + 24 * 60 * 60 * 1000 + 60_000 // +1 min de margen
}

/** Marca a Gemini como agotado hasta que Google reinicie el cupo y lo guarda para las demás instancias. */
function setGeminiExhausted() {
  geminiExhaustedUntil = nextPacificMidnight()
  const until = geminiExhaustedUntil
  // import dinámico: ai-status importa este archivo
  import('@/lib/ai-status')
    .then((m) => m.persistGeminiExhausted(until))
    .catch((e) => console.warn('[ia] no pude guardar el estado del cupo:', e instanceof Error ? e.message : e))
}

/** Toma el estado guardado por otra instancia del servidor. */
export function adoptGeminiExhausted(until: number) {
  if (until > geminiExhaustedUntil) geminiExhaustedUntil = until
}

export function geminiStatus() {
  const exhausted = Date.now() < geminiExhaustedUntil
  return {
    agotado: exhausted,
    vuelve: exhausted ? new Date(geminiExhaustedUntil).toISOString() : null,
  }
}

/** ¿El error es "me quedé sin cupo"? (429 o RESOURCE_EXHAUSTED de Google) */
export function isQuotaError(e: unknown): boolean {
  const err = e as { statusCode?: number; message?: string; responseBody?: string; lastError?: unknown }
  if (err?.lastError) return isQuotaError(err.lastError) // RetryError del AI SDK
  if (err?.statusCode === 429) return true
  const text = `${err?.message ?? ''} ${err?.responseBody ?? ''}`
  return /quota|RESOURCE_EXHAUSTED|rate limit/i.test(text)
}

/** Las herramientas propias de un proveedor (ej. google_search) no viajan a otro. */
const usesProviderTools = (o: LanguageModelV4CallOptions) => Boolean(o.tools?.some((t) => t.type === 'provider'))

/**
 * Envuelve un modelo de Gemini: si se queda sin cupo, reintenta el mismo pedido
 * por el Gateway. Para quien lo usa es un modelo normal.
 */
function withFallback(primary: LanguageModelV4, backupId: string): LanguageModelV4 {
  const backup = () => gateway(backupId) as unknown as LanguageModelV4
  const pick = (o: LanguageModelV4CallOptions) =>
    Date.now() < geminiExhaustedUntil && !usesProviderTools(o) ? backup() : primary

  async function run<T>(o: LanguageModelV4CallOptions, call: (m: LanguageModelV4) => PromiseLike<T>): Promise<T> {
    const model = pick(o)
    try {
      return await call(model)
    } catch (e) {
      if (model !== primary || !isQuotaError(e) || usesProviderTools(o)) throw e
      setGeminiExhausted()
      console.warn(`[ia] Gemini sin cupo hasta ${new Date(geminiExhaustedUntil).toISOString()}; sigo por el Gateway (${backupId})`)
      return await call(backup())
    }
  }

  return {
    specificationVersion: 'v4',
    provider: primary.provider,
    modelId: primary.modelId,
    supportedUrls: primary.supportedUrls,
    doGenerate: (o) => run(o, (m) => m.doGenerate(o)),
    doStream: (o) => run(o, (m) => m.doStream(o)),
  }
}

function build(kind: 'main' | 'fast'): LanguageModelV4 {
  if (AI_PROVIDER === 'anthropic') return anthropic(kind === 'main' ? CLAUDE_MAIN : CLAUDE_FAST) as unknown as LanguageModelV4
  if (AI_PROVIDER === 'google') {
    const g = google(kind === 'main' ? GEMINI_MAIN : GEMINI_FAST) as unknown as LanguageModelV4
    return FALLBACK_ENABLED ? withFallback(g, kind === 'main' ? GATEWAY_MAIN : GATEWAY_FAST) : g
  }
  return gateway(kind === 'main' ? GATEWAY_MAIN : GATEWAY_FAST) as unknown as LanguageModelV4
}

export const MODEL_MAIN = build('main')
export const MODEL_FAST = build('fast')

/** Modelo + herramienta de búsqueda web para el canal "Respuestas de IA" de Visibilidad. */
export function searchModel(): { model: any; tools?: Record<string, any>; via: string } {
  if (AI_PROVIDER === 'anthropic') {
    return {
      model: anthropic(CLAUDE_MAIN),
      tools: { web_search: anthropic.tools.webSearch_20250305({ maxUses: 3 }) },
      via: `anthropic/${CLAUDE_MAIN}`,
    }
  }
  // Gemini con cupo: usa la búsqueda de Google integrada.
  if (AI_PROVIDER === 'google' && !(FALLBACK_ENABLED && geminiStatus().agotado)) {
    return { model: google(GEMINI_MAIN), tools: { google_search: google.tools.googleSearch({}) }, via: `google/${GEMINI_MAIN}` }
  }
  // Gateway (o Gemini agotado): un modelo que ya busca en la web por sí solo.
  const id = process.env.GATEWAY_SEARCH_MODEL || 'perplexity/sonar'
  return { model: gateway(id), via: id }
}

/** Avisar que Gemini se quedó sin cupo durante una búsqueda (desde Visibilidad). */
export function markGeminiExhausted() {
  if (FALLBACK_ENABLED) setGeminiExhausted()
}

export function todayAR() {
  return new Date().toLocaleDateString('es-AR', {
    dateStyle: 'full',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

export function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}
