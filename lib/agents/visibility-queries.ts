// Búsquedas de Visibilidad armadas por código, sin IA.
// La IA solo agrega 2-3 búsquedas de nicho encima de estas (ver a2.ts).

export type QueryKind = 'generica' | 'nicho' | 'atributo' | 'marca'
export interface DraftQuery {
  text: string
  kind: QueryKind
}

export interface QueryInputs {
  brandName: string
  city: string | null
  rubro: string | null
  categorias: string[]
  beneficios: string[]
  grande: boolean
}

/** Cuántas búsquedas se le preguntan a los asistentes de IA (el canal caro). */
export const LLM_QUERY_LIMIT = 5
/** Total de búsquedas que se miden en Google y Maps. */
export const MAX_QUERIES = 12

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
const lower = (s: string) => clean(s).toLocaleLowerCase('es-AR')

/** Búsquedas base: categoría + ciudad, atributos y marca. */
export function templateQueries(i: QueryInputs): DraftQuery[] {
  const city = i.city ? clean(i.city) : ''
  const where = city ? ` en ${city}` : ''
  const rubro = i.rubro ? lower(i.rubro) : i.categorias[0] ? lower(i.categorias[0]) : ''
  const out: DraftQuery[] = []

  if (rubro) {
    out.push({ text: `${rubro}${where}`, kind: 'generica' })
    out.push({ text: `mejor ${rubro}${where}`, kind: 'generica' })
  }
  for (const cat of i.categorias.slice(0, i.grande ? 3 : 2)) {
    const c = lower(cat)
    if (c && c !== rubro) out.push({ text: `${c}${where}`, kind: 'generica' })
  }

  // Atributos: solo beneficios que el negocio declaró (no se inventan).
  const base = rubro || (i.categorias[0] ? lower(i.categorias[0]) : '')
  if (base) {
    for (const b of i.beneficios.slice(0, 2)) out.push({ text: `${base}${where} con ${lower(b)}`, kind: 'atributo' })
    out.push({ text: `${base}${where} opiniones`, kind: 'atributo' })
    out.push({ text: `${base}${where} precios`, kind: 'atributo' })
  }

  const name = clean(i.brandName)
  if (name) {
    out.push({ text: name, kind: 'marca' })
    if (city) out.push({ text: `${name} ${city}`, kind: 'marca' })
  }
  return dedupe(out)
}

/** Clave para detectar búsquedas casi iguales ("café en grano en Rosario" = "café en grano rosario"). */
const dedupeKey = (s: string) =>
  lower(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter((w) => w && !['en', 'de', 'del', 'la', 'el', 'los', 'las', 'para', 'con'].includes(w))
    .sort()
    .join(' ')

export function dedupe(qs: DraftQuery[]): DraftQuery[] {
  const seen = new Set<string>()
  return qs.filter((q) => {
    const k = dedupeKey(q.text)
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/**
 * Une las plantillas con las de la IA respetando el máximo:
 * prioriza genéricas y de nicho (las que muestran si te encuentran sin buscarte).
 */
export function mergeQueries(templates: DraftQuery[], ai: DraftQuery[], max = MAX_QUERIES): DraftQuery[] {
  const all = dedupe([...templates, ...ai])
  const order: QueryKind[] = ['generica', 'nicho', 'atributo', 'marca']
  const marca = all.filter((q) => q.kind === 'marca').slice(0, 2)
  const rest = all.filter((q) => q.kind !== 'marca').sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
  return [...rest.slice(0, max - marca.length), ...marca]
}

/**
 * Qué búsquedas se le preguntan a los asistentes de IA: solo las que no usan
 * el nombre de la marca, priorizando genéricas y de nicho.
 */
export function pickLlmQueries<T extends { kind: string; text: string }>(
  queries: T[],
  usesBrandName: (text: string) => boolean,
  limit = LLM_QUERY_LIMIT,
): T[] {
  const pool = queries.filter((q) => q.kind !== 'marca' && !usesBrandName(q.text))
  const of = (k: string) => pool.filter((q) => q.kind === k)
  // Mezcla: hasta 3 genéricas y el resto de nicho; si faltan, se completa con lo que haya.
  const picked = [...of('generica').slice(0, 3), ...of('nicho').slice(0, limit - Math.min(3, of('generica').length))]
  for (const q of [...of('cliente'), ...of('generica'), ...of('nicho'), ...of('atributo')]) {
    if (picked.length >= limit) break
    if (!picked.includes(q)) picked.push(q)
  }
  return picked.slice(0, limit)
}
