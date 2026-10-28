import type { UIMessage } from 'ai'
import { db } from '@/lib/supabase/server'
import { todayISO } from '@/lib/ai'
import { buildSkeleton } from '@/lib/agents/calendar-skeleton'
import { DEMO_BRAND_ID, DEMO_VERSION } from '@/lib/demo/constants'

// Marca de ejemplo: "Café Ombú", cafetería de especialidad de Rosario, con todas las
// etapas completas. Datos ficticios pero coherentes entre sí: los puntajes de
// Visibilidad se calculan con la misma fórmula que la app y las fechas se arman a
// partir del día en que se carga, así el calendario nunca queda viejo.

const NAME = 'Café Ombú'
const CITY = 'Rosario'

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function nextMonday(iso: string) {
  const d = new Date(iso + 'T12:00:00Z')
  const add = (8 - d.getUTCDay()) % 7 || 7
  return addDays(iso, add)
}

/* ───────────── Productos ───────────── */
const PRODUCTS = [
  { name: 'Blend Ombú 250 g', category: 'Café en grano', price: 9800, stock: 120, is_star: true, push: false },
  { name: 'Colombia Huila 250 g', category: 'Café en grano', price: 11500, stock: 45, is_star: false, push: false },
  { name: 'Box regalo café + taza', category: 'Regalos', price: 24900, stock: 35, is_star: false, push: true },
  { name: 'Taza de cerámica artesanal', category: 'Accesorios', price: 14900, stock: 200, is_star: false, push: false },
  { name: 'Prensa francesa 600 ml', category: 'Accesorios', price: 32000, stock: 3, is_star: false, push: false },
  { name: 'Alfajores de maicena x6', category: 'Pastelería', price: 7200, stock: 60, is_star: false, push: false },
  { name: 'Medialunas de manteca x6', category: 'Pastelería', price: 5400, stock: null, is_star: false, push: false },
]

/* ───────────── Ficha ───────────── */
const FICHA = {
  _demo_version: DEMO_VERSION,
  marca: {
    nombre: NAME,
    ciudad: CITY,
    rubro: 'Cafetería de especialidad',
    historia: 'Abrió en 2019 en barrio Pichincha. Tuestan su propio blend cada semana.',
    diferencial: 'Café tostado en el local, con origen y fecha de tueste en cada bolsa.',
    canales_venta: ['Local', 'Instagram', 'WhatsApp'],
  },
  tamano: { segmento: 'micro', empleados: 4, sucursales: 1, equipo_marketing: false },
  productos_resumen: { total: PRODUCTS.length, categorias: ['Café en grano', 'Pastelería', 'Regalos', 'Accesorios'], rango_precio: { min: 5400, max: 32000 } },
  precios_en_publicaciones: 'solo_historias',
  posicionamiento_precio: 'medio',
  compite_por: 'Calidad del café y atención',
  beneficios_comunicables: ['Envío a domicilio', 'Mercado Pago'],
  comunicacion: {
    trato: 'vos',
    tono: ['cercano', 'cálido', 'con humor suave'],
    frases_si: ['Te esperamos con el café recién tostado', 'Preguntanos por el origen'],
    frases_no: ['El mejor café del mundo', 'Precios imbatibles'],
    referencias: [],
  },
  publico: {
    actual: 'Vecinos de Pichincha y gente que trabaja en la zona, de 25 a 45 años.',
    deseado: 'Personas que buscan regalos con café y quienes preparan café en casa.',
    preocupaciones_compra: ['Que el café llegue fresco', 'Saber cómo prepararlo'],
  },
  identidad_visual: { colores: [{ hex: '#3B2A1F', uso: 'texto y logo' }, { hex: '#F28C38', uso: 'acento' }], tipografias: ['Outfit'], estilo: 'Cálido, fotos con luz natural' },
  capacidad: { piezas_por_semana: 3, formatos_posibles: ['post', 'historia', 'reel', 'carrusel'] },
  restricciones: ['No publicar descuentos de más del 15 %'],
  missing_inputs: [],
  assumptions: [],
}
const FICHA_PATHS = [
  'marca.nombre', 'marca.ciudad', 'marca.rubro', 'marca.historia', 'marca.diferencial', 'marca.canales_venta',
  'tamano.segmento', 'tamano.empleados', 'tamano.sucursales', 'tamano.equipo_marketing',
  'productos_resumen.total', 'productos_resumen.categorias', 'precios_en_publicaciones', 'posicionamiento_precio',
  'compite_por', 'beneficios_comunicables', 'comunicacion.trato', 'comunicacion.tono', 'comunicacion.frases_si',
  'comunicacion.frases_no', 'publico.actual', 'publico.deseado', 'publico.preocupaciones_compra',
  'identidad_visual.estilo', 'identidad_visual.tipografias', 'capacidad.piezas_por_semana', 'capacidad.formatos_posibles', 'restricciones',
]
const INFERRED = new Set(['marca.historia', 'identidad_visual.estilo', 'publico.actual'])

