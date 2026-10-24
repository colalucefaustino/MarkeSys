import { generateObject, generateText, stepCountIs } from 'ai'
import { z } from 'zod'
import pLimit from 'p-limit'
import { db } from '@/lib/supabase/server'
import { MODEL_MAIN, MODEL_FAST, todayISO, searchModel } from '@/lib/ai'
import { getDossier, dossierSummary, writeSectionData, ensureDraft } from '@/lib/dossier'
import type { RunProgress } from '@/lib/agents/runs'

const CHANNEL_TIMEOUT = 60_000
const QUERY_CHANNELS = ['llm', 'google_web', 'google_maps'] as const
type QueryChannel = (typeof QUERY_CHANNELS)[number]

export const CHANNEL_LABEL: Record<string, string> = {
  llm: 'Asistentes de IA',
  google_web: 'Google',
  google_maps: 'Google Maps',
  instagram: 'Instagram',
  tiktok: 'TikTok',
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const squash = (s: string) => norm(s).replace(/ /g, '')

function hostOf(url: string) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms = CHANNEL_TIMEOUT): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  return p(ctrl.signal).finally(() => clearTimeout(t))
}

/* ───────────── Fase 1: generar búsquedas ───────────── */

async function generateQueries(brandId: string, runId: string, progress: RunProgress) {
  await progress.init([{ id: 'gen', label: 'Pensando qué buscaría un cliente tuyo' }])
  const d = await getDossier(brandId)
  if (!d.brand) throw new Error('Marca no encontrada')

  const grande = d.brand.size_segment === 'grande'
  const { object } = await generateObject({
    model: MODEL_MAIN,
    schema: z.object({
      queries: z
        .array(
          z.object({
            text: z.string().min(6).max(140),
            kind: z.enum(['generica', 'nicho', 'atributo', 'marca']),
          }),
        )
        .min(10)
        .max(grande ? 14 : 12),
    }),
    prompt: `Sos un especialista en visibilidad digital para negocios argentinos. Hoy es ${todayISO()}.
Armá entre 10 y ${grande ? 14 : 12} búsquedas reales que haría un comprador argentino para encontrar un negocio como este. Escribilas como las tipea la gente (español rioplatense, sin signos de pregunta forzados).

Tipos:
- generica: categoría + ciudad (ej. "zapatillas running en ${d.brand.city ?? 'la ciudad'}").
- nicho: necesidad o subsegmento específico del negocio.
- atributo: busca por un beneficio concreto (envío, cuotas, precio, calidad, material) sin nombrar la marca.
- marca: incluye el nombre "${d.brand.name}" (2 como máximo).
${grande ? '- Sumá sub-segmentos y 2 comparativas contra competidores conocidos.\n' : ''}
Reglas: al menos 6 búsquedas SIN el nombre de la marca. Usá solo rubros, productos y ciudad que figuran en el Expediente. No inventes productos.

EXPEDIENTE:
${dossierSummary(d)}`,
  })

  await db().from('visibility_queries').delete().eq('brand_id', brandId)
  await db()
    .from('visibility_queries')
    .insert(object.queries.map((q) => ({ brand_id: brandId, run_id: runId, text: q.text.trim(), kind: q.kind, approved: true, origin: 'agente' })))

  await progress.update('gen', 'done', `${object.queries.length} búsquedas`)
  await progress.finish({ phase: 'queries', count: object.queries.length })
}

/* ───────────── Canales ───────────── */

interface Identity {
  names: string[]
  squashed: string[]
  domain: string
  handles: string[]
}

function appears(identity: Identity, fields: { title?: string; url?: string; text?: string }[]) {
  const hay = fields.map((f) => `${f.title ?? ''} ${f.url ?? ''} ${f.text ?? ''}`).join(' ')
  const n = norm(hay)
  const s = squash(hay)
  const urlHay = fields.map((f) => (f.url ?? '').toLowerCase()).join(' ')
  if (identity.domain && urlHay.includes(identity.domain)) return true
  if (identity.handles.some((h) => h && s.includes(squash(h)) && squash(h).length >= 4)) return true
  return identity.names.some((nm) => nm.length >= 3 && ` ${n} `.includes(` ${nm} `)) || identity.squashed.some((sq) => sq.length >= 6 && s.includes(sq))
}

