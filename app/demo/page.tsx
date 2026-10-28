import { redirect } from 'next/navigation'
import { ensureDemoBrand } from '@/lib/demo/seed'
import { DEMO_BRAND_ID } from '@/lib/demo/constants'

export const dynamic = 'force-dynamic'

/** Entrada al recorrido guiado: asegura la marca de ejemplo y abre Marky con el tour. */
export default async function DemoPage() {
  await ensureDemoBrand()
  redirect(`/marca/${DEMO_BRAND_ID}/copiloto?tour=1`)
}