/* ───────────── Visibilidad ───────────── */
type Res = { appears: boolean; position?: number } | null // null = no se midió en ese canal
const COMP = ['Tostado Café Club', 'Cafetería Bloom', 'La Tostadora Rosario', 'Kaffa Bar']
const QUERIES: { text: string; kind: string; llm: Res; web: Res; maps: Res }[] = [
  { text: 'cafetería de especialidad en Rosario', kind: 'generica', llm: { appears: false }, web: { appears: false }, maps: { appears: true, position: 7 } },
  { text: 'mejor cafetería de especialidad en Rosario', kind: 'generica', llm: { appears: false }, web: { appears: false }, maps: { appears: false } },
  { text: 'café en grano en Rosario', kind: 'generica', llm: { appears: true, position: 4 }, web: { appears: true, position: 6 }, maps: { appears: false } },
  { text: 'pastelería en Rosario', kind: 'generica', llm: null, web: { appears: false }, maps: { appears: false } },
  { text: 'café para llevar cerca del Monumento', kind: 'nicho', llm: { appears: false }, web: { appears: false }, maps: { appears: true, position: 3 } },
  { text: 'regalos con café en Rosario', kind: 'nicho', llm: { appears: false }, web: { appears: true, position: 8 }, maps: { appears: false } },
  { text: 'cafetería de especialidad en Rosario con envío a domicilio', kind: 'atributo', llm: null, web: { appears: false }, maps: { appears: false } },
  { text: 'cafetería de especialidad en Rosario con mercado pago', kind: 'atributo', llm: null, web: { appears: false }, maps: { appears: false } },
  { text: 'cafetería de especialidad en Rosario opiniones', kind: 'atributo', llm: null, web: { appears: true, position: 9 }, maps: { appears: false } },
  { text: 'cafetería de especialidad en Rosario precios', kind: 'atributo', llm: null, web: { appears: false }, maps: { appears: false } },
  { text: NAME, kind: 'marca', llm: null, web: { appears: true, position: 1 }, maps: { appears: true, position: 1 } },
  { text: `${NAME} ${CITY}`, kind: 'marca', llm: null, web: { appears: true, position: 1 }, maps: { appears: true, position: 1 } },
]
const positionScore = (r: Res) => (!r?.appears ? 0 : r.position == null ? 0.3 : r.position <= 3 ? 1 : r.position <= 10 ? 0.6 : 0.3)

