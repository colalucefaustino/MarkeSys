// Preguntas fijas de Marky: arman la Ficha al principio sin pasar por la IA.
// Cada pregunta tiene opciones para tocar (adaptadas al rubro), campo para escribir,
// confirmación de lo que Marky dedujo de la web o el catálogo, y "saltear" en las opcionales.
// La IA solo entra cuando el dueño escribe algo fuera de una pregunta, o para proponer objetivos.

import type { Dossier } from '@/lib/dossier'
import { getPath, provenanceMap } from '@/lib/dossier'
import { isPlaceholderName } from '@/lib/brand-constants'

import type { ScriptedAnswer, ScriptedStep, StepMode } from '@/lib/copilot/scripted-shared'
export type { ScriptedAnswer, ScriptedStep, StepMode }

/** Cambio que produce una respuesta: campos de la Ficha y, si corresponde, extras. */
export interface ScriptedEffect {
  fields: { path: string; value: unknown }[]
  segment?: 'micro' | 'pyme' | 'grande'
  competitors?: string[]
  channels?: { type: 'instagram' | 'tiktok'; handle: string }[]
}

/* ───────────── Rubros y ejemplos ───────────── */

type Family = 'indumentaria' | 'gastronomia' | 'belleza' | 'hogar' | 'tecnologia' | 'otro'

const FAMILIES: { key: Family; label: string }[] = [
  { key: 'indumentaria', label: 'Ropa y accesorios' },
  { key: 'gastronomia', label: 'Gastronomía' },
  { key: 'belleza', label: 'Belleza y cuidado personal' },
  { key: 'hogar', label: 'Hogar, deco y regalos' },
  { key: 'tecnologia', label: 'Tecnología' },
]

const EXAMPLES: Record<'productos' | 'publico' | 'diferencial', Record<Family, string[]>> = {
  productos: {
    indumentaria: ['Remeras y básicos', 'Jeans y pantalones', 'Vestidos', 'Abrigos', 'Calzado', 'Accesorios'],
    gastronomia: ['Café y bebidas', 'Pastelería', 'Comidas para llevar', 'Productos envasados'],
    belleza: ['Maquillaje', 'Cuidado de la piel', 'Perfumes', 'Servicios (uñas, peluquería)'],
    hogar: ['Deco', 'Bazar y cocina', 'Textiles', 'Regalería'],
    tecnologia: ['Celulares y accesorios', 'Computación', 'Audio', 'Servicio técnico'],
    otro: [],
  },
  publico: {
    indumentaria: ['Mujeres de 25 a 45', 'Jóvenes de 18 a 25', 'Hombres de 25 a 45', 'Mamás', 'Gente que compra para regalar'],
    gastronomia: ['Vecinos del barrio', 'Gente que trabaja en la zona', 'Estudiantes', 'Familias', 'Turistas'],
    belleza: ['Mujeres de 25 a 45', 'Jóvenes de 18 a 25', 'Novias y eventos', 'Hombres'],
    hogar: ['Gente que compra para regalar', 'Parejas que se mudan', 'Mujeres de 30 a 55', 'Decoradores y arquitectos'],
    tecnologia: ['Jóvenes de 18 a 30', 'Empresas y oficinas', 'Gamers', 'Gente mayor que necesita ayuda'],
    otro: ['Mujeres de 25 a 45', 'Hombres de 25 a 45', 'Jóvenes de 18 a 25', 'Familias', 'Empresas'],
  },
  diferencial: {
    indumentaria: ['Diseño propio', 'Calidad de las telas', 'Talles amplios', 'Precio', 'Buena atención'],
    gastronomia: ['Calidad de los productos', 'Elaboración propia', 'Ambiente del lugar', 'Atención', 'Precio'],
    belleza: ['Productos de calidad', 'Asesoramiento', 'Marcas exclusivas', 'Precio'],
    hogar: ['Piezas únicas', 'Diseño', 'Precio', 'Atención'],
    tecnologia: ['Precio', 'Garantía y servicio técnico', 'Asesoramiento', 'Stock y rapidez'],
    otro: ['Buena atención', 'Calidad', 'Precio', 'Variedad', 'Rapidez'],
  },
}

/* ───────────── Definición de cada pregunta (servidor) ───────────── */

interface Ctx {
  d: Dossier
  family: Family
}

