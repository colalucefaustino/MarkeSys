import { NextResponse } from 'next/server'
import { getRun } from '@/lib/agents/runs'

export const dynamic = 'force-dynamic'

export async function GET(_: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params
  const run = await getRun(runId)
  if (!run) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json({ run })
}
