// Esqueleto del calendario armado por código: fechas, cantidad por semana, formatos,
// productos (según stock) y acciones de visibilidad. La IA solo escribe los textos
// (ver runA5 en strategy.ts), así el plan respeta siempre las reglas.

export type Formato = 'post' | 'carrusel' | 'historia' | 'reel' | 'whatsapp' | 'email' | 'accion_seo' | 'accion_geo' | 'accion_local'
export type PreciosPref = 'siempre' | 'nunca' | 'solo_promos' | 'solo_historias' | undefined

export interface SkeletonProduct {
  name: string
  stock: number | null
  is_star?: boolean | null
  push?: boolean | null
  excluded?: boolean | null
}
export interface SkeletonObjective {
  description: string
  deadline: string
}
export interface SkeletonAction {
  accion: string
  canal: string
  evidencia: string
  prioridad?: string
}
export interface SkeletonInput {
  start: string // AAAA-MM-DD (lunes)
  end: string // AAAA-MM-DD
  piezasPorSemana: number
  formatos: string[]
  socialChannels: string[] // ej. ['Instagram', 'TikTok']
  products: SkeletonProduct[]
  objectives: SkeletonObjective[]
  acciones: SkeletonAction[]
  commercialDates: { name: string; date_start: string }[]
  precios: PreciosPref
}

export interface SkeletonCampaign {
  objetivo: string
  inicio: string
  fin: string
}
export interface SkeletonItem {
  campana: number // -1 = acción de visibilidad
  fecha: string
  canal: string
  formato: Formato
  producto: string | null
  fecha_comercial: string | null
  muestra_precio: boolean
  /** Texto ya resuelto por código (acciones de visibilidad). */
  idea?: string
  porque?: string
}
export interface Skeleton {
  semanas: number
  granularidad: 'día' | 'semana' | 'mes'
  campanas: SkeletonCampaign[]
  items: SkeletonItem[]
  stock: Record<string, 'sobrestock' | 'normal' | 'bajo' | 'sin_dato'>
}

/** Semanas con detalle completo; después, piezas clave. */
const DETAILED_WEEKS = 4
const MAX_PIECES = 60
const CONTENT_FORMATS: Formato[] = ['post', 'historia', 'reel', 'carrusel']

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const dayDiff = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00Z').getTime() - new Date(a + 'T12:00:00Z').getTime()) / 864e5)

/** Días de la semana (0 = lunes) repartidos de forma pareja. */
export function spreadDays(n: number): number[] {
  const fixed: Record<number, number[]> = { 1: [2], 2: [1, 4], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] }
  return fixed[Math.max(1, Math.min(7, n))]
}

/** Clase de stock según el spec: sobrestock ≥ p75 (si no es estrella), bajo ≤ p25 o < 5. */
export function classifyStock(products: SkeletonProduct[]) {
  const withStock = products.filter((p) => typeof p.stock === 'number').map((p) => p.stock as number).sort((a, b) => a - b)
  const q = (f: number) => withStock[Math.min(withStock.length - 1, Math.floor(f * (withStock.length - 1)))]
  const p25 = withStock.length ? q(0.25) : 0
  const p75 = withStock.length ? q(0.75) : 0
  const out: Skeleton['stock'] = {}
  for (const p of products) {
    if (typeof p.stock !== 'number') out[p.name] = 'sin_dato'
    else if (p.stock < 5 || (withStock.length >= 4 && p.stock <= p25)) out[p.name] = 'bajo'
    else if (withStock.length >= 4 && p.stock >= p75 && !p.is_star) out[p.name] = 'sobrestock'
    else out[p.name] = 'normal'
  }
  return out
}

const actionFormat = (canal: string): Formato =>
  canal === 'llm' ? 'accion_geo' : canal === 'google_web' ? 'accion_seo' : 'accion_local'
const actionChannel = (canal: string) =>
  ({ llm: 'Asistentes de IA', google_web: 'Google', google_maps: 'Google Maps', instagram: 'Instagram', tiktok: 'TikTok' })[canal] ?? 'General'

