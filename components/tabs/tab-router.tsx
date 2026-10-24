'use client'

import Link from 'next/link'
import { Lock, Hammer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBrand } from '@/components/brand/brand-context'
import { CopilotoTab } from '@/components/tabs/copiloto-tab'
import { MarcaTab } from '@/components/tabs/marca-tab'
import { MediosTab } from '@/components/tabs/medios-tab'
import { VisibilidadTab } from '@/components/tabs/visibilidad-tab'
import { PercepcionTab } from '@/components/tabs/percepcion-tab'
import { EstrategiaTab } from '@/components/tabs/estrategia-tab'
import { CalendarioTab } from '@/components/tabs/calendario-tab'
import { ContenidoTab } from '@/components/tabs/contenido-tab'
import { AdsTab } from '@/components/tabs/ads-tab'
import { DashboardTab } from '@/components/tabs/dashboard-tab'

type TabKey =
  | 'copiloto'
  | 'marca'
  | 'visibilidad'
  | 'percepcion'
  | 'estrategia'
  | 'calendario'
  | 'contenido'
  | 'medios'
  | 'ads'
  | 'dashboard'

const TITLES: Record<TabKey, string> = {
  copiloto: 'Copiloto',
  marca: 'Marca',
  visibilidad: 'Visibilidad digital',
  percepcion: 'Percepción',
  estrategia: 'Nicho y posicionamiento',
  calendario: 'Calendario',
  contenido: 'Contenido',
  medios: 'Medios',
  ads: 'Ads (Meta)',
  dashboard: 'Dashboard',
}

function Notice({ icon, title, text, brandId }: { icon: React.ReactNode; title: string; text: string; brandId: string }) {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon}</div>
      <h1 className="text-lg font-semibold text-balance">{title}</h1>
      <p className="text-sm text-muted-foreground text-pretty">{text}</p>
      <Button variant="outline" nativeButton={false} render={<Link href={`/marca/${brandId}/copiloto`} />}>
        Volver al Copiloto
      </Button>
    </div>
  )
}

export function TabRouter({ tab }: { tab: TabKey }) {
  const { brandId, data } = useBrand()
  const state = data.state.tabs[tab]

  if (state?.locked) {
    return (
      <Notice
        brandId={brandId}
        icon={<Lock className="size-5" />}
        title={`${TITLES[tab]} todavía está bloqueada`}
        text={state.reason ?? 'Completá la etapa anterior para desbloquearla.'}
      />
    )
  }

  switch (tab) {
    case 'copiloto':
      return <CopilotoTab />
    case 'marca':
      return <MarcaTab />
    case 'medios':
      return <MediosTab />
    case 'visibilidad':
      return <VisibilidadTab />
    case 'percepcion':
      return <PercepcionTab />
    case 'estrategia':
      return <EstrategiaTab />
    case 'calendario':
      return <CalendarioTab />
    case 'contenido':
      return <ContenidoTab />
    case 'ads':
      return <AdsTab />
    case 'dashboard':
      return <DashboardTab />
    default:
      return (
        <Notice
          brandId={brandId}
          icon={<Hammer className="size-5" />}
          title={`${TITLES[tab]} llega en la próxima entrega`}
          text="Esta sección se construye en las fases siguientes. Por ahora podés avanzar con Marca y Visibilidad digital."
        />
      )
  }
}
