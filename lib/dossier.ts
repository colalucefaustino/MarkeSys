import { db, must } from '@/lib/supabase/server'
import type { Origin } from '@/lib/schemas/ficha'

export type SectionKey = 'ficha' | 'visibilidad' | 'percepcion' | 'estrategia' | 'calendario'
export type SectionStatus = 'draft' | 'pending_approval' | 'approved' | 'stale'

export interface SectionRow {
  id: string
  brand_id: string
  section: SectionKey
  version: number
  status: SectionStatus
  data: Record<string, any>
  agent_run_id: string | null
  approved_at: string | null
  created_at: string
}

export const DEPENDENTS: Record<SectionKey, SectionKey[]> = {
  ficha: ['visibilidad', 'percepcion', 'estrategia', 'calendario'],
  visibilidad: ['estrategia', 'calendario'],
  percepcion: ['estrategia'],
  estrategia: ['calendario'],
  calendario: [],
}

export function setPath(obj: Record<string, any>, path: string, value: unknown) {
  const keys = path.split('.')
  let cur = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {}
    cur = cur[k]
  }
  cur[keys[keys.length - 1]] = value
  return obj
}

export function getPath(obj: Record<string, any> | undefined, path: string): any {
  if (!obj) return undefined
  return path.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj)
}

export async function getBrand(brandId: string) {
  const { data } = await db().from('brands').select('*').eq('id', brandId).maybeSingle()
  return data as null | {
    id: string
    name: string
    city: string | null
    size_segment: 'micro' | 'pyme' | 'grande' | null
    stage: 'arranque' | 'onboarding' | 'diagnostico' | 'estrategia' | 'plan' | 'ejecucion'
    website_url: string | null
    no_web_no_catalog: boolean | null
    created_at: string
  }
}

export async function allSectionRows(brandId: string): Promise<SectionRow[]> {
  const res = await db()
    .from('dossier_sections')
    .select('*')
    .eq('brand_id', brandId)
    .order('version', { ascending: false })
  return must(res) as SectionRow[]
}

export async function latestSections(brandId: string) {
  const rows = await allSectionRows(brandId)
  const latest: Partial<Record<SectionKey, SectionRow>> = {}
  const approvedEver: Partial<Record<SectionKey, boolean>> = {}
  for (const r of rows) {
    if (!latest[r.section]) latest[r.section] = r
    if (r.approved_at) approvedEver[r.section] = true
  }
  return { latest, approvedEver }
}

export async function markStale(brandId: string, section: SectionKey) {
  const { latest } = await latestSections(brandId)
  for (const dep of DEPENDENTS[section]) {
    const row = latest[dep]
    if (row && row.status !== 'stale') {
      await db().from('dossier_sections').update({ status: 'stale' }).eq('id', row.id)
    }
  }
}

/** Devuelve la fila editable de la sección. Si la última versión está aprobada crea un borrador nuevo. */
export async function ensureDraft(brandId: string, section: SectionKey): Promise<SectionRow> {
  const { latest } = await latestSections(brandId)
  const row = latest[section]
  if (!row) {
    const res = await db()
      .from('dossier_sections')
      .insert({ brand_id: brandId, section, version: 1, status: 'draft', data: {} })
      .select('*')
      .single()
    return must(res) as SectionRow
  }
  if (row.status === 'approved') {
    const res = await db()
      .from('dossier_sections')
      .insert({
        brand_id: brandId,
        section,
        version: row.version + 1,
        status: 'draft',
        data: row.data,
      })
      .select('*')
      .single()
    await markStale(brandId, section)
    return must(res) as SectionRow
  }
  if (row.status === 'stale') {
    await db().from('dossier_sections').update({ status: 'draft' }).eq('id', row.id)
    return { ...row, status: 'draft' }
  }
  return row
}

export async function setProvenance(
  brandId: string,
  section: string,
  path: string,
  origin: Origin,
  sourceRef?: string | null,
) {
  await db()
    .from('field_provenance')
    .upsert(
      {
        brand_id: brandId,
        section,
        path,
        origin,
        source_ref: sourceRef ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'brand_id,section,path' },
    )
}

export async function saveField(
  brandId: string,
  section: SectionKey,
  path: string,
  value: unknown,
  origin: Origin,
  sourceRef?: string | null,
) {
  const row = await ensureDraft(brandId, section)
  const data = structuredClone(row.data ?? {})
  setPath(data, path, value)
  await db().from('dossier_sections').update({ data }).eq('id', row.id)
  await setProvenance(brandId, section, path, origin, sourceRef)
  return data
}

export async function saveFields(
  brandId: string,
  section: SectionKey,
  fields: { path: string; value: unknown; origin: Origin; sourceRef?: string | null }[],
) {
  const row = await ensureDraft(brandId, section)
  const data = structuredClone(row.data ?? {})
  for (const f of fields) setPath(data, f.path, f.value)
  await db().from('dossier_sections').update({ data }).eq('id', row.id)
  for (const f of fields) await setProvenance(brandId, section, f.path, f.origin, f.sourceRef)
  return data
}

