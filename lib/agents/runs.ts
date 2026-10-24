import { db, must } from '@/lib/supabase/server'

export type AgentKey = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8'

export interface ProgressStep {
  id: string
  label: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  detail?: string
}

export async function createRun(brandId: string, agent: AgentKey, input: Record<string, unknown> = {}) {
  const res = await db()
    .from('agent_runs')
    .insert({ brand_id: brandId, agent, status: 'queued', input, progress: [] })
    .select('*')
    .single()
  return must(res) as { id: string }
}

export class RunProgress {
  private steps: ProgressStep[] = []
  constructor(private runId: string) {}

  async init(steps: Omit<ProgressStep, 'status'>[]) {
    this.steps = steps.map((s) => ({ ...s, status: 'pending' }))
    await db()
      .from('agent_runs')
      .update({ status: 'running', started_at: new Date().toISOString(), progress: this.steps })
      .eq('id', this.runId)
  }

  async update(id: string, status: ProgressStep['status'], detail?: string) {
    const s = this.steps.find((x) => x.id === id)
    if (!s) return
    s.status = status
    if (detail !== undefined) s.detail = detail
    await db().from('agent_runs').update({ progress: this.steps }).eq('id', this.runId)
  }

  async add(step: Omit<ProgressStep, 'status'>, status: ProgressStep['status'] = 'running') {
    this.steps.push({ ...step, status })
    await db().from('agent_runs').update({ progress: this.steps }).eq('id', this.runId)
  }

  async finish(output: Record<string, unknown> = {}) {
    await db()
      .from('agent_runs')
      .update({ status: 'done', output, finished_at: new Date().toISOString(), progress: this.steps })
      .eq('id', this.runId)
  }

  async fail(error: string) {
    await db()
      .from('agent_runs')
      .update({ status: 'failed', error, finished_at: new Date().toISOString(), progress: this.steps })
      .eq('id', this.runId)
  }
}

export async function getRun(runId: string) {
  const { data } = await db().from('agent_runs').select('*').eq('id', runId).maybeSingle()
  return data
}

export async function latestRun(brandId: string, agent: AgentKey) {
  const run = await latestRunRaw(brandId, agent)
  if (run && (run.status === 'running' || run.status === 'queued')) {
    const since = new Date(run.started_at ?? run.created_at ?? Date.now()).getTime()
    if (Date.now() - since > 4 * 60 * 1000) {
      await db().from('agent_runs').update({ status: 'failed', error: 'Se cortó por tiempo. Probá de nuevo.' }).eq('id', run.id)
      return { ...run, status: 'failed', error: 'Se cortó por tiempo. Probá de nuevo.' }
    }
  }
  return run
}

async function latestRunRaw(brandId: string, agent: AgentKey) {
  const { data } = await db()
    .from('agent_runs')
    .select('*')
    .eq('brand_id', brandId)
    .eq('agent', agent)
    .order('started_at', { ascending: false, nullsFirst: true })
    .limit(1)
    .maybeSingle()
  return data
}
