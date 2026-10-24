import { generateObject } from 'ai'
import { z } from 'zod'
import * as cheerio from 'cheerio'
import pLimit from 'p-limit'
import { db } from '@/lib/supabase/server'
import { MODEL_FAST } from '@/lib/ai'
import { getDossier, getBrand, saveFields, writeSectionData, ensureDraft, getPath, setPath, provenanceMap, dossierSummary } from '@/lib/dossier'
import { parseMedia, upsertProducts } from '@/lib/media/parse'
import type { RunProgress } from '@/lib/agents/runs'
import { computeChecklist } from '@/lib/checklist'

async function fetchText(url: string, ms = 12000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; MarkeSysBot/1.0)', 'accept-language': 'es-AR,es;q=0.9' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(t)
  }
}

function normalizeUrl(u: string) {
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

const SOCIAL: { type: 'instagram' | 'tiktok' | 'facebook' | 'whatsapp'; re: RegExp }[] = [
  { type: 'instagram', re: /instagram\.com\/([A-Za-z0-9._]+)/i },
  { type: 'tiktok', re: /tiktok\.com\/@([A-Za-z0-9._]+)/i },
  { type: 'facebook', re: /facebook\.com\/([A-Za-z0-9.\-]+)/i },
  { type: 'whatsapp', re: /(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?(\d+)/i },
]

const IGNORED_HANDLES = new Set(['p', 'reel', 'reels', 'explore', 'sharer', 'sharer.php', 'tr', 'share', 'plugins', 'dialog'])

async function readWeb(brandId: string, rawUrl: string, progress: RunProgress) {
  const url = normalizeUrl(rawUrl)
  const origin = new URL(url).origin
  let html = ''
  try {
    html = await fetchText(url)
  } catch (e) {
    throw new Error(`No pude abrir ${url}: ${e instanceof Error ? e.message : 'error'}`)
  }
  const $ = cheerio.load(html)
  const links = $('a[href]')
    .map((_, a) => $(a).attr('href') ?? '')
    .get()
  const channels: { type: string; handle: string }[] = []
  for (const l of links) {
    for (const s of SOCIAL) {
      const mt = l.match(s.re)
      if (mt && !IGNORED_HANDLES.has(mt[1].toLowerCase()) && !channels.some((c) => c.type === s.type)) {
        channels.push({ type: s.type, handle: mt[1] })
      }
    }
  }

  $('script,style,noscript,svg,iframe').remove()
  const title = $('title').first().text().trim()
  const description = $('meta[name="description"]').attr('content') ?? ''
  const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 7000)

  // Productos: Shopify expone /products.json
  let shopify: { name: string; price?: number; category?: string }[] = []
  try {
    const raw = await fetchText(`${origin}/products.json?limit=250`, 8000)
    const json = JSON.parse(raw)
    shopify = (json.products ?? []).map((p: any) => ({
      name: String(p.title),
      price: Number(p.variants?.[0]?.price) || undefined,
      category: p.product_type || undefined,
    }))
  } catch {
    // no es Shopify
  }

  const { object } = await generateObject({
    model: MODEL_FAST,
    schema: z.object({
      rubro: z.string().optional(),
      historia: z.string().optional(),
      diferencial: z.string().optional(),
      tono: z.array(z.string()).max(5),
      beneficios: z.array(z.string()).max(6),
      canales_venta: z.array(z.string()),
      productos: z.array(z.object({ name: z.string(), price: z.number().optional(), category: z.string().optional() })).max(60),
    }),
    prompt: `Texto de la web de un negocio argentino (${url}).
Título: ${title}
Descripción: ${description}
Contenido: ${text}

Extraé SOLO lo que figura en el texto: rubro, historia breve, diferencial, tono con el que habla, beneficios comunicables (cuotas, envío, retiro, garantía), canales de venta (tienda online, local, WhatsApp) y productos con precio en pesos si aparece. Si algo no está, dejalo vacío. Prohibido inventar.`,
  })

  const products = shopify.length ? shopify : object.productos
  const ref = url
  const fields: { path: string; value: unknown; origin: 'inferido'; sourceRef: string }[] = []
  if (object.rubro) fields.push({ path: 'marca.rubro', value: object.rubro, origin: 'inferido', sourceRef: ref })
  if (object.historia) fields.push({ path: 'marca.historia', value: object.historia, origin: 'inferido', sourceRef: ref })
  if (object.diferencial) fields.push({ path: 'marca.diferencial', value: object.diferencial, origin: 'inferido', sourceRef: ref })
  if (object.tono.length) fields.push({ path: 'comunicacion.tono', value: object.tono, origin: 'inferido', sourceRef: ref })
  if (object.beneficios.length) fields.push({ path: 'beneficios_comunicables', value: object.beneficios, origin: 'inferido', sourceRef: ref })
  if (object.canales_venta.length) fields.push({ path: 'marca.canales_venta', value: object.canales_venta, origin: 'inferido', sourceRef: ref })
  if (fields.length) await saveFields(brandId, 'ficha', fields)

  if (products.length) await upsertProducts({ brand_id: brandId, id: '' }, products, 'web')

  const existing = await db().from('brand_channels').select('type').eq('brand_id', brandId)
  const have = new Set((existing.data ?? []).map((c: any) => c.type))
  const toAdd = channels.filter((c) => !have.has(c.type))
  if (!have.has('web')) toAdd.push({ type: 'web', handle: url })
  if (toAdd.length) {
    await db()
      .from('brand_channels')
      .insert(toAdd.map((c) => ({ brand_id: brandId, type: c.type, handle_or_url: c.handle, origin: 'inferido' })))
  }
  await progress.update(
    'web',
    'done',
    `${products.length} productos${channels.length ? ` y ${channels.map((c) => c.type).join(', ')}` : ''}`,
  )
}

async function consolidate(brandId: string) {
  const d = await getDossier(brandId)
  const prices = d.products.map((p) => Number(p.price)).filter((n) => n > 0)
  const cats = [...new Set(d.products.map((p) => p.category).filter(Boolean))] as string[]
  const fields: { path: string; value: unknown; origin: 'inferido'; sourceRef: string }[] = []
  const prov = provenanceMap(d)
  const isConfirmed = (p: string) => prov[`ficha.${p}`]?.origin === 'confirmado'

  if (d.products.length) {
    if (!isConfirmed('productos_resumen.total')) fields.push({ path: 'productos_resumen.total', value: d.products.length, origin: 'inferido', sourceRef: 'productos cargados' })
    if (!isConfirmed('productos_resumen.categorias') && cats.length) fields.push({ path: 'productos_resumen.categorias', value: cats.slice(0, 20), origin: 'inferido', sourceRef: 'productos cargados' })
    if (!isConfirmed('productos_resumen.rango_precio') && prices.length) {
      fields.push({ path: 'productos_resumen.rango_precio', value: { min: Math.min(...prices), max: Math.max(...prices) }, origin: 'inferido', sourceRef: 'productos cargados' })
    }
  }
  if (d.brand) {
    await ensureDraft(brandId, 'ficha')
    const base = [
      { path: 'marca.nombre', value: d.brand.name },
      ...(d.brand.city ? [{ path: 'marca.ciudad', value: d.brand.city }] : []),
    ]
    await saveFields(brandId, 'ficha', base.map((b) => ({ ...b, origin: 'confirmado' as const, sourceRef: 'arranque' })))
  }
  if (fields.length) await saveFields(brandId, 'ficha', fields)

  const fresh = await getDossier(brandId)
  const checklist = computeChecklist(fresh)
  const { object } = await generateObject({
    model: MODEL_FAST,
    schema: z.object({
      resumen: z.string().describe('2 o 3 líneas en rioplatense de lo que se entendió del negocio, aclarando que es deducido'),
      missing_inputs: z.array(z.string()).max(8),
      assumptions: z.array(z.string()).max(6),
    }),
    prompt: `Este es el Expediente deducido de un negocio argentino:
${dossierSummary(fresh)}

Faltantes del checklist: ${JSON.stringify(checklist.filter((c) => !c.done).map((c) => c.label))}

Escribí: un resumen breve de lo que se entendió (aclarando que es deducido y hay que confirmarlo), la lista de datos que faltan y las suposiciones que hiciste. Solo con lo que está en el Expediente.`,
  })
  const row = await ensureDraft(brandId, 'ficha')
  const data = structuredClone(row.data ?? {})
  setPath(data, 'missing_inputs', object.missing_inputs)
  setPath(data, 'assumptions', object.assumptions)
  await writeSectionData(brandId, 'ficha', data)
  return object.resumen
}

export async function runA1(brandId: string, runId: string, progress: RunProgress, params: Record<string, string>) {
  const brand = await getBrand(brandId)
  if (!brand) throw new Error('Marca no encontrada')

  let q = db().from('media').select('id,kind,original_name').eq('brand_id', brandId)
  if (params.mediaId) q = q.eq('id', params.mediaId)
  else q = q.in('parse_status', ['pending', 'failed'])
  const { data: mediaRows } = await q

  const steps: { id: string; label: string }[] = []
  if (brand.website_url && !params.mediaId) steps.push({ id: 'web', label: `Leyendo ${brand.website_url}` })
  for (const m of mediaRows ?? []) steps.push({ id: `m-${m.id}`, label: `Leyendo ${m.original_name ?? m.kind}` })
  steps.push({ id: 'consolidar', label: 'Armando tu Ficha' })
  await progress.init(steps)

  const jobs: Promise<unknown>[] = []
  if (brand.website_url && !params.mediaId) {
    await progress.update('web', 'running')
    jobs.push(
      readWeb(brandId, brand.website_url, progress).catch(async (e) => {
        await progress.update('web', 'failed', e instanceof Error ? e.message : 'No pude leer la web')
      }),
    )
  }
  const limit = pLimit(3)
  for (const m of mediaRows ?? []) {
    jobs.push(
      limit(async () => {
        await progress.update(`m-${m.id}`, 'running')
        await parseMedia(m.id)
        const { data } = await db().from('media').select('parse_status,parse_summary').eq('id', m.id).single()
        await progress.update(`m-${m.id}`, data?.parse_status === 'parsed' ? 'done' : 'failed', data?.parse_summary ?? undefined)
      }),
    )
  }
  await Promise.all(jobs)

  await progress.update('consolidar', 'running')
  const resumen = await consolidate(brandId)
  await progress.update('consolidar', 'done')
  await progress.finish({ resumen })
}