async function serper(path: 'search' | 'places', q: string) {
  const key = process.env.SERPER_API_KEY
  if (!key) throw new Error('Falta SERPER_API_KEY')
  return withTimeout(async (signal) => {
    const res = await fetch(`https://google.serper.dev/${path}`, {
      method: 'POST',
      signal,
      headers: { 'X-API-KEY': key, 'content-type': 'application/json' },
      body: JSON.stringify({ q, gl: 'ar', hl: 'es' }),
    })
    if (!res.ok) throw new Error(`Serper ${res.status}`)
    return (await res.json()) as any
  })
}

async function runLlmQuery(q: string, identity: Identity) {
  const { text, sources } = await withTimeout((signal) =>
    generateText({
      ...searchModel(),
      stopWhen: stepCountIs(5),
      abortSignal: signal,
      system:
        'Sos un asistente que ayuda a compradores argentinos. Respondé en español rioplatense con 4 a 6 recomendaciones concretas de negocios o marcas, con nombre propio, y citá fuentes.',
      prompt: q,
    }),
  )
  const urls: string[] = []
  for (const s of (sources ?? []) as any[]) if (s?.url) urls.push(String(s.url))
  for (const m of text.matchAll(/https?:\/\/[^\s)\]]+/g)) urls.push(m[0])
  const uniqueUrls = [...new Set(urls)]
  const isIn = appears(identity, [{ text, url: uniqueUrls.join(' ') }])

  let position: number | null = null
  let mentions: string[] = []
  try {
    const { object } = await generateObject({
      model: MODEL_FAST,
      schema: z.object({ marcas: z.array(z.string()).max(10) }),
      prompt: `De esta respuesta, listá en orden de aparición los nombres de negocios o marcas recomendadas (solo nombres propios, sin repetir):\n\n${text.slice(0, 4000)}`,
    })
    mentions = object.marcas
    if (isIn) {
      const idx = mentions.findIndex((m) => appears(identity, [{ text: m }]))
      position = idx >= 0 ? idx + 1 : 1
    }
  } catch {
    mentions = []
  }
  return {
    appears: isIn,
    position,
    mentions,
    sources: uniqueUrls.slice(0, 10).map((u) => ({ url: u, domain: hostOf(u) })),
    raw: { answer: text.slice(0, 3000) },
  }
}

async function runGoogleWeb(q: string, identity: Identity) {
  const json = await serper('search', q)
  const organic: any[] = (json.organic ?? []).slice(0, 10)
  const idx = organic.findIndex((o) => appears(identity, [{ title: o.title, url: o.link, text: o.snippet }]))
  return {
    appears: idx >= 0,
    position: idx >= 0 ? idx + 1 : null,
    mentions: organic.map((o) => String(o.title ?? '')).filter(Boolean),
    sources: organic.map((o, i) => ({ url: o.link, domain: hostOf(o.link ?? ''), title: o.title, position: i + 1 })),
    raw: { top: organic.map((o) => ({ title: o.title, link: o.link })) },
  }
}

async function runGoogleMaps(q: string, identity: Identity) {
  const json = await serper('places', q)
  const places: any[] = (json.places ?? []).slice(0, 10)
  const idx = places.findIndex((p) => appears(identity, [{ title: p.title, url: p.website }]))
  return {
    appears: idx >= 0,
    position: idx >= 0 ? idx + 1 : null,
    mentions: places.map((p) => String(p.title ?? '')).filter(Boolean),
    sources: places.map((p, i) => ({ url: p.website ?? null, domain: hostOf(p.website ?? ''), title: p.title, position: i + 1 })),
    raw: {
      own: idx >= 0 ? { rating: places[idx].rating, reviews: places[idx].ratingCount ?? places[idx].reviews } : null,
      top: places.map((p) => ({ title: p.title, rating: p.rating, reviews: p.ratingCount ?? p.reviews })),
    },
  }
}

/* ───────────── Redes (Apify) ───────────── */

interface SocialStat {
  handle: string
  seguidores?: number
  posts_por_semana?: number
  engagement?: number
}

