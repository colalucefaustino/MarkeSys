import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'

// Proveedor de IA según la clave cargada en Vercel:
// 1) ANTHROPIC_API_KEY → Claude (lo que pide el spec)
// 2) GOOGLE_GENERATIVE_AI_API_KEY → Gemini (capa gratuita)
// 3) ninguna → AI Gateway de Vercel (pide tarjeta)
export const AI_PROVIDER: 'anthropic' | 'google' | 'gateway' = process.env.ANTHROPIC_API_KEY
  ? 'anthropic'
  : process.env.GOOGLE_GENERATIVE_AI_API_KEY
    ? 'google'
    : 'gateway'

const CLAUDE_MAIN = process.env.CLAUDE_MODEL_MAIN || 'claude-sonnet-5-5'
const CLAUDE_FAST = process.env.CLAUDE_MODEL_FAST || 'claude-haiku-5-5'
const GEMINI_MAIN = process.env.GEMINI_MODEL_MAIN || 'gemini-3.5-flash'
const GEMINI_FAST = process.env.GEMINI_MODEL_FAST || 'gemini-3.5-flash-lite'

export const MODEL_MAIN =
  AI_PROVIDER === 'anthropic'
    ? anthropic(CLAUDE_MAIN)
    : AI_PROVIDER === 'google'
      ? google(GEMINI_MAIN)
      : `anthropic/${CLAUDE_MAIN.replace(/-(\d+)-(\d+)$/, '-$1.$2')}`

export const MODEL_FAST =
  AI_PROVIDER === 'anthropic'
    ? anthropic(CLAUDE_FAST)
    : AI_PROVIDER === 'google'
      ? google(GEMINI_FAST)
      : `anthropic/${CLAUDE_FAST.replace(/-(\d+)-(\d+)$/, '-$1.$2')}`

/** Modelo + herramienta de búsqueda web para el canal "Respuestas de IA" de Visibilidad. */
export function searchModel(): { model: any; tools?: Record<string, any> } {
  if (AI_PROVIDER === 'anthropic') {
    return { model: anthropic(CLAUDE_MAIN), tools: { web_search: anthropic.tools.webSearch_20250305({ maxUses: 3 }) } }
  }
  if (AI_PROVIDER === 'google') {
    return { model: google(GEMINI_MAIN), tools: { google_search: google.tools.googleSearch({}) } }
  }
  return { model: 'perplexity/sonar' }
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
