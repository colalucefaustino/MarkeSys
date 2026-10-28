import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { AI_PROVIDER, GOOGLE_KEY, MODEL_MAIN, MODEL_FAST, FALLBACK_ENABLED } from '@/lib/ai'
import { getAiStatus } from '@/lib/ai-status'
import { db } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Diagnóstico: qué servicios ve esta publicación (sin mostrar claves). */
export async function GET(req: Request) {
  const probar = new URL(req.url).searchParams.has('probar')
  const pruebas: Record<string, string> = {}
  if (probar) {
    for (const [n, m] of [['modelo_principal', MODEL_MAIN], ['modelo_rapido', MODEL_FAST]] as const) {
      try {
        const r = await generateText({ model: m as any, prompt: 'Respondé solo: ok' })
        pruebas[n] = 'responde: ' + r.text.slice(0, 20)
      } catch (e) {
        pruebas[n] = 'ERROR: ' + (e instanceof Error ? e.message : String(e)).slice(0, 300)
      }
    }
    try {
      const { error } = await db().from('brands').select('id', { count: 'exact', head: true })
      pruebas.base_de_datos = error ? 'ERROR: ' + error.message : 'ok'
    } catch (e) {
      pruebas.base_de_datos = 'ERROR: ' + (e instanceof Error ? e.message : String(e))
    }
  }
  const has = (k: string) => Boolean(process.env[k] && process.env[k]!.trim())
  return NextResponse.json({
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
    entorno: process.env.VERCEL_ENV ?? 'local',
    ia: AI_PROVIDER === 'gateway' && process.env.AI_PROVIDER?.trim().toLowerCase() !== 'gateway' ? 'SIN CLAVE (cargá GOOGLE_GENERATIVE_AI_API_KEY y hacé Redeploy)' : AI_PROVIDER,
    gemini: GOOGLE_KEY ? `sí (variable ${GOOGLE_KEY.name})` : 'no encontrada',
    respaldo_gateway: FALLBACK_ENABLED ? 'activo (Gemini principal → Gemini rápido → AI Gateway)' : 'apagado',
    estado_ia: await getAiStatus(),
    ai_provider_forzado: process.env.AI_PROVIDER?.trim() || null,
    variables_visibles: Object.keys(process.env).filter((k) => /GOOGLE|GEMINI|SUPABASE|ELEVEN|SERPER|APIFY|ANTHROPIC|^AI_|GATEWAY|_MODEL_/i.test(k)).sort(),
    supabase: has('NEXT_PUBLIC_SUPABASE_URL') || has('SUPABASE_URL'),
    supabase_clave_servidor: has('SUPABASE_SERVICE_ROLE_KEY') || has('SUPABASE_SECRET_KEY'),
    elevenlabs: has('ELEVENLABS_API_KEY'),
    serper: has('SERPER_API_KEY'),
    apify: has('APIFY_TOKEN'),
    ...(probar ? { pruebas } : {}),
  })
}
