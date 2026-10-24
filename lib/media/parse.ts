import { generateObject } from 'ai'
import { z } from 'zod'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { db } from '@/lib/supabase/server'
import { MODEL_FAST } from '@/lib/ai'
import { saveFields } from '@/lib/dossier'

interface MediaRow {
  id: string
  brand_id: string
  kind: string
  storage_path: string
  original_name: string | null
  mime: string | null
}

const BUCKET = 'brand-files'

async function download(path: string) {
  const { data, error } = await db().storage.from(BUCKET).download(path)
  if (error || !data) throw new Error(`No pude leer el archivo: ${error?.message ?? 'vacío'}`)
  return Buffer.from(await data.arrayBuffer())
}

function isSheet(m: MediaRow) {
  return /\.(xlsx|xls|csv)$/i.test(m.original_name ?? '') || /sheet|excel|csv/.test(m.mime ?? '')
}

function toRows(buf: Buffer, name: string): Record<string, any>[] {
  if (/\.csv$/i.test(name)) {
    const parsed = Papa.parse<Record<string, any>>(buf.toString('utf8'), { header: true, skipEmptyLines: true })
    return parsed.data
  }
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
  return XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[wb.SheetNames[0]], { defval: null })
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = String(v).replace(/[^\d,.-]/g, '')
  if (!s) return null
  if (s.includes(',') && s.includes('.')) {
    // 1.234,56 (AR) o 1,234.56
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (s.includes(',')) {
    s = s.replace(',', '.')
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const ProductItem = z.object({
  sku: z.string().optional(),
  name: z.string(),
  category: z.string().optional(),
  price: z.number().optional(),
  stock: z.number().optional(),
})

async function mapColumns(headers: string[], sample: Record<string, any>[], fields: string[], purpose: string) {
  const { object } = await generateObject({
    model: MODEL_FAST,
    schema: z.object({
      mapping: z.record(z.string(), z.string().nullable()).describe('campo -> nombre exacto de columna (o null si no existe)'),
      note: z.string().describe('Si falta una columna importante, qué hacer, en una frase en español'),
    }),
    prompt: `Tengo una planilla de ${purpose}. Columnas: ${JSON.stringify(headers)}.
Primeras filas: ${JSON.stringify(sample.slice(0, 6))}.
Devolvé para cada campo (${fields.join(', ')}) el nombre EXACTO de la columna que le corresponde, o null si no hay.`,
  })
  return object
}

async function parseCatalogOrStock(m: MediaRow, buf: Buffer) {
  const rows = toRows(buf, m.original_name ?? 'x.xlsx')
  if (!rows.length) throw new Error('La planilla está vacía.')
  const headers = Object.keys(rows[0])
  const { mapping, note } = await mapColumns(
    headers,
    rows,
    ['sku', 'name', 'category', 'price', 'stock'],
    m.kind === 'stock' ? 'stock' : 'catálogo de productos',
  )
  const col = (f: string) => (mapping[f] && headers.includes(mapping[f]!) ? mapping[f]! : null)
  if (!col('name')) throw new Error('No encontré la columna del nombre del producto: subí otro archivo o seguimos sin esto.')
  const items = rows
    .map((r) => ({
      sku: col('sku') ? String(r[col('sku')!] ?? '').trim() || undefined : undefined,
      name: String(r[col('name')!] ?? '').trim(),
      category: col('category') ? String(r[col('category')!] ?? '').trim() || undefined : undefined,
      price: col('price') ? num(r[col('price')!]) ?? undefined : undefined,
      stock: col('stock') ? num(r[col('stock')!]) ?? undefined : undefined,
    }))
    .filter((i) => i.name)
  await upsertProducts(m, items, m.kind === 'stock' ? 'stock' : 'catalogo')
  const missing = [!col('price') && 'precios', !col('stock') && 'stock'].filter(Boolean).join(' y ')
  return {
    summary: `${items.length} productos leídos${missing ? `. No encontré columna de ${missing}` : ''}.`,
    parsed: { mapping, note, count: items.length },
  }
}

export async function upsertProducts(
  m: { brand_id: string; id: string },
  items: z.infer<typeof ProductItem>[],
  source: 'catalogo' | 'stock' | 'web' | 'foto',
) {
  const { data: existing } = await db().from('products').select('id,sku,name').eq('brand_id', m.brand_id)
  const bySku = new Map((existing ?? []).filter((e: any) => e.sku).map((e: any) => [String(e.sku).toLowerCase(), e.id]))
  const byName = new Map((existing ?? []).map((e: any) => [String(e.name).toLowerCase(), e.id]))
  const inserts: any[] = []
  for (const it of items) {
    const id = (it.sku && bySku.get(it.sku.toLowerCase())) || byName.get(it.name.toLowerCase())
    if (id) {
      const patch: Record<string, unknown> = {}
      if (it.price != null) patch.price = it.price
      if (it.stock != null) patch.stock = it.stock
      if (it.category) patch.category = it.category
      if (it.sku) patch.sku = it.sku
      if (Object.keys(patch).length) await db().from('products').update(patch).eq('id', id)
    } else {
      inserts.push({
        brand_id: m.brand_id,
        sku: it.sku ?? null,
        name: it.name,
        category: it.category ?? null,
        price: it.price ?? null,
        stock: it.stock != null ? Math.round(it.stock) : null,
        source,
      })
    }
  }
  for (let i = 0; i < inserts.length; i += 200) await db().from('products').insert(inserts.slice(i, i + 200))
}

async function parseSales(m: MediaRow, buf: Buffer) {
  const rows = toRows(buf, m.original_name ?? 'x.xlsx')
  if (!rows.length) throw new Error('La planilla de ventas está vacía.')
  const headers = Object.keys(rows[0])
  const { mapping } = await mapColumns(headers, rows, ['date', 'amount', 'product', 'units', 'order_id'], 'ventas')
  const col = (f: string) => (mapping[f] && headers.includes(mapping[f]!) ? mapping[f]! : null)
  if (!col('date') || !col('amount')) {
    throw new Error('No encontré fecha o monto de venta: subí otro archivo o seguimos sin ventas.')
  }
  const monthly = new Map<string, { total: number; orders: Set<string> | number }>()
  const prod = new Map<string, { total: number; units: number }>()
  let n = 0
  for (const r of rows) {
    const rawDate = r[col('date')!]
    const d = rawDate instanceof Date ? rawDate : new Date(String(rawDate).replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/, '$3-$2-$1'))
    const amount = num(r[col('amount')!])
    if (isNaN(d.getTime()) || amount == null) continue
    n++
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const cur = monthly.get(month) ?? { total: 0, orders: 0 }
    cur.total += amount
    cur.orders = (cur.orders as number) + 1
    monthly.set(month, cur)
    if (col('product')) {
      const p = String(r[col('product')!] ?? '').trim()
      if (p) {
        const pc = prod.get(p) ?? { total: 0, units: 0 }
        pc.total += amount
        pc.units += col('units') ? num(r[col('units')!]) ?? 1 : 1
        prod.set(p, pc)
      }
    }
  }
  if (!n) throw new Error('No pude leer ninguna venta con fecha y monto válidos.')
  await db().from('sales_monthly').delete().eq('brand_id', m.brand_id)
  await db().from('sales_products').delete().eq('brand_id', m.brand_id)
  await db()
    .from('sales_monthly')
    .insert([...monthly].map(([month, v]) => ({ brand_id: m.brand_id, month, total: Math.round(v.total), orders: v.orders as number, source_media_id: m.id })))
  if (prod.size) {
    await db()
      .from('sales_products')
      .insert([...prod].map(([product, v]) => ({ brand_id: m.brand_id, product, total: Math.round(v.total), units: Math.round(v.units), source_media_id: m.id })))
  }
  return { summary: `${n} ventas en ${monthly.size} meses.`, parsed: { sales: n, months: monthly.size } }
}

async function parseReviews(m: MediaRow, buf: Buffer) {
  const text = buf.toString('utf8')
  let items: { author?: string; text: string; rating?: number | null }[] = []
  if (/\.csv$/i.test(m.original_name ?? '')) {
    const rows = toRows(buf, 'x.csv')
    const headers = Object.keys(rows[0] ?? {})
    const { mapping } = await mapColumns(headers, rows, ['text', 'rating', 'author'], 'reseñas de clientes')
    const c = (f: string) => (mapping[f] && headers.includes(mapping[f]!) ? mapping[f]! : null)
    if (!c('text')) throw new Error('No encontré la columna con el texto de la reseña.')
    items = rows.map((r) => ({ text: String(r[c('text')!] ?? '').trim(), rating: c('rating') ? num(r[c('rating')!]) : null, author: c('author') ? String(r[c('author')!] ?? '') : undefined }))
  } else {
    items = text.split(/\n\s*\n|\r?\n/).map((t) => ({ text: t.trim() }))
  }
  items = items.filter((i) => i.text.length > 5)
  if (!items.length) throw new Error('No encontré reseñas en el archivo.')
  await insertReviews(m.brand_id, items, 'archivo')
  return { summary: `${items.length} reseñas leídas.`, parsed: { count: items.length } }
}

export async function insertReviews(
  brandId: string,
  items: { author?: string; text: string; rating?: number | null }[],
  source: 'pegado' | 'archivo',
) {
  await db()
    .from('reviews')
    .insert(items.map((i) => ({ brand_id: brandId, source, author: i.author ?? null, text: i.text, rating: i.rating ?? null })))
}

async function parseWithVision(m: MediaRow, buf: Buffer) {
  const mediaType = m.mime || (/\.pdf$/i.test(m.original_name ?? '') ? 'application/pdf' : 'image/jpeg')
  const part = { type: 'file' as const, data: buf, mediaType }

  if (m.kind === 'branding' || m.kind === 'logo') {
    const { object } = await generateObject({
      model: MODEL_FAST,
      schema: z.object({
        colores: z.array(z.object({ hex: z.string(), uso: z.string() })).max(6),
        tipografias: z.array(z.string()),
        tono: z.array(z.string()),
        frases_no: z.array(z.string()),
        estilo: z.string().optional(),
        observacion: z.string(),
      }),
      messages: [
        {
          role: 'user',
          content: [
            part,
            {
              type: 'text',
              text:
                'Este es el manual de marca o logo de un negocio argentino. Extraé SOLO lo que se ve o está escrito: colores (hex aproximado y uso: principal, secundario, acento), tipografías, tono de comunicación y cosas prohibidas. Si algo no aparece, dejá la lista vacía. Nada de inventar.',
            },
          ],
        },
      ],
    })
    const fields: { path: string; value: unknown; origin: 'inferido'; sourceRef: string }[] = []
    const ref = m.original_name ?? m.kind
    if (object.colores.length) fields.push({ path: 'identidad_visual.colores', value: object.colores, origin: 'inferido', sourceRef: ref })
    if (object.tipografias.length) fields.push({ path: 'identidad_visual.tipografias', value: object.tipografias, origin: 'inferido', sourceRef: ref })
    if (object.estilo) fields.push({ path: 'identidad_visual.estilo', value: object.estilo, origin: 'inferido', sourceRef: ref })
    if (object.tono.length) fields.push({ path: 'comunicacion.tono', value: object.tono, origin: 'inferido', sourceRef: ref })
    if (object.frases_no.length) fields.push({ path: 'comunicacion.frases_no', value: object.frases_no, origin: 'inferido', sourceRef: ref })
    if (m.kind === 'logo') fields.push({ path: 'identidad_visual.logo_media_id', value: m.id, origin: 'inferido', sourceRef: ref })
    if (fields.length) await saveFields(m.brand_id, 'ficha', fields)
    return { summary: object.observacion, parsed: object }
  }

  if (m.kind === 'fotos') {
    const { object } = await generateObject({
      model: MODEL_FAST,
      schema: z.object({ productos: z.array(z.object({ name: z.string(), category: z.string().optional() })).max(5), descripcion: z.string() }),
      messages: [
        {
          role: 'user',
          content: [
            part,
            { type: 'text', text: 'Foto de producto de un negocio argentino. Nombrá el o los productos que se ven, de forma tentativa y breve. Si no se distingue, devolvé la lista vacía.' },
          ],
        },
      ],
    })
    return { summary: object.descripcion, parsed: object }
  }

  // catálogo / stock en PDF o imagen
  const { object } = await generateObject({
    model: MODEL_FAST,
    schema: z.object({ productos: z.array(ProductItem).max(300), nota: z.string() }),
    messages: [
      {
        role: 'user',
        content: [
          part,
          { type: 'text', text: 'Leé este catálogo o lista de stock. Extraé cada producto con nombre y, solo si figura, precio (en pesos argentinos, número) y stock. No inventes datos que no estén.' },
        ],
      },
    ],
  })
  if (!object.productos.length) throw new Error('No pude leer productos en este archivo: subí una planilla o seguimos sin catálogo.')
  await upsertProducts(m, object.productos, m.kind === 'stock' ? 'stock' : 'catalogo')
  return { summary: `${object.productos.length} productos leídos. ${object.nota}`, parsed: { count: object.productos.length } }
}

async function parseSkill(m: MediaRow, buf: Buffer) {
  const content = buf.toString('utf8')
  await db().from('skills').insert({ brand_id: m.brand_id, name: m.original_name ?? 'Skill', content })
  return { summary: 'Skill de edición guardada.', parsed: { chars: content.length } }
}

export async function parseMedia(mediaId: string) {
  const { data } = await db().from('media').select('*').eq('id', mediaId).maybeSingle()
  const m = data as MediaRow | null
  if (!m) return
  await db().from('media').update({ parse_status: 'parsing' }).eq('id', mediaId)
  try {
    if (['videos', 'grabacion', 'otro'].includes(m.kind)) {
      await db().from('media').update({ parse_status: 'parsed', parse_summary: 'Guardado.' }).eq('id', mediaId)
      return
    }
    const buf = await download(m.storage_path)
    let out: { summary: string; parsed: unknown }
    if (m.kind === 'skill') out = await parseSkill(m, buf)
    else if (m.kind === 'resenas') out = await parseReviews(m, buf)
    else if (m.kind === 'ventas') out = await parseSales(m, buf)
    else if ((m.kind === 'catalogo' || m.kind === 'stock') && isSheet(m)) out = await parseCatalogOrStock(m, buf)
    else out = await parseWithVision(m, buf)
    await db().from('media').update({ parse_status: 'parsed', parse_summary: out.summary, parsed: out.parsed }).eq('id', mediaId)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'No pude leer el archivo.'
    console.log('[v0] parseMedia failed', m.kind, message)
    await db().from('media').update({ parse_status: 'failed', parse_summary: message }).eq('id', mediaId)
  }
}
