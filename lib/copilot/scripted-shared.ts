// Tipos y ayudas de las preguntas fijas que también usa el navegador (sin acceso a la base).

/* ───────────── Lo que viaja al navegador (solo datos) ───────────── */

export type StepMode = 'single' | 'multi' | 'text'

export interface ScriptedStep {
  id: string
  question: string
  /** Para qué se pide el dato, en una frase. */
  why: string
  mode: StepMode
  options: string[]
  /** Permite escribir una respuesta propia (o sumar una opción en las de varias). */
  allowText: boolean
  textPlaceholder?: string
  /** Opcional: muestra un botón para saltearla. */
  skipLabel?: string
  /** Lo que Marky dedujo de la web o el catálogo, para que el dueño lo confirme. */
  deduced?: string
  /** Paso que pasa a la IA (ej. proponer objetivos). */
  handoff?: { label: string; send: string }
}

export interface ScriptedAnswer {
  values?: string[]
  text?: string
  action?: 'confirm' | 'skip'
}

/**
 * Para cuando el dueño escribe en el chat con una pregunta fija abierta: intenta
 * usar el texto como respuesta. Devuelve null si no se puede (y hay que pedirle que toque una opción).
 */
export function answerFromTyped(step: ScriptedStep, typed: string): ScriptedAnswer | null {
  const t = typed.trim()
  if (!t) return null
  if (step.mode === 'text' || step.allowText) return { values: [], text: t }
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const hit = step.options.find((o) => norm(o) === norm(t)) ?? step.options.find((o) => norm(o).includes(norm(t)) || norm(t).includes(norm(o)))
  if (hit) return { values: [hit] }
  // Números sueltos: "3" → la opción que lo contiene.
  const n = t.match(/\d+/)?.[0]
  const byNum = n ? step.options.find((o) => (o.match(/\d+/g) ?? ([] as string[])).includes(n)) : undefined
  return byNum ? { values: [byNum] } : null
}