interface StepDef {
  id: string
  question: (c: Ctx) => string
  why: string
  mode: StepMode
  options: (c: Ctx) => string[]
  allowText?: boolean
  textPlaceholder?: (c: Ctx) => string
  skipLabel?: string
  /** Ruta principal: decide si ya está respondida (confirmada) y qué se deduce. */
  path?: string
  /** Si devuelve true, la pregunta no hace falta (ej. el catálogo ya trae los productos). */
  notNeeded?: (c: Ctx) => boolean
  /** Solo aparece cuando se cumple (ej. objetivos, después de lo básico). */
  when?: (c: Ctx) => boolean
  /** Cómo mostrar lo deducido. */
  show?: (v: unknown) => string
  save: (a: { values: string[]; text: string }, c: Ctx) => ScriptedEffect
  handoff?: { label: string; send: string }
}

const asList = (a: { values: string[]; text: string }) =>
  [...a.values, ...a.text.split(/[\n,;]/)].map((s) => s.trim()).filter(Boolean)
const pick = <T>(map: Record<string, T>, label: string | undefined) => (label ? map[label] : undefined)
const listText = (v: unknown) => (Array.isArray(v) ? v.join(', ') : String(v ?? ''))

const PRECIO_PUB: Record<string, string> = {
  Siempre: 'siempre',
  Nunca: 'nunca',
  'Solo en promos': 'solo_promos',
  'Solo en historias': 'solo_historias',
}
const NIVEL: Record<string, string> = { Económico: 'economico', Medio: 'medio', Premium: 'premium' }
const NIVEL_LABEL = Object.fromEntries(Object.entries(NIVEL).map(([k, v]) => [v, k]))
const TRATO: Record<string, string> = { 'De vos': 'vos', 'De usted': 'usted' }
const HISTORIAS: Record<string, number> = { 'No subo historias': 0, '1 o 2 por día': 2, '3 a 5 por día': 4, 'Más de 5 por día': 6 }
const FEED: Record<string, number> = { '0 o 1': 1, '2 o 3': 3, '4 o 5': 5, 'Más de 5': 7 }
const TAMANO: Record<string, { seg: 'micro' | 'pyme' | 'grande'; mkt: boolean }> = {
  'Hasta 5, nadie hace marketing': { seg: 'micro', mkt: false },
  'Hasta 5, alguien hace un poco': { seg: 'micro', mkt: true },
  'Entre 6 y 50': { seg: 'pyme', mkt: true },
  'Más de 50 o varias sucursales': { seg: 'grande', mkt: true },
}

