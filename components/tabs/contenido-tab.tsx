'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { toPng } from 'html-to-image'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBrand } from '@/components/brand/brand-context'
import { PageHead, fmtDate, postJSON, useActions } from '@/components/tabs/shared'
import { FMT } from '@/components/tabs/calendario-tab'

function Piece({ item, brand, alt }: { item: any; brand: string; alt: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  async function download() {
    if (!ref.current) return
    const url = await toPng(ref.current, { pixelRatio: 3 })
    const a = document.createElement('a')
    a.href = url
    a.download = `${brand}-${item.id}.png`
    a.click()
  }
  return (
    <div className="space-y-2">
      <div
        ref={ref}
        className="relative flex aspect-square w-full max-w-[300px] flex-col justify-between overflow-hidden rounded-xl p-6"
        style={{ background: alt ? '#3B2A1F' : '#FBF1E4', color: alt ? '#FFFBF5' : '#3B2A1F' }}
      >
        <div className="absolute -right-10 -bottom-10 size-40 rounded-full" style={{ background: alt ? '#F28C38' : '#FFB36B' }} />
        <p className="relative text-xs font-semibold tracking-wider uppercase">{FMT[item.formato] ?? item.formato}</p>
        <p className="relative text-2xl leading-tight font-bold">{item.copy || item.idea}</p>
        <p className="relative text-lg font-bold">{brand}</p>
      </div>
      <Button size="sm" variant="outline" onClick={download}><Download /> Descargar PNG</Button>
    </div>
  )
}

export function ContenidoTab() {
  const { data } = useBrand()
  const { brandId, busy, run } = useActions()
  const [alt, setAlt] = useState<Record<string, boolean>>({})
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const items = ((data.calendario?.data as any)?.items ?? []).filter((i: any) => i.status === 'aprobada' && !String(i.formato).startsWith('accion')) as any[]
  const hasSkill = data.media.some((m) => m.kind === 'skill')

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <PageHead
        eyebrow="Herramientas · Contenido"
        title="Guiones y piezas"
        text="Para cada pieza aprobada te escribo el guion. Las imágenes usan tu identidad. Nada se publica sin que lo apruebes."
      />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div>
          <p className="text-sm font-semibold">Skill de edición de video</p>
          <p className="text-sm text-muted-foreground">{hasSkill ? 'Cargada: la uso para editar tus grabaciones.' : 'Subí tu SKILL.md en Medios y la uso para editar tus videos.'}</p>
        </div>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/marca/${brandId}/medios`} />}>Ir a Medios</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((it) => (
          <article key={it.id} className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-muted px-2 py-0.5">{fmtDate(it.fecha)}</span>
              <span className="rounded bg-muted px-2 py-0.5">{FMT[it.formato] ?? it.formato}</span>
              {it.promo_propuesta && <span className="rounded bg-warning/20 px-2 py-0.5">promo propuesta</span>}
            </div>
            <h3 className="font-semibold">{it.idea}</h3>
            {it.script && (
              <div className="space-y-1.5 rounded-lg bg-muted/60 p-3 text-sm">
                <p className="font-semibold">Guion · {it.script.duracion_seg} s</p>
                <p><b>Gancho:</b> {it.script.gancho}</p>
                <ol className="list-decimal space-y-1 pl-5">
                  {it.script.escenas.map((e: any, i: number) => (
                    <li key={i}><span className="tabular-nums text-muted-foreground">{e.tiempo}</span> {e.que_grabar}{e.texto_en_pantalla && <i> · “{e.texto_en_pantalla}”</i>}</li>
                  ))}
                </ol>
                <p><b>Cierre:</b> {it.script.cta}</p>
                <p><b>Texto para publicar:</b> {it.script.copy_publicacion}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={it.script ? 'outline' : 'default'} disabled={!!busy} onClick={() => run(it.id, () => postJSON('/api/content/script', { brandId, itemId: it.id }), 'Guion listo')}>
                {busy === it.id && <Loader2 className="animate-spin" />} {it.script ? 'Reescribir guion' : 'Escribir guion'}
              </Button>
              {!['reel', 'historia'].includes(it.formato) && (
                <Button size="sm" variant="outline" onClick={() => (shown[it.id] ? setAlt({ ...alt, [it.id]: !alt[it.id] }) : setShown({ ...shown, [it.id]: true }))}>
                  {shown[it.id] ? 'Otra versión' : 'Diseñar pieza'}
                </Button>
              )}
              {['reel', 'historia'].includes(it.formato) && (
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/marca/${brandId}/medios`} />}>Subir grabación</Button>
              )}
            </div>
            {shown[it.id] && <Piece item={it} brand={data.brand.name} alt={!!alt[it.id]} />}
          </article>
        ))}
      </div>
    </div>
  )
}