function visibilidad(fecha: string) {
  const canal = (k: 'llm' | 'web' | 'maps', name: string) => {
    const rows = QUERIES.map((q) => q[k]).filter((r): r is NonNullable<Res> => r !== null)
    return {
      canal: name,
      puntaje: Math.round((rows.reduce((a, r) => a + positionScore(r), 0) / rows.length) * 100),
      con_aparicion: rows.filter((r) => r.appears).length,
      total: rows.length,
      estado: 'ok' as const,
    }
  }
  const por_canal = [canal('llm', 'llm'), canal('web', 'google_web'), canal('maps', 'google_maps')]
  const nonBrand = QUERIES.filter((q) => q.kind !== 'marca')
  const sinNombre = nonBrand.filter((q) => q.llm?.appears || q.web?.appears || q.maps?.appears).length
  return {
    fecha,
    puntaje_global: Math.round(por_canal.reduce((a, c) => a + c.puntaje, 0) / por_canal.length),
    por_canal,
    sin_nombre: { con_aparicion: sinNombre, total: nonBrand.length },
    ranking_competidores: [
      { nombre: COMP[0], apariciones: 11, canales: ['llm', 'google_web', 'google_maps'] },
      { nombre: COMP[1], apariciones: 8, canales: ['llm', 'google_maps'] },
      { nombre: COMP[2], apariciones: 6, canales: ['google_web', 'google_maps'] },
      { nombre: COMP[3], apariciones: 4, canales: ['llm', 'google_maps'] },
    ],
    fuentes_frecuentes: [
      { dominio: 'instagram.com', veces: 7 },
      { dominio: 'rosario3.com', veces: 4 },
      { dominio: 'tripadvisor.com.ar', veces: 3 },
      { dominio: 'lacapital.com.ar', veces: 3 },
      { dominio: 'mercadolibre.com.ar', veces: 2 },
    ],
    redes: [
      {
        red: 'instagram',
        handle: 'cafeombu.ros',
        seguidores: 1840,
        posts_por_semana: 1.2,
        engagement: 3.1,
        vs_competidores: 'Tenés menos seguidores que el promedio de los competidores cargados (4.300).',
      },
    ],
    maps_propio: { rating: 4.7, reviews: 86 },
    acciones: [
      {
        accion: 'Completá tu ficha de Google Maps con fotos del tostado, horarios y la categoría "Tienda de café" además de "Cafetería".',
        canal: 'google_maps',
        evidencia: 'Aparecés en solo 2 de 10 búsquedas de Maps que no usan tu nombre, aunque tenés 4,7 estrellas con 86 reseñas.',
        prioridad: 'alta',
        esfuerzo: 'bajo',
      },
      {
        accion: 'Pedí reseñas que mencionen "café de especialidad" y "café en grano": son las palabras con las que te buscan.',
        canal: 'google_maps',
        evidencia: `${COMP[0]} aparece en 11 búsquedas y sus reseñas repiten esas palabras.`,
        prioridad: 'alta',
        esfuerzo: 'bajo',
      },
      {
        accion: 'Sumá a tu web una página de "Regalos con café" con el box y envío a domicilio.',
        canal: 'google_web',
        evidencia: 'En "regalos con café en Rosario" aparecés recién en el puesto 8, y en las búsquedas con envío no aparecés.',
        prioridad: 'media',
        esfuerzo: 'medio',
      },
      {
        accion: 'Conseguí una nota o mención en medios locales sobre el tostado propio: los asistentes de IA citan esas fuentes.',
        canal: 'llm',
        evidencia: 'Los asistentes te nombran en 1 de 5 búsquedas; las fuentes que más citan son rosario3.com y lacapital.com.ar.',
        prioridad: 'media',
        esfuerzo: 'alto',
      },
    ],
    missing_inputs: ['Usuario de TikTok (si tenés)'],
    assumptions: ['El puntaje mide solo Asistentes de IA, Google y Google Maps. Las redes se muestran aparte porque no se miden por búsqueda.'],
  }
}

/* ───────────── Percepción y estrategia ───────────── */
const REVIEWS = [
  { text: 'El mejor flat white de Pichincha. Te explican de dónde viene cada café.', rating: 5 },
  { text: 'Compré el box de regalo para mi viejo y le encantó. Llegó a tiempo.', rating: 5 },
  { text: 'Muy rico todo pero los sábados a la mañana hay que esperar bastante.', rating: 4 },
  { text: 'Me asesoraron para elegir el molido según mi cafetera. Volví por más.', rating: 5 },
  { text: 'Las medialunas, un golazo. El lugar es chiquito pero muy lindo.', rating: 5 },
  { text: 'Café riquísimo, aunque no sabía que vendían café en grano hasta que pregunté.', rating: 4 },
  { text: 'Atención súper amable, te hacen sentir de la casa.', rating: 5 },
  { text: 'Pedí por WhatsApp y me lo mandaron recién tostado. Excelente.', rating: 5 },
]