const STEPS: StepDef[] = [
  {
    id: 'rubro',
    question: () => '¿Qué vendés?',
    why: 'Con tu rubro armo las búsquedas para ver si te encuentran y adapto las próximas preguntas.',
    mode: 'single',
    options: () => FAMILIES.map((f) => f.label),
    allowText: true,
    textPlaceholder: () => 'O escribilo, por ejemplo: indumentaria femenina',
    path: 'marca.rubro',
    save: (a) => {
      const fam = FAMILIES.find((f) => f.label === a.values[0])
      return {
        fields: [
          { path: 'marca.rubro', value: a.text || fam?.label || '' },
          { path: 'marca.rubro_familia', value: fam?.key ?? 'otro' },
        ],
      }
    },
  },
  {
    id: 'productos',
    question: () => '¿Cuáles son tus productos principales?',
    why: 'Los uso para las búsquedas, la estrategia y para elegir qué mostrar en cada publicación.',
    mode: 'multi',
    options: (c) => EXAMPLES.productos[c.family],
    allowText: true,
    textPlaceholder: () => 'Sumá otros, separados por coma',
    path: 'productos_resumen.descripcion',
    notNeeded: (c) => c.d.products.length > 0,
    save: (a) => {
      const list = asList(a)
      return {
        fields: [
          { path: 'productos_resumen.descripcion', value: list.join(', ') },
          { path: 'productos_resumen.categorias', value: list },
        ],
      }
    },
  },
  {
    id: 'tamano',
    question: () => '¿Cuántas personas trabajan en el negocio y alguien se ocupa del marketing?',
    why: 'Con esto ajusto qué tan profundo es el análisis y qué tan grande es el plan.',
    mode: 'single',
    options: () => Object.keys(TAMANO),
    path: 'tamano.segmento',
    save: (a) => {
      const t = pick(TAMANO, a.values[0])!
      return { fields: [{ path: 'tamano.segmento', value: t.seg }, { path: 'tamano.equipo_marketing', value: t.mkt }], segment: t.seg }
    },
  },
  {
    id: 'cantidad',
    question: () => '¿Cuántos artículos distintos tenés más o menos?',
    why: 'Me ayuda a saber si conviene mostrar productos de a uno o por categorías.',
    mode: 'single',
    options: () => ['Menos de 20', '20 a 100', '100 a 500', 'Más de 500'],
    path: 'productos_resumen.cantidad',
    notNeeded: (c) => c.d.products.length > 0,
    save: (a) => ({ fields: [{ path: 'productos_resumen.cantidad', value: a.values[0] }] }),
  },
  {
    id: 'publico',
    question: () => '¿A quién le vendés?',
    why: 'Para hablarle a la persona correcta y elegir dónde aparecer.',
    mode: 'multi',
    options: (c) => EXAMPLES.publico[c.family],
    allowText: true,
    textPlaceholder: () => 'Contalo con tus palabras, por ejemplo: mujeres de la zona que trabajan',
    path: 'publico.actual',
    save: (a) => ({ fields: [{ path: 'publico.actual', value: asList(a).join(', ') }] }),
  },
  {
    id: 'diferencial',
    question: () => '¿Por qué te eligen a vos y no a otro?',
    why: 'Es lo que vamos a reforzar en todo lo que publiques.',
    mode: 'multi',
    options: (c) => EXAMPLES.diferencial[c.family],
    allowText: true,
    textPlaceholder: () => 'Algo más que te diferencie',
    path: 'marca.diferencial',
    save: (a) => ({ fields: [{ path: 'marca.diferencial', value: asList(a).join(', ') }] }),
  },
  {
    id: 'canales',
    question: () => '¿Dónde vendés?',
    why: 'Para medir si te encuentran en esos lugares y llevar a la gente a donde comprás.',
    mode: 'multi',
    options: () => ['Local propio', 'Instagram', 'WhatsApp', 'Tienda online', 'Mercado Libre', 'Ferias o showroom'],
    allowText: true,
    textPlaceholder: () => 'Otro lugar',
    path: 'marca.canales_venta',
    show: listText,
    save: (a) => ({ fields: [{ path: 'marca.canales_venta', value: asList(a) }] }),
  },
  {
    id: 'redes',
    question: () => '¿Cuál es tu usuario de Instagram o TikTok?',
    why: 'Lo uso para medir si te encuentran en redes y compararte con tu competencia.',
    mode: 'text',
    options: () => [],
    allowText: true,
    textPlaceholder: () => 'Ej.: @lola.ropa (si tenés los dos, separalos con coma)',
    skipLabel: 'Lo cargo después',
    path: 'redes_cargadas',
    // Solo si dijo que vende por redes y todavía no hay usuario cargado.
    when: (c) => {
      const canales: string[] = ((c.d.sections.ficha?.data as any)?.marca?.canales_venta ?? []).map((x: string) => x.toLowerCase())
      const sells = canales.some((x) => x.includes('instagram') || x.includes('tiktok'))
      return sells && !c.d.channels.some((ch) => ch.type === 'instagram' || ch.type === 'tiktok')
    },
    save: (a) => {
      const handles = asList(a)
      const channels = handles.map((h, i) => ({
        type: (/tiktok/i.test(h) || (i === 1 && handles.length === 2) ? 'tiktok' : 'instagram') as 'instagram' | 'tiktok',
        handle: h,
      }))
      return { fields: [{ path: 'redes_cargadas', value: handles }], channels }
    },
  },
  {
    id: 'nivel_precio',
    question: () => 'Comparado con tu competencia, tus precios son…',
    why: 'Cambia cómo conviene comunicar: no se le habla igual a quien busca precio que a quien busca exclusividad.',
    mode: 'single',
    options: () => Object.keys(NIVEL),
    path: 'posicionamiento_precio',
    show: (v) => NIVEL_LABEL[String(v)] ?? String(v),
    save: (a) => ({ fields: [{ path: 'posicionamiento_precio', value: NIVEL[a.values[0]] }] }),
  },
  {
    id: 'trato',
    question: () => '¿Cómo les hablás a tus clientes?',
    why: 'Todos los textos que te proponga van a usar ese trato.',
    mode: 'single',
    options: () => Object.keys(TRATO),
    path: 'comunicacion.trato',
    show: (v) => (v === 'usted' ? 'De usted' : 'De vos'),
    save: (a) => ({ fields: [{ path: 'comunicacion.trato', value: TRATO[a.values[0]] }] }),
  },
  {
    id: 'tono',
    question: () => '¿Qué tono tiene tu marca?',
    why: 'Así los textos suenan a vos y no a una marca cualquiera.',
    mode: 'multi',
    options: () => ['Cercano', 'Divertido', 'Formal', 'Inspirador', 'Directo', 'Elegante'],
    allowText: true,
    textPlaceholder: () => 'Otro tono',
    path: 'comunicacion.tono',
    show: listText,
    save: (a) => ({ fields: [{ path: 'comunicacion.tono', value: asList(a).map((t) => t.toLowerCase()) }] }),
  },
  {
    id: 'precios',
    question: () => 'Cuando publiquemos un producto, ¿querés que aparezca su precio?',
    why: 'Así cada publicación del plan sale con o sin precio según lo que prefieras.',
    mode: 'single',
    options: () => Object.keys(PRECIO_PUB),
    path: 'precios_en_publicaciones',
    save: (a) => ({ fields: [{ path: 'precios_en_publicaciones', value: PRECIO_PUB[a.values[0]] }] }),
  },
  {
    id: 'historias',
    question: () => '¿Cuántas historias subís por día, más o menos?',
    why: 'Las historias van aparte de los posts: el plan respeta tu ritmo de cada una.',
    mode: 'single',
    options: () => Object.keys(HISTORIAS),
    path: 'capacidad.historias_por_dia',
    save: (a) => ({ fields: [{ path: 'capacidad.historias_por_dia', value: HISTORIAS[a.values[0]] }] }),
  },
  {
    id: 'piezas',
    question: () => '¿Y cuántos posts o reels por semana podés hacer?',
    why: 'Son las piezas más trabajadas. El calendario nunca te va a pedir más que esto.',
    mode: 'single',
    options: () => Object.keys(FEED),
    path: 'capacidad.piezas_por_semana',
    save: (a) => ({ fields: [{ path: 'capacidad.piezas_por_semana', value: FEED[a.values[0]] }] }),
  },
  {
    id: 'beneficios',
    question: () => '¿Qué beneficios ofrecés hoy?',
    why: 'Solo comunico los que me confirmes: nunca invento promociones.',
    mode: 'multi',
    options: () => ['Envío a domicilio', 'Cuotas sin interés', 'Retiro en el local', 'Cambios sin cargo', 'Mercado Pago', 'Descuento en efectivo'],
    allowText: true,
    textPlaceholder: () => 'Otro beneficio',
    skipLabel: 'Ninguno por ahora',
    path: 'beneficios_comunicables',
    show: listText,
    save: (a) => ({ fields: [{ path: 'beneficios_comunicables', value: asList(a) }] }),
  },
  {
    id: 'competencia',
    question: () => '¿Qué marcas o locales sentís que son tu competencia?',
    why: 'Te comparo con ellos en Google, Maps y redes.',
    mode: 'text',
    options: () => [],
    allowText: true,
    textPlaceholder: () => 'Separalos por coma, por ejemplo: Tienda Lola, @bloom.ros',
    skipLabel: 'No sé, detectalos vos',
    path: 'competidores_conocidos',
    save: (a) => {
      const list = asList(a)
      return { fields: [{ path: 'competidores_conocidos', value: list }], competitors: list }
    },
  },
  {
    id: 'restricciones',
    question: () => '¿Hay algo que nunca quieras publicar?',
    why: 'Lo respeto en todo el contenido que te proponga. Podés marcar varias y sumar otras.',
    mode: 'multi',
    options: () => ['Descuentos o liquidaciones', 'Política o actualidad', 'Mostrar mi cara', 'Precios', 'Comparaciones con la competencia', 'Temas religiosos'],
    allowText: true,
    textPlaceholder: () => 'Sumá otra cosa que no quieras publicar',
    skipLabel: 'Nada en especial',
    path: 'restricciones',
    show: listText,
    save: (a) => ({ fields: [{ path: 'restricciones', value: asList(a) }] }),
  },
  {
    id: 'objetivos',
    question: () => 'Listo con lo básico. Ahora te propongo objetivos con fecha según tu stock y la temporada.',
    why: 'Los objetivos ordenan todo el plan: qué publicar, cuándo y para qué.',
    mode: 'single',
    options: () => [],
    when: (c) => !c.d.objectives.some((o) => !!o.deadline),
    handoff: { label: 'Proponeme objetivos', send: 'Proponeme objetivos con fecha para mi negocio.' },
    save: () => ({ fields: [] }),
  },
]

