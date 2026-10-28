// Preguntas fijas del Copiloto: se hacen con botones y se guardan sin pasar por la IA.
// La IA solo interviene cuando el dueño escribe algo libre, o en los pasos que necesitan
// pensar (por ejemplo, proponer objetivos con fecha).

import type { Dossier } from '@/lib/dossier'
import { computeChecklist } from '@/lib/checklist'
import { isPlaceholderName } from '@/lib/brand-constants'

export interface ScriptedOption {
  label: string
  /** Valor a guardar. Si no hay, la opción manda `send` a la IA como mensaje del dueño. */
  value?: string | number | string[]
  /** Datos extra a guardar junto con el valor (ruta → valor). */
  extra?: Record<string, string | number | boolean>
  /** Texto que se le manda a la IA (para respuestas que necesitan conversación). */
  send?: string
}

export interface ScriptedStep {
  id: 'tamano' | 'precios' | 'piezas' | 'restricciones' | 'objetivos'
  question: string
  /** Para qué se pide el dato, en una frase. */
  why: string
  /** Ruta en la Ficha donde se guarda la respuesta. */
  path?: string
  options: ScriptedOption[]
}

export const SCRIPTED_STEPS: ScriptedStep[] = [
  {
    id: 'tamano',
    question: '¿Cuántas personas trabajan en el negocio y alguien se ocupa del marketing?',
    why: 'Con esto ajusto qué tan profundo es el análisis y qué tan grande es el plan.',
    path: 'tamano.segmento',
    options: [
      { label: 'Hasta 5, nadie hace marketing', value: 'micro', extra: { 'tamano.equipo_marketing': false } },
      { label: 'Hasta 5, alguien hace un poco', value: 'micro', extra: { 'tamano.equipo_marketing': true } },
      { label: 'Entre 6 y 50', value: 'pyme' },
      { label: 'Más de 50 o varias sucursales', value: 'grande', extra: { 'tamano.equipo_marketing': true } },
    ],
  },
  {
    id: 'precios',
    question: 'Cuando publiquemos un producto, ¿querés que aparezca su precio?',
    why: 'Así cada publicación del plan sale con o sin precio según lo que prefieras.',
    path: 'precios_en_publicaciones',
    options: [
      { label: 'Siempre', value: 'siempre' },
      { label: 'Nunca', value: 'nunca' },
      { label: 'Solo en promos', value: 'solo_promos' },
      { label: 'Solo en historias', value: 'solo_historias' },
    ],
  },
  {
    id: 'piezas',
    question: '¿Cuántas publicaciones por semana podés sostener?',
    why: 'El calendario nunca te va a pedir más que esto.',
    path: 'capacidad.piezas_por_semana',
    options: [
      { label: '2 por semana', value: 2 },
      { label: '3 por semana', value: 3 },
      { label: '5 por semana', value: 5 },
    ],
  },
  {
    id: 'restricciones',
    question: '¿Hay algo que nunca quieras publicar? Por ejemplo, descuentos, ciertos productos o temas.',
    why: 'Es opcional: lo respeto en todo el contenido que te proponga.',
    path: 'restricciones',
    options: [
      { label: 'Nada en especial', value: [] },
      { label: 'Sí, te cuento', send: 'Sí, hay cosas que no quiero publicar. Te cuento.' },
    ],
  },
  {
    id: 'objetivos',
    question: 'Listo con lo básico. Ahora te propongo objetivos con fecha según tu stock y la temporada.',
    why: 'Los objetivos ordenan todo el plan: qué publicar, cuándo y para qué.',
    options: [{ label: 'Proponeme objetivos', send: 'Proponeme objetivos con fecha para mi negocio.' }],
  },
]

/**
 * Preguntas fijas que faltan, en orden. El cliente muestra la primera que el dueño
 * no salteó en esta sesión (las opciones que pasan a la IA la saltean).
 */
export function pendingScriptedSteps(d: Dossier): ScriptedStep[] {
  const brand = d.brand
  if (!brand || brand.stage === 'arranque' || isPlaceholderName(brand.name) || !brand.city) return []

  const done = Object.fromEntries(computeChecklist(d).map((i) => [i.id, i.done]))
  const basics = ['tamano', 'precios', 'piezas'] as const
  return SCRIPTED_STEPS.filter((step) => {
    if (step.id === 'objetivos') return basics.every((b) => done[b]) && !done.objetivos
    return !done[step.id]
  })
}

export function findStep(id: string) {
  return SCRIPTED_STEPS.find((s) => s.id === id) ?? null
}