const PERCEPCION = (fecha: string) => ({
  temas: [
    { tema: 'Asesoramiento y atención', menciones: 4, sentimiento: 'positivo', ejemplo: 'Me asesoraron para elegir el molido según mi cafetera.' },
    { tema: 'Calidad del café', menciones: 4, sentimiento: 'positivo', ejemplo: 'El mejor flat white de Pichincha.' },
    { tema: 'Regalos y envíos', menciones: 2, sentimiento: 'positivo', ejemplo: 'Compré el box de regalo para mi viejo y le encantó.' },
    { tema: 'Espera en horas pico', menciones: 1, sentimiento: 'negativo', ejemplo: 'Los sábados a la mañana hay que esperar bastante.' },
  ],
  brechas: [
    {
      dueno_dice: 'Nuestro diferencial es el café tostado en el local.',
      clientes_valoran: 'Que les expliquen el origen y los asesoren para preparar en casa.',
      comunicacion_muestra: 'Fotos del local y del café servido, casi nada de asesoramiento.',
      tipo: 'brecha',
      pregunta: '¿Te animás a mostrar más el asesoramiento, por ejemplo cómo elegir el molido?',
    },
    {
      dueno_dice: 'Vendemos café en grano y regalos.',
      clientes_valoran: 'El box de regalo y el envío recién tostado.',
      comunicacion_muestra: 'Casi no aparece la venta de café para llevar a casa.',
      tipo: 'brecha',
      pregunta: '¿Querés que la venta para casa y regalos tenga más lugar en tus publicaciones?',
    },
    {
      dueno_dice: 'Atención cercana.',
      clientes_valoran: 'La amabilidad y sentirse "de la casa".',
      comunicacion_muestra: 'Tono cercano y en voseo.',
      tipo: 'coincide',
      pregunta: '',
    },
  ],
  cantidad_resenas: REVIEWS.length,
  suficiente: true,
  fecha,
})

const ESTRATEGIA = {
  modo: 'descubrir',
  nichos: [
    {
      nombre: 'Café de especialidad para preparar en casa',
      descripcion: 'Gente que ya toma buen café afuera y quiere replicarlo en casa: grano fresco, molido a medida y asesoramiento.',
      persona: 'Profesional de 28 a 40 años, trabaja desde casa algunos días y tiene prensa francesa o cafetera italiana.',
      product_names: ['Blend Ombú 250 g', 'Colombia Huila 250 g', 'Taza de cerámica artesanal', 'Prensa francesa 600 ml'],
      porcentaje_catalogo: 57,
      competencia: 'media',
      evidencia: [
        { dato: '4 de 8 reseñas destacan el asesoramiento y la calidad del café.', fuente: 'Percepción' },
        { dato: 'En "café en grano en Rosario" ya aparecés en Google (puesto 6) y en asistentes de IA (puesto 4).', fuente: 'Visibilidad' },
        { dato: 'El Blend Ombú es tu producto estrella y tenés 120 unidades.', fuente: 'Catálogo' },
      ],
      riesgos: ['Requiere explicar cómo preparar: más contenido educativo.'],
      recomendado: true,
    },
    {
      nombre: 'Regalos con café',
      descripcion: 'Personas que buscan un regalo distinto: box con café y taza, con envío.',
      persona: 'Persona de 30 a 55 años que busca regalos para cumpleaños o fechas especiales.',
      product_names: ['Box regalo café + taza', 'Taza de cerámica artesanal', 'Blend Ombú 250 g'],
      porcentaje_catalogo: 43,
      competencia: 'baja',
      evidencia: [
        { dato: 'El box regalo es un producto a impulsar y 2 reseñas lo mencionan.', fuente: 'Percepción' },
        { dato: 'En "regalos con café en Rosario" aparecés recién en el puesto 8.', fuente: 'Visibilidad' },
      ],
      riesgos: ['Ventas concentradas en pocas fechas del año.'],
      recomendado: false,
    },
    {
      nombre: 'Café para llevar en Pichincha',
      descripcion: 'Gente que trabaja o pasea por la zona y busca un buen café rápido.',
      persona: 'Oficinista de 25 a 35 años que pasa por Pichincha camino al trabajo.',
      product_names: ['Medialunas de manteca x6', 'Alfajores de maicena x6'],
      porcentaje_catalogo: 29,
      competencia: 'alta',
      evidencia: [
        { dato: 'En Maps aparecés en el puesto 3 para "café para llevar cerca del Monumento".', fuente: 'Visibilidad' },
        { dato: `${COMP[0]} y ${COMP[1]} dominan las búsquedas genéricas de cafetería.`, fuente: 'Visibilidad' },
      ],
      riesgos: ['Mucha competencia y margen chico por pedido.', 'Una reseña marca demoras en horas pico.'],
      recomendado: false,
    },
  ],
  investigacion: null,
  nicho_elegido: 'Café de especialidad para preparar en casa',
  posicionamiento: {
    propuesta_valor: 'El café de especialidad tostado en Pichincha, con alguien que te enseña a prepararlo en tu casa.',
    mensajes_clave: [
      'Tostamos cada semana: cada bolsa dice el origen y la fecha de tueste.',
      'Te asesoramos para elegir el molido según tu cafetera.',
      'Llevate el café de tu cafetería favorita a tu casa, o regalalo.',
    ],
    tono: {
      descripcion: 'Cercano y cálido, que enseña sin ser técnico. Voseo y humor suave.',
      frases_si: ['Te contamos cómo sacarle el jugo a tu prensa', 'Recién tostado, como te gusta'],
      frases_no: ['El mejor café del mundo', 'Precios imbatibles'],
    },
    persona_principal: {
      nombre: 'Martina, la que trabaja desde casa',
      descripcion: 'Tiene 32 años, trabaja dos días desde casa y extraña el café de la cafetería.',
      preocupaciones: ['Que el café en casa no salga igual', 'No saber qué molido comprar'],
      canales: ['Instagram', 'Google Maps', 'WhatsApp'],
    },
  },
  con_percepcion: true,
  missing_inputs: [],
}