/* ───────────── Estado ───────────── */

function ctxOf(d: Dossier): Ctx {
  const ficha = (d.sections.ficha?.data ?? {}) as any
  const fam = (ficha?.marca?.rubro_familia as Family | undefined) ?? 'otro'
  return { d, family: FAMILIES.some((f) => f.key === fam) ? fam : 'otro' }
}

/** Preguntas fijas que faltan, en orden. Solo durante el arranque (antes de aprobar la Ficha). */
export function pendingScriptedSteps(d: Dossier): ScriptedStep[] {
  const brand = d.brand
  if (!brand || brand.stage !== 'onboarding' || isPlaceholderName(brand.name) || !brand.city) return []
  const c = ctxOf(d)
  const prov = provenanceMap(d)
  const ficha = d.sections.ficha?.data ?? {}

  const out: ScriptedStep[] = []
  for (const s of STEPS) {
    if (s.notNeeded?.(c)) continue
    if (s.when && !s.when(c)) continue
    let deduced: string | undefined
    if (s.path) {
      const origin = prov[`ficha.${s.path}`]?.origin
      if (origin === 'confirmado') continue // ya respondida
      const v = getPath(ficha, s.path)
      const has = Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== ''
      if (has && origin === 'inferido') deduced = (s.show ?? listText)(v)
    }
    // Objetivos solo cuando lo obligatorio de arriba ya está.
    if (s.id === 'objetivos' && out.some((o) => !o.skipLabel)) continue
    out.push({
      id: s.id,
      question: s.question(c),
      why: s.why,
      mode: s.mode,
      options: s.options(c),
      allowText: !!s.allowText,
      textPlaceholder: s.textPlaceholder?.(c),
      skipLabel: s.skipLabel,
      deduced,
      handoff: s.handoff,
    })
  }
  return out
}

