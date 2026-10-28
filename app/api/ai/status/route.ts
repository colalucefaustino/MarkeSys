import { NextResponse } from 'next/server'
import { getAiStatus } from '@/lib/ai-status'

export const dynamic = 'force-dynamic'

/** Estado de la IA para el indicador de la barra superior. */
export async function GET() {
  return NextResponse.json(await getAiStatus())
}