/* ───────────── Calendario ───────────── */
const IDEAS: Record<string, { idea: string; copy: string; porque: string }[]> = {
  'Blend Ombú 250 g': [
    { idea: 'Así tostamos el Blend Ombú', copy: 'Cada martes prendemos el tostador. Este es el Blend Ombú: chocolate, nuez y un final dulce. ¿Lo probaste en casa?', porque: 'Es tu producto estrella y el tostado propio es tu diferencial.' },
    { idea: 'Tu cafetera, tu molido', copy: 'Prensa, italiana o filtro: decinos cuál tenés y te molemos el Blend Ombú a medida.', porque: '4 de 8 reseñas valoran el asesoramiento; hoy casi no se ve en tu comunicación.' },
  ],
  'Box regalo café + taza': [
    { idea: 'El regalo que se toma', copy: 'Box con café recién tostado y taza artesanal. Te lo mandamos a domicilio.', porque: 'Es un producto a impulsar y el objetivo de ventas depende de él.' },
    { idea: 'Armá tu box en 3 pasos', copy: 'Elegís el café, elegís la taza y nosotros lo envolvemos. Pedilo por WhatsApp.', porque: 'En "regalos con café en Rosario" estás en el puesto 8: hay espacio para crecer.' },
  ],
  'Taza de cerámica artesanal': [
    { idea: 'Detrás de cada taza', copy: 'Las hace a mano una ceramista de Funes. Ninguna es igual a otra.', porque: 'Tenés sobrestock de tazas: conviene mostrarlas sin rebajarlas.' },
  ],
  'Alfajores de maicena x6': [
    { idea: 'El compañero del café', copy: 'Alfajores de maicena hechos acá. Pedí la media docena para la merienda.', porque: 'Suma ticket en cada pedido de café para llevar a casa.' },
  ],
  'Colombia Huila 250 g': [
    { idea: 'Origen del mes: Colombia Huila', copy: 'Notas a frutos rojos y panela. Ideal para filtro. Preguntanos cómo prepararlo.', porque: 'Contar el origen refuerza el nicho de café para preparar en casa.' },
  ],
}

