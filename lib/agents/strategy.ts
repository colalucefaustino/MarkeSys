import { generateObject } from 'ai'
import { z } from 'zod'
import { db } from '@/lib/supabase/server'
import { MODEL_MAIN, MODEL_FAST, todayISO } from '@/lib/ai'
import { getDossier, dossierSummary, writeSectionData } from '@/lib/dossier'
import type { RunProgress } from '@/lib/agents/runs'
import { buildSkeleton } from '@/lib/agents/calendar-skeleton'

const NO_INVENT =
  'Regla absoluta: usá solo los datos que te paso. No inventes cifras, tamaños de mercado, beneficios ni fechas. Si falta algo, ponelo en missing_inputs.'

/* ───────────── Percepción (dentro de la llamada de Estrategia) ───────────── */
/** Con menos reseñas que esto no se analizan: el resultado sería anecdótico. */
export const MIN_REVIEWS = 5

const PercepcionSchema = z.object({
  temas: z
    .array(
      z.object({
        tema: z.string(),
        menciones: z.number(),
        sentimiento: z.enum(['positivo', 'negativo', 'mixto']),
        ejemplo: z.string().describe('cita textual corta de una reseña, máx 25 palabras'),
      }),
    )
    .max(8),
  brechas: z
    .array(
      z.object({
        dueno_dice: z.string(),
        clientes_valoran: z.string(),
        comunicacion_muestra: z.string(),
        tipo: z.enum(['coincide', 'brecha']),
        pregunta: z.string().describe('pregunta corta para que el dueño reflexione, en voseo'),
      }),
    )
    .max(5),
})

/* ───────────── A4 · Estratega ───────────── */
const NichosSchema = z.object({
  modo: z.enum(['descubrir', 'validar', 'profundizar']),
  nichos: z
    .array(
      z.object({
        nombre: z.string(),
        descripcion: z.string(),
        persona: z.string(),
        product_names: z.array(z.string()).describe('nombres exactos de productos del catálogo que encajan'),
        competencia: z.enum(['alta', 'media', 'baja']),
        evidencia: z.array(z.object({ dato: z.string(), fuente: z.string() })).min(1).max(4),
        riesgos: z.array(z.string()).max(3),
        recomendado: z.boolean(),
      }),
    )
    .min(2)
    .max(3),
  investigacion: z
    .object({
      sub_segmentos: z.array(z.object({ nombre: z.string(), descripcion: z.string(), fuente: z.string() })).max(4),
      motivaciones: z.array(z.string()).max(5),
      objeciones: z.array(z.string()).max(5),
      preguntas_frecuentes: z.array(z.object({ pregunta: z.string(), fuente: z.string() })).max(5),
    })
    .optional(),
  missing_inputs: z.array(z.string()),
})

const PosSchema = z.object({
  propuesta_valor: z.string(),
  mensajes_clave: z.array(z.string()).length(3),
  tono: z.object({ descripcion: z.string(), frases_si: z.array(z.string()).max(4), frases_no: z.array(z.string()).max(4) }),
  persona_principal: z.object({
    nombre: z.string(),
    descripcion: z.string(),
    preocupaciones: z.array(z.string()).max(4),
    canales: z.array(z.string()).max(4),
  }),
})

async function context(brandId: string) {
  const d = await getDossier(brandId)
  const vis = d.sections.visibilidad?.data ?? {}
  const per = d.sections.percepcion?.data ?? {}
  const { data: comps } = await db().from('competitors').select('name,detected_in').eq('brand_id', brandId)
  return {
    d,
    text: `${dossierSummary(d)}

DIAGNÓSTICO DE VISIBILIDAD: puntaje ${vis.puntaje_global ?? 'sin medir'}/100.
Competidores que aparecen: ${(vis.ranking_competidores ?? []).map((c: any) => `${c.nombre} (${c.apariciones})`).join(', ') || (comps ?? []).map((c) => c.name).join(', ') || 'sin datos'}
Acciones sugeridas: ${(vis.acciones ?? []).map((a: any) => a.accion).join(' | ') || 'sin datos'}

PERCEPCIÓN: ${(per.temas ?? []).map((t: any) => `${t.tema} (${t.menciones}, ${t.sentimiento})`).join(', ') || 'sin reseñas'}
Respuestas del dueño a las brechas: ${JSON.stringify(per.respuestas ?? {})}`,
  }
}