/** Reemplaza la data completa de la sección (salida de un agente). Crea borrador si hace falta. */
export async function writeSectionData(
  brandId: string,
  section: SectionKey,
  data: Record<string, any>,
  opts: { status?: SectionStatus; agentRunId?: string | null } = {},
) {
  const row = await ensureDraft(brandId, section)
  await db()
    .from('dossier_sections')
    .update({
      data,
      status: opts.status ?? row.status,
      agent_run_id: opts.agentRunId ?? row.agent_run_id,
    })
    .eq('id', row.id)
  return row.id
}

export async function getDossier(brandId: string) {
  const [brand, sections, products, competitors, objectives, channels, media, skills, provenance, reviews] =
    await Promise.all([
      getBrand(brandId),
      latestSections(brandId),
      db().from('products').select('*').eq('brand_id', brandId).order('created_at'),
      db().from('competitors').select('*').eq('brand_id', brandId),
      db().from('objectives').select('*').eq('brand_id', brandId).order('priority'),
      db().from('brand_channels').select('*').eq('brand_id', brandId),
      db()
        .from('media')
        .select('id,kind,original_name,mime,parse_status,parse_summary,created_at')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false }),
      db().from('skills').select('id,name,purpose,active').eq('brand_id', brandId).eq('active', true),
      db().from('field_provenance').select('*').eq('brand_id', brandId),
      db().from('reviews').select('id', { count: 'exact', head: true }).eq('brand_id', brandId),
    ])
  return {
    brand,
    sections: sections.latest,
    approvedEver: sections.approvedEver,
    products: (products.data ?? []) as any[],
    competitors: (competitors.data ?? []) as any[],
    objectives: (objectives.data ?? []) as any[],
    channels: (channels.data ?? []) as any[],
    media: (media.data ?? []) as any[],
    skills: (skills.data ?? []) as any[],
    provenance: (provenance.data ?? []) as {
      section: string
      path: string
      origin: Origin
      source_ref: string | null
    }[],
    reviewsCount: reviews.count ?? 0,
  }
}

export type Dossier = Awaited<ReturnType<typeof getDossier>>

export function provenanceMap(d: Dossier) {
  const m: Record<string, { origin: Origin; source_ref: string | null }> = {}
  for (const p of d.provenance) m[`${p.section}.${p.path}`] = { origin: p.origin, source_ref: p.source_ref }
  return m
}

export function dossierSummary(d: Dossier) {
  const ficha = d.sections.ficha?.data ?? {}
  const prov = provenanceMap(d)
  const originOf = (p: string) => prov[`ficha.${p}`]?.origin ?? 'pendiente'
  const lines: string[] = []
  lines.push(`Marca: ${d.brand?.name} · ciudad: ${d.brand?.city ?? 'falta'} · segmento: ${d.brand?.size_segment ?? 'falta'} · web: ${d.brand?.website_url ?? 'sin web'}`)
  lines.push(`Ficha (estado: ${d.sections.ficha?.status ?? 'sin generar'}):`)
  const flat: string[] = []
  const walk = (o: any, base = '') => {
    for (const [k, v] of Object.entries(o ?? {})) {
      const p = base ? `${base}.${k}` : k
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, p)
      else if (v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0) && v !== '') {
        flat.push(`  - ${p} [${originOf(p)}]: ${JSON.stringify(v).slice(0, 220)}`)
      }
    }
  }
  walk(ficha)
  lines.push(...(flat.length ? flat : ['  (vacía)']))
  lines.push(`Productos (${d.products.length}): ` +
    d.products
      .slice(0, 25)
      .map((p) => `${p.name}${p.price ? ` $${p.price}` : ''}${p.stock != null ? ` stock ${p.stock}` : ''}${p.is_star ? ' ★' : ''}${p.excluded ? ' (excluido)' : ''}`)
      .join('; '))
  lines.push(`Objetivos: ${d.objectives.map((o) => `${o.description} (hasta ${o.deadline})`).join(' | ') || 'ninguno'}`)
  lines.push(`Canales: ${d.channels.map((c) => `${c.type}:${c.handle_or_url} [${c.origin}]`).join(', ') || 'ninguno'}`)
  lines.push(`Competidores: ${d.competitors.map((c) => `${c.name}${c.confirmed ? '' : ' (sin confirmar)'}`).join(', ') || 'ninguno'}`)
  lines.push(`Reseñas cargadas: ${d.reviewsCount}`)
  return lines.join('\n')
}

export function mediaSummary(d: Dossier) {
  if (!d.media.length) return 'No hay medios cargados.'
  return d.media
    .slice(0, 30)
    .map((m) => `${m.kind}: ${m.original_name} [${m.parse_status}] ${m.parse_summary ?? ''}`)
    .join('\n')
}
