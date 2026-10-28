import { getPath, provenanceMap, type Dossier } from '@/lib/dossier'

export type ChecklistLevel = 'obligatorio' | 'recomendado' | 'opcional'

export interface ChecklistItem {
  id: string
  label: string
  level: ChecklistLevel
  done: boolean
  /** Tipo de archivo que se puede cargar para completar este punto, si aplica. */
  uploadKind?: 'catalogo' | 'stock' | 'branding' | 'ventas' | 'resenas'
  hint?: string
}

export function computeChecklist(d: Dossier): ChecklistItem[] {
  const ficha = d.sections.ficha?.data
  const prov = provenanceMap(d)
  const answered = (path: string) => {
    const p = prov[`ficha.${path}`]
    // Confirmado por el dueño cuenta aunque sea una lista vacía (ej. "ningún beneficio").
    if (p?.origin === 'confirmado') return true
    const v = getPath(ficha, path)
    if (Array.isArray(v)) return v.length > 0
    if (p && p.origin !== 'pendiente') return true
    return v !== undefined && v !== null && v !== ''
  }
  const hasMedia = (...kinds: string[]) => d.media.some((m) => kinds.includes(m.kind))
  const hasChannel = (...types: string[]) => d.channels.some((c) => types.includes(c.type))

  const hasProducts =
    d.products.length > 0 || answered('productos_resumen.total') || answered('productos_resumen.descripcion')

  return [
    {
      id: 'nombre_ciudad',
      label: 'Nombre y ciudad',
      level: 'obligatorio',
      done: !!d.brand?.name && !!d.brand?.city,
    },
    {
      id: 'productos',
      label: 'Productos',
      level: 'obligatorio',
      done: hasProducts,
      uploadKind: 'catalogo',
      hint: 'Catálogo, web o contados en el chat',
    },
    { id: 'rubro', label: 'Qué vendés', level: 'obligatorio', done: answered('marca.rubro') },
    { id: 'tamano', label: 'Tamaño del negocio', level: 'obligatorio', done: !!d.brand?.size_segment },
    { id: 'publico', label: 'A quién le vendés', level: 'obligatorio', done: answered('publico.actual') },
    { id: 'diferencial', label: 'Por qué te eligen', level: 'obligatorio', done: answered('marca.diferencial') },
    { id: 'canales', label: 'Dónde vendés', level: 'obligatorio', done: answered('marca.canales_venta') },
    { id: 'nivel_precio', label: 'Nivel de precios', level: 'obligatorio', done: answered('posicionamiento_precio') },
    {
      id: 'comunicacion',
      label: 'Cómo les hablás',
      level: 'obligatorio',
      done: answered('comunicacion.trato') && answered('comunicacion.tono'),
    },
    {
      id: 'precios',
      label: 'Precios en publicaciones',
      level: 'obligatorio',
      done: answered('precios_en_publicaciones'),
    },
    {
      id: 'objetivos',
      label: 'Objetivo con fecha',
      level: 'obligatorio',
      done: d.objectives.some((o) => !!o.deadline),
    },
    {
      id: 'piezas',
      label: 'Historias y posts por semana',
      level: 'obligatorio',
      done: answered('capacidad.piezas_por_semana') && answered('capacidad.historias_por_dia'),
    },
    {
      id: 'stock',
      label: 'Stock',
      level: 'recomendado',
      done: hasMedia('stock') || d.products.some((p) => p.stock != null),
      uploadKind: 'stock',
    },
    {
      id: 'branding',
      label: 'Manual de marca o logo',
      level: 'recomendado',
      done: hasMedia('branding', 'logo'),
      uploadKind: 'branding',
    },
    {
      id: 'redes',
      label: 'Instagram o TikTok',
      level: 'recomendado',
      done: hasChannel('instagram', 'tiktok'),
    },
    {
      id: 'beneficios',
      label: 'Beneficios',
      level: 'recomendado',
      done: answered('beneficios_comunicables'),
    },
    {
      id: 'competidores',
      label: 'Competidores',
      level: 'recomendado',
      done: d.competitors.length > 0,
    },
    {
      id: 'resenas',
      label: 'Reseñas',
      level: 'recomendado',
      done: d.reviewsCount > 0 || hasMedia('resenas'),
      uploadKind: 'resenas',
    },
    {
      id: 'ventas',
      label: 'Historial de ventas',
      level: 'recomendado',
      done: hasMedia('ventas'),
      uploadKind: 'ventas',
    },
    {
      id: 'restricciones',
      label: 'Restricciones',
      level: 'opcional',
      done: answered('restricciones'),
    },
  ]
}

export function requiredComplete(items: ChecklistItem[]) {
  return items.filter((i) => i.level === 'obligatorio').every((i) => i.done)
}