export async function runA4(brandId: string, runId: string, progress: RunProgress, params: Record<string, string>) {
  const phase = params.phase === 'posicionamiento' ? 'posicionamiento' : 'nichos'
  const { d, text } = await context(brandId)
  const prev = d.sections.estrategia?.data ?? {}

  if (phase === 'nichos') {
    // Una sola llamada: percepción (si hay reseñas suficientes) + nichos + posicionamiento del recomendado.
    const { data: reviewRows } = await db().from('reviews').select('id,text,rating').eq('brand_id', brandId).limit(200)
    const reviews = reviewRows ?? []
    const withReviews = reviews.length >= MIN_REVIEWS

    await progress.init([
      { id: 'ctx', label: 'Juntando tu diagnóstico' },
      ...(withReviews ? [{ id: 'reviews', label: `Leyendo ${reviews.length} reseñas de clientes` }] : []),
      { id: 'niches', label: 'Evaluando nichos y tu posicionamiento' },
    ])
    await progress.update('ctx', 'done')
    if (withReviews) await progress.update('reviews', 'running')
    await progress.update('niches', 'running')

    const seg = d.brand?.size_segment ?? 'pyme'
    const modo = params.modo || (seg === 'micro' ? 'descubrir' : seg === 'grande' ? 'profundizar' : 'validar')
    const schema = NichosSchema.extend({
      posicionamiento: PosSchema.describe('posicionamiento para el nicho recomendado'),
      ...(withReviews ? { percepcion: PercepcionSchema } : {}),
    })
    const { object } = (await generateObject({
      model: MODEL_MAIN,
      schema,
      prompt: `Sos estratega de marketing para comercios argentinos. Tamaño de la empresa: ${seg}. Modo: ${modo}.
${
  withReviews
    ? `PASO 1 · PERCEPCIÓN (campo "percepcion"): con las reseñas de abajo, extraé los temas que más se repiten (menciones = conteo real de reseñas) y compará tres columnas: lo que dice el dueño (Ficha), lo que valoran los clientes (reseñas) y lo que muestra su comunicación (web, tono, canales). Marcá "coincide" o "brecha" y, para cada brecha, una pregunta corta para que el dueño reflexione. Usá estas conclusiones como evidencia en los pasos siguientes (fuente: Percepción).
`
    : ''
}PASO ${withReviews ? 2 : 1} · NICHOS:
- descubrir: proponé 3 nichos posibles y recomendá 1.
- validar: evaluá el nicho actual frente a 2 alternativas y recomendá mantener, ajustar o cambiar.
- profundizar: el primer nicho es el actual; completá "investigacion" con sub-segmentos, motivaciones, objeciones y preguntas frecuentes, cada una con su fuente.
Marcá exactamente un nicho como recomendado. Cada evidencia cita su fuente (Visibilidad, Percepción, Catálogo o Ficha).
PASO ${withReviews ? 3 : 2} · POSICIONAMIENTO del nicho recomendado: propuesta de valor en una frase, 3 mensajes clave, tono con frases sí y no (respetando trato, tono y restricciones de la Ficha) y la persona principal. No prometas beneficios que no figuren en la Ficha.
${NO_INVENT}

DATOS:
${text}${
        withReviews
          ? `

RESEÑAS DE CLIENTES (${reviews.length}):
${reviews.map((r, i) => `${i + 1}. ${r.rating ? `[${r.rating}★] ` : ''}${String(r.text).slice(0, 400)}`).join('\n')}`
          : ''
      }`,
    })) as { object: z.infer<typeof NichosSchema> & { posicionamiento: z.infer<typeof PosSchema>; percepcion?: z.infer<typeof PercepcionSchema> } }

    const names = d.products.filter((p) => !p.excluded).map((p) => String(p.name).toLowerCase())
    const nichos = object.nichos.map((n) => {
      const hits = n.product_names.filter((x) => names.includes(x.toLowerCase())).length
      return { ...n, porcentaje_catalogo: names.length ? Math.round((hits / names.length) * 100) : null }
    })
    const recomendado = nichos.find((n) => n.recomendado) ?? nichos[0]

    // Percepción primero: guardarla marca Estrategia como desactualizada, y enseguida se reescribe.
    if (object.percepcion) {
      await progress.update('reviews', 'done', `${object.percepcion.temas.length} temas`)
      await writeSectionData(
        brandId,
        'percepcion',
        { ...object.percepcion, cantidad_resenas: reviews.length, suficiente: true, fecha: todayISO() },
        { status: 'approved', agentRunId: runId },
      )
    }
    const missing = [...object.missing_inputs]
    if (!withReviews) missing.push(`Reseñas de clientes (con ${MIN_REVIEWS} o más se suma el análisis de percepción)`)

    await progress.update('niches', 'done', `${nichos.length} opciones · recomendado: ${recomendado?.nombre ?? '—'}`)
    await writeSectionData(
      brandId,
      'estrategia',
      {
        ...prev,
        modo: object.modo,
        nichos,
        investigacion: object.investigacion ?? null,
        missing_inputs: missing,
        nicho_elegido: recomendado?.nombre ?? null,
        posicionamiento: object.posicionamiento,
        con_percepcion: !!object.percepcion,
      },
      { status: 'pending_approval', agentRunId: runId },
    )
    await progress.finish({})
    return
  }

  await progress.init([{ id: 'pos', label: 'Escribiendo tu propuesta de valor y mensajes' }])
  await progress.update('pos', 'running')
  const nicho = (prev.nichos ?? []).find((n: any) => n.nombre === params.nicho) ?? { nombre: params.nicho }
  const { object } = await generateObject({
    model: MODEL_MAIN,
    schema: PosSchema,
    prompt: `Definí el posicionamiento de esta marca para el nicho elegido: ${JSON.stringify(nicho)}.
Propuesta de valor en una frase, 3 mensajes clave, tono con frases sí y no (respetando trato y tono de la Ficha y sus restricciones) y la persona principal.
No prometas beneficios que no figuren en la Ficha. ${NO_INVENT}

DATOS:
${text}`,
  })
  await progress.update('pos', 'done')
  await writeSectionData(
    brandId,
    'estrategia',
    { ...prev, nicho_elegido: nicho.nombre, posicionamiento: object },
    { status: 'pending_approval', agentRunId: runId },
  )
  await progress.finish({})
}