async function apify(actor: string, input: unknown) {
  const token = process.env.APIFY_TOKEN
  if (!token) throw new Error('Falta APIFY_TOKEN')
  return withTimeout(async (signal) => {
    const res = await fetch(
      `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}&timeout=55`,
      { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) },
    )
    if (!res.ok) throw new Error(`Apify ${res.status}`)
    return (await res.json()) as any[]
  })
}

function postsPerWeek(dates: number[]) {
  if (dates.length < 2) return undefined
  const span = (Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24 * 7)
  return span > 0 ? Math.round(((dates.length - 1) / span) * 10) / 10 : undefined
}

async function instagramStats(handles: string[]): Promise<SocialStat[]> {
  const items = await apify('apify~instagram-profile-scraper', { usernames: handles })
  return items.map((it) => {
    const posts: any[] = it.latestPosts ?? []
    const followers = Number(it.followersCount) || undefined
    const dates = posts.map((p) => new Date(p.timestamp).getTime()).filter(Number.isFinite)
    const interactions = posts.map((p) => (Number(p.likesCount) || 0) + (Number(p.commentsCount) || 0))
    const avg = interactions.length ? interactions.reduce((a, b) => a + b, 0) / interactions.length : 0
    return {
      handle: String(it.username ?? ''),
      seguidores: followers,
      posts_por_semana: postsPerWeek(dates),
      engagement: followers ? Math.round((avg / followers) * 10000) / 100 : undefined,
    }
  })
}

async function tiktokStats(handles: string[]): Promise<SocialStat[]> {
  const items = await apify('clockworks~tiktok-profile-scraper', { profiles: handles, resultsPerPage: 10 })
  const byAuthor = new Map<string, any[]>()
  for (const it of items) {
    const a = String(it.authorMeta?.name ?? '')
    if (!a) continue
    byAuthor.set(a, [...(byAuthor.get(a) ?? []), it])
  }
  return [...byAuthor.entries()].map(([handle, vids]) => {
    const followers = Number(vids[0].authorMeta?.fans) || undefined
    const dates = vids.map((v) => new Date(v.createTimeISO).getTime()).filter(Number.isFinite)
    const inter = vids.map((v) => (Number(v.diggCount) || 0) + (Number(v.commentCount) || 0) + (Number(v.shareCount) || 0))
    const avg = inter.length ? inter.reduce((a, b) => a + b, 0) / inter.length : 0
    return {
      handle,
      seguidores: followers,
      posts_por_semana: postsPerWeek(dates),
      engagement: followers ? Math.round((avg / followers) * 10000) / 100 : undefined,
    }
  })
}

/* ───────────── Puntaje ───────────── */

function positionScore(appearsFlag: boolean | null, pos: number | null) {
  if (!appearsFlag) return 0
  if (pos == null) return 0.3
  if (pos <= 3) return 1
  if (pos <= 10) return 0.6
  return 0.3
}

const GENERIC_DOMAINS = new Set([
  'google.com', 'google.com.ar', 'wikipedia.org', 'youtube.com', 'facebook.com', 'instagram.com', 'tiktok.com',
  'pinterest.com', 'mercadolibre.com.ar', 'mercadolibre.com', 'linkedin.com', 'twitter.com', 'x.com', 'tripadvisor.com.ar',
  'tripadvisor.com', 'reddit.com', 'infobae.com', 'clarin.com', 'lanacion.com.ar',
])

/* ───────────── Fase 2: ejecutar ───────────── */

