import { db } from '@/lib/supabase/server'
import { getBrand, latestSections, type SectionKey, type SectionStatus } from '@/lib/dossier'

export type TabKey =
  | 'copiloto'
  | 'marca'
  | 'visibilidad'
  | 'percepcion'
  | 'estrategia'
  | 'calendario'
  | 'contenido'
  | 'medios'
  | 'ads'
  | 'dashboard'

export type TabStatus = 'bloqueada' | 'en_curso' | 'esperando' | 'aprobada' | 'desactualizada'

export const TAB_GROUPS: { label: string | null; tools?: boolean; tabs: { key: TabKey; label: string; icon: string }[] }[] = [
  { label: null, tabs: [{ key: 'copiloto', label: 'Marky', icon: 'sparkles' }] },
  {
    label: 'Diagnóstico',
    tabs: [
      { key: 'marca', label: 'Marca', icon: 'store' },
      { key: 'visibilidad', label: 'Visibilidad digital', icon: 'search' },
      { key: 'percepcion', label: 'Percepción', icon: 'message' },
    ],
  },
  { label: 'Estrategia', tabs: [{ key: 'estrategia', label: 'Nicho y posicionamiento', icon: 'target' }] },
  { label: 'Plan', tabs: [{ key: 'calendario', label: 'Calendario', icon: 'calendar' }] },
  {
    label: 'Herramientas',
    tools: true,
    tabs: [
      { key: 'contenido', label: 'Contenido', icon: 'pen' },
      { key: 'medios', label: 'Medios', icon: 'image' },
      { key: 'ads', label: 'Ads (Meta)', icon: 'megaphone' },
      { key: 'dashboard', label: 'Dashboard', icon: 'chart' },
    ],
  },
]

export const TAB_KEYS = TAB_GROUPS.flatMap((g) => g.tabs.map((t) => t.key))

export const STAGES = [
  { key: 'marca', label: 'Marca' },
  { key: 'diagnostico', label: 'Diagnóstico' },
  { key: 'estrategia', label: 'Estrategia' },
  { key: 'plan', label: 'Plan' },
  { key: 'contenido', label: 'Contenido' },
] as const

export function stageIndex(stage: string) {
  switch (stage) {
    case 'arranque':
    case 'onboarding':
      return 0
    case 'diagnostico':
      return 1
    case 'estrategia':
      return 2
    case 'plan':
      return 3
    default:
      return 4
  }
}

export interface TabState {
  locked: boolean
  reason?: string
  status?: TabStatus
}

export interface BrandState {
  stage: string
  tabs: Record<TabKey, TabState>
  sectionStatus: Partial<Record<SectionKey, SectionStatus>>
  visibilityScore: number | null
}

function fromSection(status?: SectionStatus): TabStatus | undefined {
  if (!status) return 'en_curso'
  if (status === 'approved') return 'aprobada'
  if (status === 'pending_approval') return 'esperando'
  if (status === 'stale') return 'desactualizada'
  return 'en_curso'
}

export async function getBrandState(brandId: string): Promise<BrandState | null> {
  const brand = await getBrand(brandId)
  if (!brand) return null
  const { latest, approvedEver } = await latestSections(brandId)
  const { count: approvedItems } = await db()
    .from('plan_items')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    .in('status', ['aprobada', 'producida'])

  const fichaOk = !!approvedEver.ficha
  // Percepción se analiza dentro de Estrategia: alcanza con Visibilidad aprobada
  const diagOk = !!approvedEver.visibilidad
  const stratOk = !!approvedEver.estrategia
  const planOk = !!approvedEver.calendario

  const sec = (k: SectionKey) => fromSection(latest[k]?.status)
  const tabs: Record<TabKey, TabState> = {
    copiloto: { locked: false, status: brand.stage === 'arranque' ? 'en_curso' : undefined },
    marca: { locked: false, status: brand.stage === 'arranque' ? undefined : sec('ficha') },
    visibilidad: fichaOk
      ? { locked: false, status: latest.visibilidad ? sec('visibilidad') : 'en_curso' }
      : { locked: true, reason: 'Primero aprobá tu Ficha en la pestaña Marca.' },
    percepcion: fichaOk
      ? { locked: false, status: latest.percepcion ? sec('percepcion') : 'en_curso' }
      : { locked: true, reason: 'Primero aprobá tu Ficha en la pestaña Marca.' },
    estrategia: diagOk
      ? { locked: false, status: latest.estrategia ? sec('estrategia') : 'en_curso' }
      : {
          locked: true,
          reason: 'Falta aprobar el diagnóstico de Visibilidad digital (al final de esa pestaña).',
        },
    calendario: stratOk
      ? { locked: false, status: latest.calendario ? sec('calendario') : 'en_curso' }
      : { locked: true, reason: 'Falta aprobar tu estrategia de nicho y posicionamiento.' },
    contenido:
      (approvedItems ?? 0) > 0 || ((latest.calendario?.data as any)?.items ?? []).some((i: any) => i.status === 'aprobada')
        ? { locked: false }
        : { locked: true, reason: 'Aprobá al menos un ítem del calendario para empezar a producir.' },
    medios: { locked: false },
    ads: planOk
      ? { locked: false }
      : { locked: true, reason: 'Aprobá el calendario para crear campañas de anuncios.' },
    dashboard: { locked: false },
  }

  const vis = latest.visibilidad?.data as any
  const visibilityScore = typeof vis?.puntaje_global === 'number' ? vis.puntaje_global : null

  return {
    stage: brand.stage,
    tabs,
    sectionStatus: Object.fromEntries(Object.entries(latest).map(([k, v]) => [k, v!.status])),
    visibilityScore,
  }
}