function calendario(start: string, d1: string, d2: string, fichaPrecios: string, acciones: any[]) {
  const sk = buildSkeleton({
    start,
    end: d2,
    piezasPorSemana: 3,
    formatos: FICHA.capacidad.formatos_posibles,
    socialChannels: ['Instagram'],
    products: PRODUCTS.map((p) => ({ name: p.name, stock: p.stock, is_star: p.is_star, push: p.push, excluded: false })),
    objectives: [
      { description: 'Sumar 300 seguidores en Instagram', deadline: d1 },
      { description: 'Vender 40 box de regalo', deadline: d2 },
    ],
    acciones,
    commercialDates: [],
    precios: fichaPrecios as any,
  })
  const used: Record<string, number> = {}
  const items = sk.items.map((it, idx) => {
    let text = { idea: it.idea ?? '', copy: '', porque: it.porque ?? '' }
    if (it.campana >= 0) {
      const pool = IDEAS[it.producto ?? ''] ?? IDEAS['Blend Ombú 250 g']
      const k = (used[it.producto ?? ''] = (used[it.producto ?? ''] ?? -1) + 1)
      text = pool[k % pool.length]
    }
    // Las primeras semanas ya están aprobadas, así se ve Contenido funcionando.
    const status = idx < 6 ? 'aprobada' : 'propuesta'
    return {
      id: `i${idx}`,
      status,
      campana: it.campana,
      fecha: it.fecha,
      canal: it.canal,
      formato: it.formato,
      producto: it.producto,
      fecha_comercial: it.fecha_comercial,
      ...text,
      muestra_precio: it.muestra_precio,
      promo_propuesta: false,
    }
  })
  // Un guion ya escrito para mostrar cómo queda.
  const firstReel = items.find((i) => i.status === 'aprobada' && i.formato === 'reel')
  if (firstReel) Object.assign(firstReel, { script: SCRIPT })
  return {
    horizonte: { inicio: start, fin: d2, semanas: sk.semanas, granularidad: sk.granularidad, piezas_por_semana: 3 },
    campanas: [
      { nombre: 'Café en casa', objetivo: 'Sumar 300 seguidores en Instagram', mensaje_clave: 'Te enseñamos a preparar el café de tu cafetería favorita en casa.', inicio: start, fin: d1, kpi: '+300 seguidores en Instagram' },
      { nombre: 'Regalá café', objetivo: 'Vender 40 box de regalo', mensaje_clave: 'El regalo que se toma: café recién tostado y taza artesanal.', inicio: start, fin: d2, kpi: '40 box vendidos' },
    ],
    items,
    stock: sk.stock,
    missing_inputs: [],
  }
}

const SCRIPT = {
  gancho: '¿Tu café en casa no sale como el de la cafetería? Es el molido.',
  escenas: [
    { tiempo: '0-3 s', que_grabar: 'Primer plano de una bolsa de Blend Ombú abriéndose.', texto_en_pantalla: 'Tu café en casa no sale igual?', voz: '¿Tu café en casa no sale como el de acá?' },
    { tiempo: '3-10 s', que_grabar: 'El molinillo con tres molidos distintos en cucharas.', texto_en_pantalla: 'Fino · Medio · Grueso', voz: 'El secreto es el molido: cada cafetera pide uno distinto.' },
    { tiempo: '10-18 s', que_grabar: 'Barista sirviendo en prensa francesa e italiana.', texto_en_pantalla: 'Prensa = grueso · Italiana = fino', voz: 'Contanos cuál tenés y te lo molemos a medida.' },
    { tiempo: '18-22 s', que_grabar: 'Bolsa cerrada con la etiqueta de fecha de tueste.', texto_en_pantalla: 'Recién tostado en Pichincha', voz: 'Recién tostado, como te gusta.' },
  ],
  cta: 'Escribinos por WhatsApp con tu cafetera y te lo preparamos.',
  duracion_seg: 22,
  copy_publicacion: '¿Prensa, italiana o filtro? Decinos cuál tenés y te molemos el Blend Ombú a medida ☕',
  consejos: ['Grabá con luz natural de la ventana.', 'Mantené el celular vertical y quieto en las tomas de detalle.'],
}

/* ───────────── Chat ───────────── */
const msg = (id: string, role: 'user' | 'assistant', text: string): UIMessage => ({ id: `demo-${id}`, role, parts: [{ type: 'text', text }] })
const CHAT: UIMessage[] = [
  msg('1', 'assistant', 'Leí tu web y tu catálogo. Entiendo que Café Ombú es una cafetería de especialidad en Pichincha que tuesta su propio café y vende café en grano, pastelería y regalos. Es lo que deduje: lo confirmamos juntos.'),
  msg('2', 'assistant', '¿Cuántas personas trabajan en el negocio y alguien se ocupa del marketing?\nCon esto ajusto qué tan profundo es el análisis y qué tan grande es el plan.'),
  msg('3', 'user', 'Hasta 5, nadie hace marketing'),
  msg('4', 'assistant', 'Cuando publiquemos un producto, ¿querés que aparezca su precio?\nAsí cada publicación del plan sale con o sin precio según lo que prefieras.'),
  msg('5', 'user', 'Solo en historias'),
  msg('6', 'assistant', '¿Cuántas publicaciones por semana podés sostener?\nEl calendario nunca te va a pedir más que esto.'),
  msg('7', 'user', '3 por semana'),
  msg('8', 'user', 'Proponeme objetivos con fecha para mi negocio.'),
  msg('9', 'assistant', 'Elegiste dos objetivos: sumar 300 seguidores en Instagram y vender 40 box de regalo. Con eso armé el plan. Ya está todo aprobado: podés recorrer el diagnóstico, la estrategia y el calendario.'),
]

