import Link from 'next/link'
import type { Metadata } from 'next'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { SearchDemo } from '@/components/landing/search-demo'
import { startOwnBrand } from '@/app/actions'

export const metadata: Metadata = {
  title: 'MarkeSys | Tu director de marketing con IA',
  description:
    'Te dice cómo te encuentran hoy en Google, Maps y los asistentes de IA, qué valoran tus clientes y hacia dónde llevar tu marca.',
}

const STEPS = [
  {
    title: 'Cómo te encuentran',
    text: 'Probamos búsquedas reales en Google, Google Maps y asistentes de IA. Ves en cuántas aparecés sin que te busquen por nombre y quién aparece en tu lugar.',
  },
  {
    title: 'Qué valoran tus clientes',
    text: 'Tus reseñas se comparan con lo que vos decís y con lo que mostrás en redes. Las diferencias son oportunidades.',
  },
  {
    title: 'Hacia dónde ir',
    text: 'Tres caminos posibles para tu marca, con la evidencia de cada uno, y la propuesta de valor y los mensajes del recomendado.',
  },
  {
    title: 'Un plan que podés sostener',
    text: 'Un calendario con el porqué de cada publicación, armado con tus productos, tu stock y las piezas por semana que podés hacer.',
  },
]

const PRINCIPLES = [
  {
    title: 'Te pregunta de a una cosa',
    text: 'Marky te guía con opciones para tocar y te explica para qué necesita cada dato. También le podés hablar.',
  },
  {
    title: 'No inventa nada',
    text: 'Cada dato dice de dónde sale: si lo confirmaste vos, si lo dedujo de tu web o si viene de una búsqueda.',
  },
  {
    title: 'Vos aprobás cada etapa',
    text: 'El diagnóstico, la estrategia y el plan no avanzan hasta que los revisás y das el visto bueno.',
  },
]

function TryOwnButton({ variant = 'outline' as 'outline' | 'secondary' }) {
  return (
    <form action={startOwnBrand}>
      <Button type="submit" size="lg" variant={variant} className="h-11 px-5 text-[15px]">
        Probar con mi negocio
      </Button>
    </form>
  )
}

export default function Landing() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Principal">
          <a href="#como-funciona" className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:block">
            Cómo funciona
          </a>
          <Link href="/app" prefetch={false} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            Entrar
          </Link>
          <Button nativeButton={false} render={<Link href="/demo" prefetch={false} />}>
            Ver la demo
          </Button>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-16 lg:pb-28">
          <div>
            <h1 className="max-w-[14ch] text-[2.6rem] leading-[1.02] font-semibold tracking-[-0.03em] text-balance sm:text-6xl lg:text-[4.25rem]">
              Tu director de marketing con IA.
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-muted-foreground">
              Te dice cómo te encuentran hoy en Google, Maps y los asistentes de IA, qué valoran tus clientes y hacia dónde llevar tu marca.
              Para comercios y pymes que no tienen equipo de marketing.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="h-11 px-5 text-[15px]" nativeButton={false} render={<Link href="/demo" prefetch={false} />}>
                Ver la demo
              </Button>
              <TryOwnButton />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">La demo es un recorrido de dos minutos por un caso completo. No hace falta registrarse.</p>
          </div>
          <SearchDemo />
        </section>

        <section className="border-y border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6"><p className="max-w-4xl text-2xl leading-snug font-medium tracking-[-0.01em] text-balance sm:text-[2rem]">
            La mayoría de los comercios no sabe si aparece cuando alguien busca lo que vende. MarkeSys lo mide con búsquedas reales y te dice qué hacer con eso.
          </p></div>
        </section>

        <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-6 px-4 py-20 sm:px-6 lg:py-28">
          <h2 className="max-w-xl text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">Cómo funciona</h2>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Cargás tu web o tu catálogo y Marky te acompaña en cuatro etapas. Cada una se apoya en la anterior.
          </p>
          <ol className="relative mt-12 grid gap-10 md:grid-cols-4 md:gap-8">
            <span aria-hidden className="absolute top-5 right-[12%] left-5 hidden h-px bg-border md:block" />
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative flex gap-4 md:block">
                <span className="relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-primary-foreground ring-8 ring-background">
                  {i + 1}
                </span>
                <div className="md:mt-5">
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:pb-28">
          <h2 className="max-w-xl text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">Pensado para quien no sabe de marketing</h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="border-l-2 border-primary pl-5">
                <h3 className="text-lg font-semibold">{p.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{p.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-foreground text-background">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6 md:flex-row md:items-end md:justify-between lg:py-20">
            <div className="max-w-xl">
              <h2 className="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">Recorré un caso completo</h2>
              <p className="mt-3 leading-relaxed text-background/75">
                Café Ombú, una cafetería de Rosario, ya tiene su diagnóstico, su estrategia y su plan. Miralos paso a paso y después probá con tu negocio.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" className="h-11 px-5 text-[15px]" nativeButton={false} render={<Link href="/demo" prefetch={false} />}>
                Ver la demo
              </Button>
              <TryOwnButton variant="secondary" />
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Logo />
        <p>Creado por Pedro Vidoret, Faustino Colaluce y Valentín Coronel.</p>
      </footer>
    </div>
  )
}