/**
 * Traduce una respuesta a cambios en la Ficha. Valida que las opciones existan.
 * Devuelve también el texto que queda en el chat como respuesta del dueño.
 */
export function resolveAnswer(d: Dossier, stepId: string, a: ScriptedAnswer): { effect: ScriptedEffect; label: string; question: string; why: string } | { error: string } {
  const s = STEPS.find((x) => x.id === stepId)
  if (!s || s.handoff) return { error: 'Pregunta inválida' }
  const c = ctxOf(d)
  const ficha = d.sections.ficha?.data ?? {}
  const base = { question: s.question(c), why: s.why }

  if (a.action === 'confirm') {
    if (!s.path) return { error: 'Nada para confirmar' }
    const v = getPath(ficha, s.path)
    return { ...base, label: 'Sí, es así', effect: { fields: [{ path: s.path, value: v }], segment: s.id === 'tamano' ? (v as any) : undefined } }
  }
  if (a.action === 'skip') {
    if (!s.skipLabel || !s.path) return { error: 'Esta pregunta no se puede saltear' }
    return { ...base, label: s.skipLabel, effect: { fields: [{ path: s.path, value: [] }] } }
  }

  const options = s.options(c)
  const values = (a.values ?? []).filter((v) => options.includes(v))
  if (s.mode === 'single') values.splice(1)
  const text = s.allowText ? (a.text ?? '').trim().slice(0, 500) : ''
  if (!values.length && !text) return { error: 'Elegí una opción o escribí tu respuesta' }
  if (s.mode === 'single' && !values.length && !s.allowText) return { error: 'Elegí una de las opciones' }

  const label = [...values, ...(text ? [text] : [])].join(', ')
  return { ...base, label, effect: s.save({ values, text }, c) }
}