/** Crea la marca demo si no existe o si cambió su versión. */
export async function ensureDemoBrand({ force = false } = {}) {
  if (!force) {
    const { data } = await db()
      .from('dossier_sections')
      .select('data')
      .eq('brand_id', DEMO_BRAND_ID)
      .eq('section', 'ficha')
      .maybeSingle()
    if ((data?.data as any)?._demo_version === DEMO_VERSION) return
  }

  await db().from('brands').delete().eq('id', DEMO_BRAND_ID)

  const today = todayISO()
  const start = nextMonday(today)
  const d1 = addDays(start, 27) // ~4 semanas
  const d2 = addDays(start, 48) // ~7 semanas
  const lastWeek = addDays(today, -6)
  const vis = visibilidad(lastWeek)

  const insert = async (table: string, rows: any) => {
    const { error } = await db().from(table).insert(rows)
    if (error) throw new Error(`demo · ${table}: ${error.message}`)
  }

  await insert('brands', {
    id: DEMO_BRAND_ID,
    name: NAME,
    city: CITY,
    size_segment: 'micro',
    stage: 'plan',
    website_url: 'https://cafeombu.example',
    updated_at: new Date(Date.now() - 365 * 864e5).toISOString(), // no aparece como "la más reciente"
  })

  await insert(
    'products',
    PRODUCTS.map((p) => ({ brand_id: DEMO_BRAND_ID, name: p.name, category: p.category, price: p.price, stock: p.stock, is_star: p.is_star, push: p.push, source: 'catalogo' })),
  )
  await insert('brand_channels', [
    { brand_id: DEMO_BRAND_ID, type: 'web', handle_or_url: 'https://cafeombu.example', origin: 'confirmado' },
    { brand_id: DEMO_BRAND_ID, type: 'instagram', handle_or_url: '@cafeombu.ros', origin: 'confirmado' },
    { brand_id: DEMO_BRAND_ID, type: 'whatsapp', handle_or_url: '+54 341 000-0000', origin: 'confirmado' },
  ])
  await insert(
    'competitors',
    COMP.map((name, i) => ({ brand_id: DEMO_BRAND_ID, name, source: i < 2 ? 'cliente' : 'detectado', detected_in: vis.ranking_competidores[i].canales, confirmed: i < 3 })),
  )
  await insert('objectives', [
    { brand_id: DEMO_BRAND_ID, type: 'awareness', description: 'Sumar 300 seguidores en Instagram', metric: 'seguidores', target_value: 300, deadline: d1, priority: 1, proposed_by: 'copiloto' },
    { brand_id: DEMO_BRAND_ID, type: 'ventas', description: 'Vender 40 box de regalo', metric: 'unidades', target_value: 40, deadline: d2, priority: 2, proposed_by: 'copiloto' },
  ])
  await insert('reviews', REVIEWS.map((r) => ({ brand_id: DEMO_BRAND_ID, source: 'pegado', text: r.text, rating: r.rating })))

  const section = (name: string, data: unknown) => ({ brand_id: DEMO_BRAND_ID, section: name, version: 1, status: 'approved', data, approved_at: new Date().toISOString() })
  await insert('dossier_sections', [
    section('ficha', FICHA),
    section('visibilidad', vis),
    section('percepcion', PERCEPCION(lastWeek)),
    section('estrategia', ESTRATEGIA),
    section('calendario', calendario(start, d1, d2, FICHA.precios_en_publicaciones, vis.acciones)),
  ])
  await insert(
    'field_provenance',
    FICHA_PATHS.map((path) => ({
      brand_id: DEMO_BRAND_ID,
      section: 'ficha',
      path,
      origin: INFERRED.has(path) ? 'inferido' : 'confirmado',
      source_ref: INFERRED.has(path) ? 'https://cafeombu.example' : 'chat',
    })),
  )
  await insert(
    'approvals',
    ['CP1', 'CP2a', 'CP2', 'CP4', 'CP5'].map((checkpoint) => ({ brand_id: DEMO_BRAND_ID, checkpoint, decision: 'aprobado' })),
  )

  // Búsquedas y resultados de Visibilidad (coherentes con los puntajes de arriba).
  const { data: qRows, error: qErr } = await db()
    .from('visibility_queries')
    .insert(QUERIES.map((q) => ({ brand_id: DEMO_BRAND_ID, text: q.text, kind: q.kind, approved: true, origin: 'agente' })))
    .select('id,text')
  if (qErr) throw new Error(`demo · visibility_queries: ${qErr.message}`)
  const idOf = new Map((qRows ?? []).map((r) => [r.text, r.id]))
  const results: any[] = []
  for (const q of QUERIES) {
    const query_id = idOf.get(q.text)
    for (const [channel, r] of [['llm', q.llm], ['google_web', q.web], ['google_maps', q.maps]] as const) {
      if (r === null) {
        results.push({ query_id, channel, status: 'skipped', raw: { motivo: 'Solo se pregunta a la IA en búsquedas sin el nombre de tu marca' } })
        continue
      }
      const mentions = r.appears && r.position ? [...COMP.slice(0, r.position - 1), NAME, ...COMP.slice(r.position - 1)].slice(0, 6) : COMP.slice(0, 4)
      results.push({ query_id, channel, status: 'ok', appears: r.appears, position: r.position ?? null, mentions, sources: [{ url: 'https://www.rosario3.com', domain: 'rosario3.com' }] })
    }
  }
  await insert('visibility_results', results)

  // Ventas de ejemplo para el Dashboard, con hallazgos ya escritos.
  const months = [3.1, 3.4, 3.2, 3.9, 4.4, 4.1].map((v, i) => {
    const dt = new Date(today + 'T12:00:00Z')
    dt.setUTCDate(1)
    dt.setUTCMonth(dt.getUTCMonth() - (6 - i))
    return { brand_id: DEMO_BRAND_ID, month: dt.toISOString().slice(0, 7), total: Math.round(v * 1e6), orders: Math.round((v * 1e6) / 15500), is_demo: true }
  })
  await insert('sales_monthly', months)
  await insert('sales_products', [
    { brand_id: DEMO_BRAND_ID, product: 'Blend Ombú 250 g', total: 7350000, units: 750, is_demo: true },
    { brand_id: DEMO_BRAND_ID, product: 'Medialunas de manteca x6', total: 4860000, units: 900, is_demo: true },
    { brand_id: DEMO_BRAND_ID, product: 'Box regalo café + taza', total: 2988000, units: 120, is_demo: true },
    { brand_id: DEMO_BRAND_ID, product: 'Alfajores de maicena x6', total: 2520000, units: 350, is_demo: true },
    { brand_id: DEMO_BRAND_ID, product: 'Colombia Huila 250 g', total: 1725000, units: 150, is_demo: true },
    { brand_id: DEMO_BRAND_ID, product: 'Taza de cerámica artesanal', total: 894000, units: 60, is_demo: true },
  ])
  await insert('insights', {
    brand_id: DEMO_BRAND_ID,
    kind: 'ventas',
    data: {
      hallazgos: [
        { titulo: 'El café en grano sostiene el negocio', dato: 'Blend Ombú y Colombia Huila suman el 45 % de lo facturado en 6 meses.', accion: 'Priorizá el contenido de café para preparar en casa: es lo que más vendés.' },
        { titulo: 'Las tazas no rotan', dato: 'Se vendieron 60 tazas en 6 meses y tenés 200 en stock.', accion: 'Sumalas al box de regalo en vez de venderlas sueltas.' },
        { titulo: 'Bajó el último mes', dato: 'Las ventas cayeron un 7 % respecto del mes anterior.', accion: 'Reforzá las publicaciones del box de regalo en las próximas semanas.' },
      ],
    },
  })

  const base = Date.now() - 2 * 864e5
  await insert(
    'messages',
    CHAT.map((m, i) => ({ brand_id: DEMO_BRAND_ID, role: m.role, content: m, input_mode: m.role === 'user' ? 'chip' : 'texto', tab: 'copiloto', created_at: new Date(base + i * 60_000).toISOString() })),
  )
}
