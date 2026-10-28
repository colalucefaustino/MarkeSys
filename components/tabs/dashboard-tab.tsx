'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { BarChart3, Loader2 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Empty, PageHead, money, postJSON, useActions } from '@/components/tabs/shared'

const fetcher = (u: string) => fetch(u).then((r) => r.json())
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function DashboardTab() {
  const { brandId, busy, run } = useActions()
  const { data, mutate } = useSWR(`/api/sales?brandId=${brandId}`, fetcher)
  const months = (data?.months ?? []) as any[]
  const products = (data?.products ?? []) as any[]
  // Lista de hallazgos (también acepta { hallazgos: [...] } por si quedó guardado así).
  const rawInsights = data?.insights as any
  const insights = (Array.isArray(rawInsights) ? rawInsights : Array.isArray(rawInsights?.hallazgos) ? rawInsights.hallazgos : null) as any[] | null

  if (!data) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>

  if (!months.length) {
    return (
      <Empty icon={<BarChart3 className="size-5" />} title="Todavía no tengo tus ventas" text="Subí en Medios un Excel o CSV con al menos una columna de fecha y otra de monto. Si tiene producto, mejor.">
        <div className="flex flex-wrap justify-center gap-2">
          <Button nativeButton={false} render={<Link href={`/marca/${brandId}/medios`} />}>Subir ventas</Button>
          <Button variant="outline" disabled={!!busy} onClick={() => run('demo', async () => { await postJSON('/api/sales', { brandId }); await mutate() })}>Usar ventas de ejemplo</Button>
        </div>
      </Empty>
    )
  }

  const last = months[months.length - 1], prev = months[months.length - 2]
  const growth = prev && prev.total ? Math.round(((last.total - prev.total) / prev.total) * 100) : null
  const tot = months.reduce((a, m) => a + Number(m.total), 0), orders = months.reduce((a, m) => a + Number(m.orders ?? 0), 0)
  const chart = months.map((m) => ({ mes: `${MES[Number(m.month.slice(5)) - 1]} ${m.month.slice(2, 4)}`, total: Number(m.total) }))
  const tmax = products[0]?.total ?? 1
  const demo = months.some((m) => m.is_demo)

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <PageHead eyebrow="Herramientas · Dashboard" title="Cómo vienen tus ventas" text="Tu evolución, qué se vende más y qué mejorar." />
      {demo && <p className="rounded-lg bg-warning/15 px-4 py-2 text-sm">Ventas de ejemplo. Subí las tuyas en Medios para ver tus números reales.</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Último mes', money(last.total)],
          ['Vs. mes anterior', growth == null ? '–' : `${growth > 0 ? '+' : ''}${growth}%`],
          ['Ticket promedio', orders ? money(tot / orders) : '–'],
          ['Más vendido', products[0]?.product ?? '–'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase">{k}</p>
            <p className="mt-1 truncate text-2xl font-bold tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 font-semibold">Ventas por mes</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={chart}>
              <CartesianGrid vertical={false} stroke="#F3E2CC" />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)} M` : `${Math.round(v / 1e3)} mil`)} />
              <Tooltip formatter={(v: any) => money(Number(v))} />
              <Bar dataKey="total" fill="#F28C38" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 font-semibold">Productos que más facturan</h2>
          {products.map((p) => (
            <div key={p.product} className="mt-2">
              <div className="flex justify-between gap-2 text-sm"><span className="truncate">{p.product}</span><span className="tabular-nums">{money(p.total)}</span></div>
              <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(p.total / tmax) * 100}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Qué mejorar</h2>
            <Button size="sm" disabled={!!busy} onClick={() => run('ins', async () => { await postJSON('/api/insights', { brandId }); await mutate() })}>
              {busy === 'ins' && <Loader2 className="animate-spin" />} {insights ? 'Analizar de nuevo' : 'Analizar con Marky'}
            </Button>
          </div>
          {insights ? insights.map((h: any) => (
            <div key={h.titulo}><p className="font-medium">{h.titulo}</p><p className="text-sm text-muted-foreground">{h.dato}</p><p className="text-sm"><b>Acción:</b> {h.accion}</p></div>
          )) : <p className="text-sm text-muted-foreground">Te marco 3 hallazgos basados solo en tus números.</p>}
        </div>
      </div>
    </div>
  )
}
