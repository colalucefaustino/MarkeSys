import { NextResponse } from 'next/server'
import { z } from 'zod'
import { startAgent } from '@/lib/agents/start'

export const maxDuration = 300

const Body = z.object({
  brandId: z.string().uuid(),
  agent: z.enum(['A1', 'A2', 'A4', 'A5']),
  params: z.record(z.string(), z.string()).optional(),
})

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const res = await startAgent(parsed.data.brandId, parsed.data.agent, parsed.data.params ?? {})
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
  return NextResponse.json({ runId: res.runId })
}
