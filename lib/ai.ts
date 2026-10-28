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
/**
 * Cadena de respaldo con Gemini: cada modelo de Gemini tiene su propio cupo diario
 * gratis, así que primero se pasa al otro modelo de Gemini y recién después al Gateway.
 */
export const FALLBACK_ENABLED = AI_PROVIDER === 'google' && process.env.AI_FALLBACK?.trim().toLowerCase() !== 'off'

// ---------- Cupo de cada modelo ----------
// Vive en la memoria de cada instancia y se guarda en Storage (lib/ai-status.ts) para las demás.
// Clave: "google/<modelo>" o "gateway/<modelo>". Valor: hasta cuándo no usarlo (ms).
const unavailable = new Map<string, number>()

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

const isOff = (key: string) => (unavailable.get(key) ?? 0) > Date.now()

function markUnavailable(key: string, until: number) {
  unavailable.set(key, until)
  const snapshot = Object.fromEntries([...unavailable].filter(([, t]) => t > Date.now()))
  // import dinámico: ai-status importa este archivo
  import('@/lib/ai-status')
    .then((m) => m.persistUnavailable(snapshot))
    .catch((e) => console.warn('[ia] no pude guardar el estado del cupo:', e instanceof Error ? e.message : e))
}

/** Toma el estado guardado por otra instancia del servidor. */
export function adoptUnavailable(map: Record<string, number>) {
  for (const [k, t] of Object.entries(map)) if (t > (unavailable.get(k) ?? 0)) unavailable.set(k, t)
}

const GEMINI_KEYS = [`google/${GEMINI_MAIN}`, `google/${GEMINI_FAST}`]

/** Estado de Gemini para el indicador: "agotado" si el modelo principal no tiene cupo. */
export function geminiStatus() {
  const until = unavailable.get(GEMINI_KEYS[0]) ?? 0
  const exhausted = until > Date.now()
  const allOut = GEMINI_KEYS.every(isOff)
  return {
    agotado: exhausted,
    todos_agotados: allOut,
    vuelve: exhausted ? new Date(until).toISOString() : null,
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

/** ¿El modelo del Gateway no está disponible para esta cuenta (plan gratis, sin créditos)? */
function isAccessError(e: unknown): boolean {
  const err = e as { statusCode?: number; message?: string; responseBody?: string; lastError?: unknown }
  if (err?.lastError) return isAccessError(err.lastError)
  const text = `${err?.message ?? ''} ${err?.responseBody ?? ''}`
  return err?.statusCode === 402 || err?.statusCode === 403 || /free tier|do not have access|insufficient|credits|top-up/i.test(text)
}

/** Error que ve el dueño cuando no queda ningún modelo con cupo. */
export class AiUnavailableError extends Error {
  constructor(public readonly until: number | null) {
    super(
      `Se terminó el cupo gratis de IA por hoy.${until ? ` Vuelve ${backAt(until)}.` : ''} Mientras tanto podés revisar y editar lo que ya está armado.`,
    )
    this.name = 'AiUnavailableError'
  }
}

/** "mañana a las 4:00" en hora argentina. */
function backAt(ms: number) {
  const tz = 'America/Argentina/Buenos_Aires'
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: tz })
  const d = new Date(ms)
  const hour = d.toLocaleTimeString('es-AR', { timeZone: tz, hour: 'numeric', minute: '2-digit', hourCycle: 'h23' })
  return day(d) === day(new Date()) ? `hoy a las ${hour}` : `mañana a las ${hour}`
}

/** Traduce los errores de IA a un mensaje para el dueño (o null si no es un error de IA conocido). */
export function friendlyAiError(e: unknown): string | null {
  if (e instanceof AiUnavailableError) return e.message
  if (isQuotaError(e) || isAccessError(e)) return new AiUnavailableError(nextPacificMidnight()).message
  return null
}

/** Las herramientas propias de un proveedor (ej. google_search) no viajan a otro proveedor. */
const usesProviderTools = (o: LanguageModelV4CallOptions) => Boolean(o.tools?.some((t) => t.type === 'provider'))

type Link = { key: string; model: () => LanguageModelV4; provider: 'google' | 'gateway' }

/**
 * Envuelve una cadena de modelos: usa el primero con cupo y, si responde "sin cupo"
 * o "sin acceso", lo marca y sigue con el próximo. Para quien lo usa es un modelo normal.
 */
