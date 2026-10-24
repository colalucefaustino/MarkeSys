'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useBrand } from '@/components/brand/brand-context'
import { PageHead, money } from '@/components/tabs/shared'

type Ad = { name: string; status: 'borrador' | 'activa' | 'pausada'; budget: number; obj: string }

export function AdsTab() {
  const { data } = useBrand()
  const camps = ((data.calendario?.data as any)?.campanas ?? []) as any[]
  const [ads, setAds] = useState<Ad[]>(() =>
    camps.map((c, i) => ({ name: c.nombre, status: 'borrador', budget: [3000, 5000, 4000, 2500][i % 4], obj: ['Ventas', 'Alcance', 'Tráfico', 'Mensajes'][i % 4] })),
  )
  const stats = (a: Ad, i: number) => {
    if (a.status !== 'activa') return { spend: 0, impr: 0, clicks: 0, buy: 0 }
    const spend = a.budget * 7, impr = Math.round(spend * (2.4 + i * 0.3)), clicks = Math.round(impr * (0.011 + i * 0.002))
    return { spend, impr, clicks, buy: Math.round(clicks * 0.03) }
  }
  const rows = ads.map((a, i) => ({ a, i, s: stats(a, i) }))
  const T = rows.reduce((t, r) => ({ spend: t.spend + r.s.spend, impr: t.impr + r.s.impr, clicks: t.clicks + r.s.clicks, buy: t.buy + r.s.buy }), { spend: 0, impr: 0, clicks: 0, buy: 0 })
  const set = (i: number, p: Partial<Ad>) => setAds(ads.map((a, j) => (j === i ? { ...a, ...p } : a)))
  const n = (x: number) => x.toLocaleString('es-AR')
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <PageHead
        eyebrow="Herramientas · Ads"
        title="Anuncios en Meta"
        text="Una campaña de anuncios por cada campaña del calendario. Activá, pausá y ajustá el presupuesto diario."
        right={<Button variant="outline" disabled title="Disponible cuando se conecte la Marketing API de Meta">Conectar cuenta de Meta</Button>}
      />
      <p className="rounded-lg bg-warning/15 px-4 py-2 text-sm">Conexión simulada: los números de los últimos 7 días son de ejemplo. En la versión con Meta conectado se gestionan en tu cuenta real.</p>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-xs text-muted-foreground uppercase">
            <tr>{['Campaña', 'Estado', 'Objetivo', 'Presupuesto/día', 'Gasto 7 d', 'Impresiones', 'CTR', 'CPC', 'Compras'].map((h) => <th key={h} className="border-b px-3 py-2 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(({ a, i, s }) => (
              <tr key={a.name} className="border-b">
                <td className="px-3 py-2 font-medium">{a.name}</td>
                <td className="px-3 py-2"><Button size="sm" variant={a.status === 'activa' ? 'default' : 'outline'} onClick={() => set(i, { status: a.status === 'activa' ? 'pausada' : 'activa' })}>{a.status === 'activa' ? 'Activa · pausar' : a.status === 'pausada' ? 'Pausada · activar' : 'Borrador · activar'}</Button></td>
                <td className="px-3 py-2">{a.obj}</td>
                <td className="px-3 py-2"><Input aria-label="Presupuesto diario" type="number" min={500} step={500} className="w-28" value={a.budget} onChange={(e) => set(i, { budget: Math.max(500, Number(e.target.value) || 500) })} /></td>
                <td className="px-3 py-2 tabular-nums">{money(s.spend)}</td>
                <td className="px-3 py-2 tabular-nums">{n(s.impr)}</td>
                <td className="px-3 py-2 tabular-nums">{s.impr ? ((s.clicks / s.impr) * 100).toFixed(2) + '%' : '–'}</td>
                <td className="px-3 py-2 tabular-nums">{s.clicks ? money(s.spend / s.clicks) : '–'}</td>
                <td className="px-3 py-2 tabular-nums">{s.buy}</td>
              </tr>
            ))}
            <tr className="font-semibold"><td className="px-3 py-2">Total</td><td /><td /><td /><td className="px-3 py-2 tabular-nums">{money(T.spend)}</td><td className="px-3 py-2 tabular-nums">{n(T.impr)}</td><td className="px-3 py-2 tabular-nums">{T.impr ? ((T.clicks / T.impr) * 100).toFixed(2) + '%' : '–'}</td><td className="px-3 py-2 tabular-nums">{T.clicks ? money(T.spend / T.clicks) : '–'}</td><td className="px-3 py-2 tabular-nums">{T.buy}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
