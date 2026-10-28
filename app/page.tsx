import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// La portada es el recorrido guiado sobre la marca de ejemplo. Desde ahí se puede
// crear una marca propia, y el selector de marcas de la barra superior lleva a las demás.
export default function HomePage() {
  redirect('/demo')
}