function withChain(chain: Link[]): LanguageModelV4 {
  const first = chain[0].model()

  async function run<T>(o: LanguageModelV4CallOptions, call: (m: LanguageModelV4) => PromiseLike<T>): Promise<T> {
    const usable = chain.filter((l) => !isOff(l.key) && (l.provider === 'google' || !usesProviderTools(o)))
    let lastError: unknown
    for (const link of usable) {
      try {
        return await call(link.model())
      } catch (e) {
        lastError = e
        if (isQuotaError(e)) {
          markUnavailable(link.key, link.provider === 'google' ? nextPacificMidnight() : Date.now() + 10 * 60_000)
        } else if (link.provider === 'gateway' && isAccessError(e)) {
          markUnavailable(link.key, Date.now() + 24 * 60 * 60_000)
        } else {
          throw e
        }
        console.warn(`[ia] ${link.key} sin cupo o sin acceso; pruebo con el siguiente`)
      }
    }
    const back = Math.min(...GEMINI_KEYS.map((k) => unavailable.get(k) ?? 0).filter((t) => t > Date.now()))
    if (lastError && !(isQuotaError(lastError) || isAccessError(lastError))) throw lastError
    throw new AiUnavailableError(Number.isFinite(back) ? back : null)
  }

  return {
    specificationVersion: 'v4',
    provider: first.provider,
    modelId: first.modelId,
    supportedUrls: first.supportedUrls,
    doGenerate: (o) => run(o, (m) => m.doGenerate(o)),
    doStream: (o) => run(o, (m) => m.doStream(o)),
  }
}

const geminiLink = (id: string): Link => ({ key: `google/${id}`, provider: 'google', model: () => google(id) as unknown as LanguageModelV4 })
const gatewayLink = (id: string): Link => ({ key: `gateway/${id}`, provider: 'gateway', model: () => gateway(id) as unknown as LanguageModelV4 })

function build(kind: 'main' | 'fast'): LanguageModelV4 {
  if (AI_PROVIDER === 'anthropic') return anthropic(kind === 'main' ? CLAUDE_MAIN : CLAUDE_FAST) as unknown as LanguageModelV4
  if (AI_PROVIDER === 'google') {
    const [a, b] = kind === 'main' ? [GEMINI_MAIN, GEMINI_FAST] : [GEMINI_FAST, GEMINI_MAIN]
    if (!FALLBACK_ENABLED) return google(a) as unknown as LanguageModelV4
    const chain = [geminiLink(a), ...(b !== a ? [geminiLink(b)] : [])]
    if (GATEWAY_AVAILABLE) chain.push(gatewayLink(kind === 'main' ? GATEWAY_MAIN : GATEWAY_FAST))
    return withChain(chain)
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
  // Gemini con cupo (el principal o el rápido): usa la búsqueda de Google integrada.
  if (AI_PROVIDER === 'google') {
    const id = [GEMINI_MAIN, GEMINI_FAST].find((m) => !isOff(`google/${m}`))
    if (id || !FALLBACK_ENABLED) {
      const m = id ?? GEMINI_MAIN
      return { model: google(m), tools: { google_search: google.tools.googleSearch({}) }, via: `google/${m}` }
    }
  }
  // Gateway (o los dos Gemini agotados): un modelo que ya busca en la web por sí solo.
  const id = process.env.GATEWAY_SEARCH_MODEL || 'perplexity/sonar'
  if (!GATEWAY_AVAILABLE || isOff(`gateway/${id}`)) {
    const back = Math.min(...GEMINI_KEYS.map((k) => unavailable.get(k) ?? 0).filter((t) => t > Date.now()))
    throw new AiUnavailableError(Number.isFinite(back) ? back : null)
  }
  return { model: gateway(id), via: id }
}

/** Avisar desde Visibilidad que el modelo de búsqueda usado se quedó sin cupo o sin acceso. */
export function markSearchModelOut(via: string, e: unknown) {
  if (!FALLBACK_ENABLED) return
  if (via.startsWith('google/') && isQuotaError(e)) markUnavailable(via, nextPacificMidnight())
  else if (isQuotaError(e) || isAccessError(e)) markUnavailable(`gateway/${via}`, Date.now() + 24 * 60 * 60_000)
}

/** ¿Vale la pena reintentar la búsqueda con el próximo modelo? */
export function isOutOfQuota(e: unknown) {
  return isQuotaError(e) || isAccessError(e)
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