async function executeQueries(brandId: string, runId: string, progress: RunProgress) {
  const d = await getDossier(brandId)
  if (!d.brand) throw new Error('Marca no encontrada')

  const { data: queryRows } = await db()
    .from('visibility_queries')
    .select('*')
    .eq('brand_id', brandId)
    .eq('approved', true)
    .order('id')
  const queries = (queryRows ?? []) as { id: string; text: string; kind: string }[]
  if (!queries.length) throw new Error('No hay búsquedas aprobadas para ejecutar.')

  const igChannel = d.channels.find((c) => c.type === 'instagram' && c.handle_or_url)
  const ttChannel = d.channels.find((c) => c.type === 'tiktok' && c.handle_or_url)
  const webChannel = d.channels.find((c) => c.type === 'web' || c.type === 'ecommerce')
  const cleanHandle = (h: string) => h.replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\/@?/i, '').replace(/^@/, '').replace(/\/.*$/, '')
  const igHandle = igChannel ? cleanHandle(igChannel.handle_or_url) : null
  const ttHandle = ttChannel ? cleanHandle(ttChannel.handle_or_url) : null

  const identity: Identity = {
    names: [norm(d.brand.name)].filter(Boolean),
    squashed: [squash(d.brand.name)],
    domain: hostOf(d.brand.website_url ?? webChannel?.handle_or_url ?? ''),
    handles: [igHandle, ttHandle].filter(Boolean) as string[],
  }

  const hasSerper = !!process.env.SERPER_API_KEY
  const hasApify = !!process.env.APIFY_TOKEN

  const steps = [
    { id: 'llm', label: 'Preguntando a asistentes de IA' },
    { id: 'google_web', label: 'Buscando en Google' },
    { id: 'google_maps', label: 'Buscando en Google Maps' },
    { id: 'instagram', label: 'Revisando Instagram' },
    { id: 'tiktok', label: 'Revisando TikTok' },
    { id: 'analisis', label: 'Armando tu diagnóstico' },
  ]
  await progress.init(steps)

  const queryIds = queries.map((q) => q.id)
  await db().from('visibility_results').delete().in('query_id', queryIds)

  const state: Record<string, { ok: number; failed: number; lastError?: string }> = {}
  const results: Record<QueryChannel, { queryId: string; appears: boolean; position: number | null; mentions: string[]; sources: any[]; raw: any }[]> = {
    llm: [],
    google_web: [],
    google_maps: [],
  }

  const runners: Record<QueryChannel, (q: string) => Promise<any>> = {
    llm: (q) => runLlmQuery(q, identity),
    google_web: (q) => runGoogleWeb(q, identity),
    google_maps: (q) => runGoogleMaps(q, identity),
  }

  async function runChannel(channel: QueryChannel) {
    if ((channel === 'google_web' || channel === 'google_maps') && !hasSerper) {
      state[channel] = { ok: 0, failed: 0, lastError: 'Falta SERPER_API_KEY' }
      await progress.update(channel, 'skipped', 'No está configurada la clave de Serper')
      return
    }
    await progress.update(channel, 'running')
    state[channel] = { ok: 0, failed: 0 }
    const limit = pLimit(4)
    await Promise.all(
      queries.map((q) =>
        limit(async () => {
          try {
            const r = await runners[channel](q.text)
            results[channel].push({ queryId: q.id, ...r })
            state[channel].ok++
            await db().from('visibility_results').insert({
              query_id: q.id,
              channel,
              status: 'ok',
              appears: r.appears,
              position: r.position,
              mentions: r.mentions,
              sources: r.sources,
              raw: r.raw,
            })
          } catch (e) {
            state[channel].failed++
            state[channel].lastError = e instanceof Error ? e.message : 'Error'
            await db().from('visibility_results').insert({
              query_id: q.id,
              channel,
              status: 'failed',
              raw: { error: state[channel].lastError },
            })
          }
        }),
      ),
    )
    const s = state[channel]
    await progress.update(
      channel,
      s.ok === 0 ? 'failed' : 'done',
      s.ok === 0 ? `No pude consultar este canal (${s.lastError})` : `${s.ok} de ${queries.length} búsquedas${s.failed ? `, ${s.failed} fallaron` : ''}`,
    )
  }

  const socials: { red: string; own?: SocialStat; competidores: SocialStat[]; estado: 'ok' | 'failed' | 'skipped'; error?: string }[] = []

  async function runSocial(red: 'instagram' | 'tiktok', handle: string | null) {
    if (!handle) {
      await progress.update(red, 'skipped', 'No cargaste el usuario')
      socials.push({ red, competidores: [], estado: 'skipped' })
      return
    }
    if (!hasApify) {
      await progress.update(red, 'skipped', 'No está configurada la clave de Apify')
      socials.push({ red, competidores: [], estado: 'skipped', error: 'Falta APIFY_TOKEN' })
      return
    }
    await progress.update(red, 'running')
    try {
      const compHandles = d.competitors
        .map((c) => (red === 'instagram' ? c.instagram : null))
        .filter(Boolean)
        .map((h: string) => cleanHandle(h))
        .slice(0, 3)
      const all = red === 'instagram' ? await instagramStats([handle, ...compHandles]) : await tiktokStats([handle])
      const own = all.find((s) => squash(s.handle) === squash(handle)) ?? all[0]
      socials.push({ red, own, competidores: all.filter((s) => s !== own), estado: own ? 'ok' : 'failed' })
      await progress.update(red, own ? 'done' : 'failed', own ? `${own.seguidores ?? '?'} seguidores` : 'No encontré el perfil')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error'
      socials.push({ red, competidores: [], estado: 'failed', error: msg })
      await progress.update(red, 'failed', msg)
    }
  }

  await Promise.all([
    ...QUERY_CHANNELS.map((c) => runChannel(c)),
    runSocial('instagram', igHandle),
    runSocial('tiktok', ttHandle),
  ])

  await progress.update('analisis', 'running')

  /* Análisis por código */
  const porCanal = QUERY_CHANNELS.map((canal) => {
    const rows = results[canal]
    const s = state[canal]
    const estado: 'ok' | 'failed' | 'skipped' = !s || (s.ok === 0 && !s.failed) ? 'skipped' : s.ok === 0 ? 'failed' : 'ok'
    const total = rows.length
    const score = total ? (rows.reduce((a, r) => a + positionScore(r.appears, r.position), 0) / total) * 100 : 0
    return {
      canal,
      puntaje: Math.round(score),
      con_aparicion: rows.filter((r) => r.appears).length,
      total,
      estado,
    }
  })
  const okChannels = porCanal.filter((c) => c.estado === 'ok')
  const puntajeGlobal = okChannels.length ? Math.round(okChannels.reduce((a, c) => a + c.puntaje, 0) / okChannels.length) : 0

  const nonBrandIds = new Set(queries.filter((q) => !appears(identity, [{ text: q.text }])).map((q) => q.id))
  const sinNombreAppear = new Set<string>()
  for (const c of QUERY_CHANNELS) for (const r of results[c]) if (nonBrandIds.has(r.queryId) && r.appears) sinNombreAppear.add(r.queryId)

  const compCount = new Map<string, { nombre: string; apariciones: number; canales: Set<string> }>()
  const ownNorm = identity.names[0]
  const bump = (name: string, canal: string) => {
    const key = squash(name)
    if (!key || key.length < 3) return
    if (appears(identity, [{ text: name }])) return
    if (GENERIC_DOMAINS.has(name.toLowerCase())) return
    const cur = compCount.get(key) ?? { nombre: name.trim(), apariciones: 0, canales: new Set<string>() }
    cur.apariciones++
    cur.canales.add(canal)
    compCount.set(key, cur)
  }
  for (const r of results.llm) r.mentions.forEach((m) => bump(m, 'llm'))
  for (const r of results.google_web)
    for (const s of r.sources.slice(0, 10)) {
      if (s.domain && !GENERIC_DOMAINS.has(s.domain) && s.domain !== identity.domain) bump(s.domain.replace(/\.(com|net|org)(\.ar)?$/, ''), 'google_web')
    }
  for (const r of results.google_maps) r.mentions.slice(0, 10).forEach((m) => bump(m, 'google_maps'))
  void ownNorm
  const ranking = [...compCount.values()]
    .sort((a, b) => b.apariciones - a.apariciones)
    .slice(0, 10)
    .map((c) => ({ nombre: c.nombre, apariciones: c.apariciones, canales: [...c.canales] }))

  const domainCount = new Map<string, number>()
  for (const c of ['llm', 'google_web'] as const)
    for (const r of results[c])
      for (const s of r.sources) {
        if (!s.domain || s.domain === identity.domain) continue
        domainCount.set(s.domain, (domainCount.get(s.domain) ?? 0) + 1)
      }
  const fuentes = [...domainCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([dominio, veces]) => ({ dominio, veces }))

  const redes = socials
    .filter((s) => s.estado === 'ok' && s.own)
    .map((s) => {
      const comp = s.competidores.filter((c) => c.seguidores)
      const avgF = comp.length ? comp.reduce((a, c) => a + (c.seguidores ?? 0), 0) / comp.length : null
      return {
        red: s.red,
        handle: s.own!.handle,
        seguidores: s.own!.seguidores,
        posts_por_semana: s.own!.posts_por_semana,
        engagement: s.own!.engagement,
        vs_competidores:
          avgF && s.own!.seguidores
            ? `${s.own!.seguidores > avgF ? 'Tenés más' : 'Tenés menos'} seguidores que el promedio de los competidores cargados (${Math.round(avgF).toLocaleString('es-AR')}).`
            : null,
      }
    })

  const mapsOwn = results.google_maps.find((r) => r.appears)?.raw?.own ?? null

  const analysisInput = {
    puntaje_global: puntajeGlobal,
    por_canal: porCanal,
    sin_nombre: { con_aparicion: sinNombreAppear.size, total: nonBrandIds.size },
    ranking_competidores: ranking.slice(0, 6),
    fuentes_frecuentes: fuentes.slice(0, 6),
    redes,
    maps_propio: mapsOwn,
  }

  let acciones: {
    accion: string
    canal: 'llm' | 'google_web' | 'google_maps' | 'instagram' | 'tiktok' | 'general'
    evidencia: string
    prioridad: 'alta' | 'media' | 'baja'
    esfuerzo: 'bajo' | 'medio' | 'alto'
  }[] = []
  try {
    const { object } = await generateObject({
      model: MODEL_MAIN,
      schema: z.object({
        acciones: z
          .array(
            z.object({
              accion: z.string().describe('Acción concreta y accionable, en rioplatense'),
              canal: z.enum(['llm', 'google_web', 'google_maps', 'instagram', 'tiktok', 'general']),
              evidencia: z.string().describe('Cita los números exactos de los datos que justifican la acción'),
              prioridad: z.enum(['alta', 'media', 'baja']),
              esfuerzo: z.enum(['bajo', 'medio', 'alto']),
            }),
          )
          .min(3)
          .max(8),
      }),
      prompt: `Sos consultor de visibilidad digital. Con estos RESULTADOS MEDIDOS de ${d.brand.name} (Argentina), proponé entre 3 y 8 acciones priorizadas. Cada acción debe citar en "evidencia" números que estén en los datos. Si un canal no se pudo medir, no propongas acciones sobre él. No inventes datos que no estén acá.

RESULTADOS:
${JSON.stringify(analysisInput, null, 2)}

EXPEDIENTE:
${dossierSummary(d)}`,
    })
    acciones = object.acciones
  } catch {
    acciones = []
  }

  const missing: string[] = []
  if (!igHandle) missing.push('Usuario de Instagram')
  if (!ttHandle) missing.push('Usuario de TikTok (si tenés)')
  if (!d.competitors.length) missing.push('Competidores conocidos para comparar')
  const assumptions = [
    'El puntaje mide solo Asistentes de IA, Google y Google Maps. Las redes se muestran aparte porque no se miden por búsqueda.',
    ...(porCanal.some((c) => c.estado !== 'ok') ? ['Algunos canales no se pudieron medir y no cuentan en el puntaje global.'] : []),
  ]

  const visibilidad = {
    fecha: todayISO(),
    puntaje_global: puntajeGlobal,
    por_canal: porCanal,
    sin_nombre: analysisInput.sin_nombre,
    ranking_competidores: ranking,
    fuentes_frecuentes: fuentes,
    redes,
    maps_propio: mapsOwn,
    acciones,
    missing_inputs: missing,
    assumptions,
  }

  await ensureDraft(brandId, 'visibilidad')
  await writeSectionData(brandId, 'visibilidad', visibilidad, { status: 'pending_approval', agentRunId: runId })

  const known = new Set(d.competitors.map((c) => squash(c.name)))
  const toInsert = ranking
    .filter((c) => !known.has(squash(c.nombre)))
    .slice(0, 5)
    .map((c) => ({ brand_id: brandId, name: c.nombre, source: 'detectado', detected_in: c.canales, confirmed: false }))
  if (toInsert.length) await db().from('competitors').insert(toInsert)

  await progress.update('analisis', 'done')
  await progress.finish({ phase: 'execute', puntaje_global: puntajeGlobal, detected: toInsert.length })
}

export async function runA2(brandId: string, runId: string, progress: RunProgress, params: Record<string, string>) {
  if (params.phase === 'execute') return executeQueries(brandId, runId, progress)
  return generateQueries(brandId, runId, progress)
}
