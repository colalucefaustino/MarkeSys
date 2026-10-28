'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, Compass, Loader2, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DEMO_BRAND_ID } from '@/lib/demo/constants'
import { cn } from '@/lib/utils'

interface Step {
  tab: string
  title: string
  text: string
}

const STEPS: Step[] = [
  {
    tab: 'copiloto',
    title: 'Todo arranca con Marky',
    text: 'El dueño carga su web o su catálogo y Marky le pregunta lo que falta, de a una cosa por vez. Las preguntas fijas son botones que se guardan sin usar IA; la IA entra cuando el dueño escribe algo libre.',
  },
  {
    tab: 'marca',
    title: 'La Ficha de marca',
    text: 'Todo lo que la app sabe del negocio, con el origen de cada dato: confirmado por el dueño o deducido de su web (en amarillo, para que lo confirme). Nada se inventa.',
  },
  {
    tab: 'visibilidad',
    title: '¿Te encuentran tus clientes?',
    text: 'Se prueban búsquedas reales en Google y Google Maps, y las más importantes también en asistentes de IA. Lo clave: en cuántas aparece sin que lo busquen por nombre y quién aparece en su lugar.',
  },
  {
    tab: 'percepcion',
    title: 'Lo que dicen sus clientes',
    text: 'Las reseñas se comparan con lo que el dueño dice y con lo que comunica. Las brechas muestran oportunidades: acá, los clientes valoran el asesoramiento y casi no se ve en sus redes.',
  },
  {
    tab: 'estrategia',
    title: 'Hacia dónde llevar la marca',
    text: 'Tres nichos posibles con la evidencia de cada uno, y el posicionamiento del recomendado ya escrito. Todo sale de una sola llamada a la IA, con el diagnóstico y las reseñas juntos.',
  },
  {
    tab: 'calendario',
    title: 'El plan, pieza por pieza',
    text: 'El código arma fechas, cantidad por semana, productos según stock y precios; la IA escribe las ideas y los textos. Tocá cualquier pieza para ver su "¿Por qué?".',
  },
  {
    tab: 'contenido',
    title: 'Guiones y piezas',
    text: 'Para cada publicación aprobada, un guion pensado para grabar con el celular y una pieza gráfica descargable con la identidad de la marca.',
  },
  {
    tab: 'ads',
    title: 'Anuncios en Meta',
    text: 'Cada campaña del plan se puede convertir en un anuncio con presupuesto y objetivo. En esta versión las métricas son simuladas.',
  },
  {
    tab: 'dashboard',
    title: 'Las ventas, en un vistazo',
    text: 'Con un Excel de ventas arma el tablero y la IA saca tres hallazgos con una acción concreta cada uno.',
  },
]

const STORAGE_KEY = 'markesys-tour'

function readStored(): { step: number; open: boolean } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
function writeStored(v: { step: number; open: boolean }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
  } catch {
    // sin almacenamiento: el recorrido igual funciona en esta visita
  }
}

/** Crea una marca nueva y lleva a Marky para empezar con el negocio propio. */
export function useTryOwnBrand() {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const start = useCallback(async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/brands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      const brand = await res.json()
      if (!res.ok || !brand?.id) throw new Error(brand?.error)
      writeStored({ step: 0, open: false })
      router.push(`/marca/${brand.id}/copiloto`)
    } catch {
      toast.error('No pude crear tu marca. Probá de nuevo.')
      setCreating(false)
    }
  }, [router])
  return { start, creating }
}

export function DemoTour() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [step, setStep] = useState(0)
  const [open, setOpen] = useState(false)
  const { start, creating } = useTryOwnBrand()
  const final = step >= STEPS.length

  useEffect(() => {
    const stored = readStored()
    if (params.get('tour') === '1' || !stored) {
      setStep(0)
      setOpen(true)
    } else {
      setStep(Math.min(stored.step, STEPS.length))
      setOpen(stored.open)
    }
  }, [params])

  const go = (next: number, isOpen = true) => {
    setStep(next)
    setOpen(isOpen)
    writeStored({ step: next, open: isOpen })
    const tab = STEPS[next]?.tab
    if (tab && !pathname.endsWith(`/${tab}`)) router.push(`/marca/${DEMO_BRAND_ID}/${tab}`)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => go(Math.min(step, STEPS.length - 1))}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-medium shadow-lg hover:bg-accent"
      >
        <Compass className="size-4 text-primary" /> Recorrido guiado
      </button>
    )
  }

  const s = STEPS[step]
  return (
    <div
      role="dialog"
      aria-label="Recorrido guiado"
      className="fixed bottom-4 left-1/2 z-40 w-[min(92vw,440px)] -translate-x-1/2 rounded-2xl border bg-card p-5 shadow-xl"
    >
      <button
        type="button"
        onClick={() => go(step, false)}
        aria-label="Cerrar el recorrido"
        className="absolute top-3 right-3 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="size-4" />
      </button>

      {final ? (
        <>
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
            <Sparkles className="size-3.5" /> Tu turno
          </p>
          <h2 className="mt-1 text-lg font-semibold">Probalo con tu negocio</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Creá tu marca, cargá tu web o tu catálogo y Marky arma tu diagnóstico real. Esta marca de ejemplo queda acá para volver cuando quieras.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => go(STEPS.length - 1)}>
              <ArrowLeft /> Anterior
            </Button>
            <Button onClick={() => void start()} disabled={creating}>
              {creating && <Loader2 className="animate-spin" />} Empezar con mi negocio <ArrowRight />
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">
            Recorrido · {step + 1} de {STEPS.length}
          </p>
          <h2 className="mt-1 pr-6 text-lg font-semibold">{s.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
          <div className="mt-3 flex gap-1" aria-hidden>
            {STEPS.map((_, i) => (
              <span key={i} className={cn('h-1 flex-1 rounded-full', i <= step ? 'bg-primary' : 'bg-muted')} />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => go(step - 1)} disabled={step === 0}>
              <ArrowLeft /> Anterior
            </Button>
            <Button size="sm" onClick={() => go(step + 1)}>
              {step === STEPS.length - 1 ? 'Terminar' : 'Siguiente'} <ArrowRight />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
