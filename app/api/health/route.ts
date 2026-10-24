import { NextResponse } from 'next/server'
import { AI_PROVIDER } from '@/lib/ai'

export const dynamic = 'force-dynamic'

/** Diagnóstico: qué servicios ve esta publicación (sin mostrar claves). */
export async function GET() {
  const has = (k: string) => Boolean(process.env[k] && process.env[k]!.trim())
  return NextResponse.json({
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
    entorno: process.env.VERCEL_ENV ?? 'local',
    ia: AI_PROVIDER === 'gateway' ? 'SIN CLAVE (cargá GOOGLE_GENERATIVE_AI_API_KEY y hacé Redeploy)' : AI_PROVIDER,
    gemini: has('GOOGLE_GENERATIVE_AI_API_KEY'),
    supabase: has('NEXT_PUBLIC_SUPABASE_URL') || has('SUPABASE_URL'),
    supabase_clave_servidor: has('SUPABASE_SERVICE_ROLE_KEY') || has('SUPABASE_SECRET_KEY'),
    elevenlabs: has('ELEVENLABS_API_KEY'),
    serper: has('SERPER_API_KEY'),
    apify: has('APIFY_TOKEN'),
  })
}
