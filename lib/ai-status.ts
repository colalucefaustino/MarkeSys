import { gateway } from 'ai'
import { db } from '@/lib/supabase/server'
import { FALLBACK_ENABLED, GATEWAY_AVAILABLE, adoptUnavailable, geminiStatus } from '@/lib/ai'

// Estado de la IA para el indicador de la barra superior y /api/health.
//
// - Gemini no informa cuánto cupo queda: solo sabemos cuándo se agotó (error 429).
//   Ese momento se guarda en Storage para que lo vean todas las instancias del servidor.
// - El AI Gateway sí informa el saldo exacto de crédito.

const BUCKET = 'brand-files'
const STATUS_PATH = 'system/ai-status.json'
/** Por debajo de este saldo (en dólares) se avisa que el crédito de respaldo está bajo. */
const LOW_CREDIT_USD = 1

let persistedCache: { map: Record<string, number>; readAt: number } | null = null
let creditsCache: { balance: number | null; readAt: number } | null = null

/** Guarda hasta cuándo cada modelo está sin cupo o sin acceso (lo llama lib/ai.ts). */
export async function persistUnavailable(map: Record<string, number>) {
  persistedCache = { map, readAt: Date.now() }
  const body = new Blob([JSON.stringify({ modelos_sin_cupo: map })], { type: 'application/json' })
  await db().storage.from(BUCKET).upload(STATUS_PATH, body, { upsert: true, contentType: 'application/json' })
}

async function readPersisted(): Promise<Record<string, number>> {
  if (persistedCache && Date.now() - persistedCache.readAt < 60_000) return persistedCache.map
  let map: Record<string, number> = {}
  try {
    const { data } = await db().storage.from(BUCKET).download(STATUS_PATH)
    if (data) map = JSON.parse(await data.text()).modelos_sin_cupo ?? {}
  } catch {
    // sin archivo o sin Supabase: se asume que hay cupo
  }
  persistedCache = { map, readAt: Date.now() }
  return map
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

  adoptUnavailable(await readPersisted())
  const gemini = geminiStatus()
  const saldo = await gatewayBalance()

  let estado: AiState = 'ok'
  if (gemini.todos_agotados) {
    // Los dos modelos de Gemini sin cupo: el Gateway solo sirve si tiene saldo pago.
    estado = saldo !== null && saldo > LOW_CREDIT_USD ? 'respaldo' : 'sin_ia'
  } else if (gemini.agotado) {
    estado = 'respaldo'
  } else if (saldo !== null && saldo > 0 && saldo < LOW_CREDIT_USD) {
    // Con Gemini funcionando, solo avisamos si el respaldo está por terminarse.
    // (Saldo 0 sin uso previo es normal: el crédito gratis se activa con el primer pedido.)
    estado = 'credito_bajo'
  }
  return { estado, gemini_vuelve: gemini.vuelve, saldo_gateway: saldo }
}