/* ───────────── A5 · Calendario ───────────── */
// El código arma el esqueleto (fechas, formatos, productos, acciones) y una sola
// llamada de IA escribe ideas, textos y el porqué de cada pieza.

function nextMonday(iso: string) {
  const dt = new Date(iso + 'T12:00:00')
  const add = (8 - dt.getDay()) % 7 || 7
  dt.setDate(dt.getDate() + add)
  return dt.toISOString().slice(0, 10)
}

const FMT_LABEL: Record<string, string> = {
  post: 'post', carrusel: 'carrusel', historia: 'historia', reel: 'reel', whatsapp: 'WhatsApp', email: 'email',
}

export async function runA5(brandId: string, runId: string, progress: RunProgress) {
  await progress.init([
    { id: 'ctx', label: 'Armando fechas, formatos y productos' },
    { id: 'plan', label: 'Escribiendo ideas y textos' },
  ])
  const { d, text } = await context(brandId)
  const objectives = d.objectives.filter((o) => o.deadline)
  if (!objectives.length) throw new Error('Faltan objetivos con fecha. Pedíselos al Copiloto.')
  const ficha = (d.sections.ficha?.data ?? {}) as any
  const estr = (d.sections.estrategia?.data ?? {}) as any
  const vis = (d.sections.visibilidad?.data ?? {}) as any
  const start = nextMonday(todayISO())
  const end = objectives.map((o) => String(o.deadline)).sort().pop()!
  const cap = Number(ficha?.capacidad?.piezas_por_semana) || 3
  const { data: dates } = await db().from('commercial_dates').select('name,date_start').gte('date_start', start).lte('date_start', end)

  const social = d.channels
    .filter((c) => c.type === 'instagram' || c.type === 'tiktok')
    .map((c) => (c.type === 'instagram' ? 'Instagram' : 'TikTok'))
  const sk = buildSkeleton({
    start,
    end,
    piezasPorSemana: cap,
    formatos: ficha?.capacidad?.formatos_posibles ?? [],
    socialChannels: [...new Set(social)],
    products: d.products.map((p) => ({ name: String(p.name), stock: p.stock ?? null, is_star: p.is_star, push: p.push, excluded: p.excluded })),
    objectives: objectives.map((o) => ({ description: String(o.description), deadline: String(o.deadline) })),
    acciones: vis.acciones ?? [],
    commercialDates: dates ?? [],
    precios: ficha?.precios_en_publicaciones,
  })
  const toWrite = sk.items.map((it, idx) => ({ it, idx })).filter(({ it }) => it.campana >= 0)
  await progress.update('ctx', 'done', `${sk.semanas} semanas, ${toWrite.length} piezas, ${cap} por semana`)
  await progress.update('plan', 'running')

  const { object } = await generateObject({
    model: MODEL_MAIN,
    schema: z.object({
      campanas: z
        .array(z.object({ nombre: z.string(), mensaje_clave: z.string(), kpi: z.string() }))
        .length(sk.campanas.length),
      items: z.array(
        z.object({
          n: z.number().int().describe('número de la pieza del esqueleto'),
          idea: z.string(),
          copy: z.string(),
          porque: z.string().describe('el dato que justifica esta pieza'),
          promo_propuesta: z.boolean().describe('true solo si proponés un descuento o promo que no está confirmado'),
        }),
      ),
      missing_inputs: z.array(z.string()),
    }),
    prompt: `Escribí el contenido del calendario de marketing de este comercio. El esqueleto ya está armado: NO cambies fechas, formatos, canales ni productos.
ESTRATEGIA: nicho ${estr.nicho_elegido ?? 'sin definir'}; ${JSON.stringify(estr.posicionamiento ?? {})}

CAMPAÑAS (devolvé una por línea, en el mismo orden, con nombre, mensaje clave y un KPI medible):
${sk.campanas.map((c, k) => `${k}. Objetivo: ${c.objetivo} (del ${c.inicio} al ${c.fin})`).join('\n')}

PIEZAS (devolvé una entrada por pieza con su número "n"):
${toWrite
  .map(
    ({ it }, k) =>
      `${k + 1}. ${it.fecha} · ${FMT_LABEL[it.formato] ?? it.formato} en ${it.canal} · campaña ${it.campana}${it.producto ? ` · producto: ${it.producto}` : ''}${it.fecha_comercial ? ` · cerca de ${it.fecha_comercial}` : ''}${it.muestra_precio ? ' · puede mostrar precio' : ' · sin precio'}`,
  )
  .join('\n')}

REGLAS:
- Cada pieza lleva "porque" con el dato del diagnóstico, la estrategia o el stock que la justifica.
- Respetá trato, tono y restricciones de la Ficha.
- No inventes descuentos: si proponés uno, promo_propuesta true.
${NO_INVENT}

DATOS:
${text}`,
  })

  const byN = new Map(object.items.map((x) => [x.n, x]))
  const items = sk.items.map((it, idx) => {
    const k = toWrite.findIndex((w) => w.idx === idx)
    const written = k >= 0 ? byN.get(k + 1) : undefined
    const promo = !!written?.promo_propuesta
    return {
      id: `i${idx}`,
      status: 'propuesta' as const,
      campana: it.campana,
      fecha: it.fecha,
      canal: it.canal,
      formato: it.formato,
      producto: it.producto,
      fecha_comercial: it.fecha_comercial,
      idea: it.idea ?? written?.idea ?? 'Idea pendiente: pedila con "otra idea"',
      copy: written?.copy ?? '',
      porque: it.porque ?? written?.porque ?? '',
      muestra_precio: it.muestra_precio || (promo && ficha?.precios_en_publicaciones === 'solo_promos'),
      promo_propuesta: promo,
    }
  })
  const campanas = sk.campanas.map((c, k) => ({
    nombre: object.campanas[k]?.nombre ?? `Campaña ${k + 1}`,
    objetivo: c.objetivo,
    mensaje_clave: object.campanas[k]?.mensaje_clave ?? '',
    inicio: c.inicio,
    fin: c.fin,
    kpi: object.campanas[k]?.kpi ?? '',
  }))

  await progress.update('plan', 'done', `${campanas.length} campañas, ${items.length} ítems`)
  await writeSectionData(
    brandId,
    'calendario',
    {
      horizonte: { inicio: start, fin: end, semanas: sk.semanas, granularidad: sk.granularidad, piezas_por_semana: cap },
      campanas,
      items,
      stock: sk.stock,
      missing_inputs: object.missing_inputs,
    },
    { status: 'pending_approval', agentRunId: runId },
  )
  await progress.finish({ items: items.length })
}

/* ───────────── A6 · Guion (sincrónico) ───────────── */
export async function writeScript(brandId: string, item: any) {
  const d = await getDossier(brandId)
  const estr = d.sections.estrategia?.data ?? {}
  const { object } = await generateObject({
    model: MODEL_FAST,
    schema: z.object({
      gancho: z.string(),
      escenas: z.array(z.object({ tiempo: z.string(), que_grabar: z.string(), texto_en_pantalla: z.string(), voz: z.string() })).max(8),
      cta: z.string(),
      duracion_seg: z.number(),
      copy_publicacion: z.string(),
      consejos: z.array(z.string()).max(4),
    }),
    prompt: `Escribí el guion de una pieza para redes de este comercio, pensada para grabar con el celular.
Pieza: ${item.formato} en ${item.canal}. Idea: ${item.idea}. Texto base: ${item.copy}. Por qué: ${item.porque}. ${item.muestra_precio ? 'Puede mostrar precio.' : 'No mostrar precio.'}
Posicionamiento: ${JSON.stringify(estr.posicionamiento ?? {})}
${NO_INVENT}

MARCA:
${dossierSummary(d)}`,
  })
  return object
}