function showsPrice(pref: PreciosPref, formato: Formato) {
  if (pref === 'siempre') return true
  if (pref === 'solo_historias') return formato === 'historia'
  return false // 'nunca', 'solo_promos' (se activa si la IA propone una promo) o sin dato
}

export function buildSkeleton(i: SkeletonInput): Skeleton {
  const totalDays = Math.max(1, dayDiff(i.start, i.end) + 1)
  const semanas = Math.max(1, Math.ceil(totalDays / 7))
  const granularidad = semanas <= 6 ? 'día' : semanas <= 17 ? 'semana' : 'mes'
  const cap = Math.max(1, Math.min(7, Math.round(i.piezasPorSemana) || 3))

  // Una campaña por objetivo (hasta 4), desde el inicio hasta su fecha límite.
  const objectives = [...i.objectives].sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 4)
  const campanas: SkeletonCampaign[] = objectives.map((o) => ({
    objetivo: o.description,
    inicio: i.start,
    fin: o.deadline < i.start ? i.start : o.deadline > i.end ? i.end : o.deadline,
  }))

  // Productos que se pueden empujar: nunca excluidos ni con poco stock; primero estrellas,
  // a impulsar y sobrestock.
  const stock = classifyStock(i.products)
  const rank = (p: SkeletonProduct) => (p.push ? 0 : p.is_star ? 1 : stock[p.name] === 'sobrestock' ? 2 : 3)
  const pushable = i.products.filter((p) => !p.excluded && stock[p.name] !== 'bajo').sort((a, b) => rank(a) - rank(b))

  const formatos = (i.formatos.filter((f) => (CONTENT_FORMATS as string[]).includes(f)) as Formato[]).length
    ? (i.formatos.filter((f) => (CONTENT_FORMATS as string[]).includes(f)) as Formato[])
    : CONTENT_FORMATS
  const channels = i.socialChannels.length ? i.socialChannels : ['Instagram']

  const items: SkeletonItem[] = []
  let n = 0
  for (let w = 0; w < semanas && items.length < MAX_PIECES; w++) {
    const perWeek = w < DETAILED_WEEKS ? cap : Math.min(2, cap)
    for (const day of spreadDays(perWeek)) {
      const fecha = addDays(i.start, w * 7 + day)
      if (fecha > i.end || items.length >= MAX_PIECES) break
      const active = campanas.map((c, idx) => ({ c, idx })).filter(({ c }) => c.inicio <= fecha && fecha <= c.fin)
      const campana = active.length ? active[n % active.length].idx : campanas.length ? campanas.length - 1 : -1
      const formato = formatos[n % formatos.length]
      const canal = formato === 'reel' && channels.length > 1 ? channels[Math.floor(n / formatos.length) % channels.length] : channels[0]
      items.push({
        campana,
        fecha,
        canal,
        formato,
        producto: pushable.length ? pushable[n % pushable.length].name : null,
        fecha_comercial: null,
        muestra_precio: showsPrice(i.precios, formato),
      })
      n++
    }
  }

  // Cada fecha comercial del horizonte se asigna a la pieza más cercana (hasta 5 días antes).
  for (const cd of i.commercialDates) {
    const candidates = items.filter((it) => it.fecha <= cd.date_start && dayDiff(it.fecha, cd.date_start) <= 5 && !it.fecha_comercial)
    const best = candidates.sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
    if (best) best.fecha_comercial = cd.name
  }

  // Acciones de visibilidad del diagnóstico en las dos primeras semanas (no cuentan en el tope).
  const prio = (a: SkeletonAction) => (a.prioridad === 'alta' ? 0 : a.prioridad === 'media' ? 1 : 2)
  ;[...i.acciones]
    .sort((a, b) => prio(a) - prio(b))
    .slice(0, 3)
    .forEach((a, k) => {
      const fecha = addDays(i.start, Math.min(totalDays - 1, k * 4))
      items.push({
        campana: -1,
        fecha,
        canal: actionChannel(a.canal),
        formato: actionFormat(a.canal),
        producto: null,
        fecha_comercial: null,
        muestra_precio: false,
        idea: a.accion,
        porque: a.evidencia,
      })
    })

  items.sort((a, b) => a.fecha.localeCompare(b.fecha))
  return { semanas, granularidad, campanas, items, stock }
}
