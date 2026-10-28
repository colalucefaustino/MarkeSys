import { gateway } from 'ai'
import { db } from '@/lib/supabase/server'
import { FALLBACK_ENABLED, GATEWAY_AVAILABLE, adoptGeminiExhausted, geminiStatus } from '@/lib/ai'

// Estado de la IA para el indicador de la barra superior y /api/health.
//
// - Gemini no informa cuánto cupo queda: solo sabemos cuándo se agotó (error 429).
//   Ese momento se guarda en Storage para que lo vean todas las instancias del servidor.
// - El AI Gateway sí informa el saldo exacto de crédito.

const BUCKET = 'brand-files'
const STATUS_PATH = 'system/ai-status.json'
/** Por debajo de este saldo (en dólares) se avisa que el crédito de respaldo está bajo. */
const LOW_CREDIT_USD = 1

let persistedCache: { until: number; readAt: number } | null = null
let creditsCache: { balance: number | null; readAt: number } | null = null

/** Guarda hasta cuándo Gemini está sin cupo (lo llama lib/ai.ts). */
export async function persistGeminiExhausted(until: number) {
  persistedCache = { until, readAt: Date.now() }
  const body = new Blob([JSON.stringify({ gemini_agotado_hasta: new Date(until).toISOString() })], {
    type: 'application/json',
  })
  await db().storage.from(BUCKET).upload(STATUS_PATH, body, { upsert: true, contentType: 'application/json' })
}

async function readPersistedUntil(): Promise<number> {
  if (persistedCache && Date.now() - persistedCache.readAt < 60_000) return persistedCache.until
  let until = 0
  try {
    const { data } = await db().storage.from(BUCKET).download(STATUS_PATH)
    if (data) until = Date.parse(JSON.parse(await data.text()).gemini_agotado_hasta) || 0
  } catch {
    // sin archivo o sin Supabase: se asume que Gemini tiene cupo
  }
  persistedCache = { until, readAt: Date.now() }
  return until
}

/** Saldo del AI Gateway en dólares (null si no se puede consultar). Cache de 5 minutos. */
export async function gatewayBalance(): Promise<number | null> {
  if (!GATEWAY_AVAILABLE) return null
  if (creditsCache && Date.now() - creditsCache.readAt < 5 * 60_000) return creditsCache.balance
  let balance: number | null = null
  try {
    const credits = await gateway.getCredits()
    const n = Number(credits.balance)
    balance = Number.isFinite(n) ? n : null
  } catch {
    balance = null
  }
  creditsCache = { balance, readAt: Date.now() }
  return balance
}

export type AiState = 'ok' | 'respaldo' | 'credito_bajo' | 'sin_ia'

export interface AiStatus {
  estado: AiState
  /** Cuándo vuelve el cupo de Gemini (ISO), si está agotado. */
  gemini_vuelve: string | null
  /** Saldo del Gateway en dólares, si se pudo consultar. */
  saldo_gateway: number | null
}

export async function getAiStatus(): Promise<AiStatus> {
  if (!FALLBACK_ENABLED) return { estado: 'ok', gemini_vuelve: null, saldo_gateway: null }

  const persisted = await readPersistedUntil()
  if (persisted > Date.now()) adoptGeminiExhausted(persisted)
  const gemini = geminiStatus()
  const saldo = await gatewayBalance()

  let estado: AiState = 'ok'
  if (gemini.agotado) {
    estado = saldo !== null && saldo <= 0 ? 'sin_ia' : 'respaldo'
  } else if (saldo !== null && saldo > 0 && saldo < LOW_CREDIT_USD) {
    // Con Gemini funcionando, solo avisamos si el respaldo está por terminarse.
    // (Saldo 0 sin uso previo es normal: el crédito gratis se activa con el primer pedido.)
    estado = 'credito_bajo'
  }
  return { estado, gemini_vuelve: gemini.vuelve, saldo_gateway: saldo }
}
