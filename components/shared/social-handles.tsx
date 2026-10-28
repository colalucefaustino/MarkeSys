'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBrand } from '@/components/brand/brand-context'

const NETS = [
  { type: 'instagram' as const, label: 'Instagram', placeholder: '@tu.usuario' },
  { type: 'tiktok' as const, label: 'TikTok', placeholder: '@tu.usuario' },
]

/**
 * Cargar o cambiar el Instagram y el TikTok del negocio. Se usa en Visibilidad (para
 * medirlos en el próximo diagnóstico) y en la Ficha.
 */
export function SocialHandles({ onSaved, note }: { onSaved?: () => void; note?: string }) {
  const { brandId, data, refresh } = useBrand()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<string | null>(null)

  async function save(type: 'instagram' | 'tiktok') {
    const handle = (drafts[type] ?? '').trim()
    if (!handle) return
    setSaving(type)
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brandId, type, handle }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'No pude guardar el usuario')
      toast.success(`Guardé tu ${type === 'instagram' ? 'Instagram' : 'TikTok'}: ${body.handle}`)
      setEditing((e) => ({ ...e, [type]: false }))
      setDrafts((d) => ({ ...d, [type]: '' }))
      await refresh()
      onSaved?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pude guardar el usuario')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-3">
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      {NETS.map((n) => {
        const current = data.channels.find((c) => c.type === n.type)?.handle_or_url
        const open = !current || editing[n.type]
        return (
          <div key={n.type} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-20 shrink-0 font-medium">{n.label}</span>
            {open ? (
              <form
                className="flex min-w-0 flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void save(n.type)
                }}
              >
                <input
                  value={drafts[n.type] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [n.type]: e.target.value }))}
                  placeholder={n.placeholder}
                  aria-label={`Usuario de ${n.label}`}
                  className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
                <Button type="submit" size="sm" className="h-9" disabled={!drafts[n.type]?.trim() || saving === n.type}>
                  {saving === n.type && <Loader2 className="animate-spin" />} Guardar
                </Button>
                {current && (
                  <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => setEditing((e) => ({ ...e, [n.type]: false }))}>
                    Cancelar
                  </Button>
                )}
              </form>
            ) : (
              <>
                <span className="text-muted-foreground">{current}</span>
                <Button size="sm" variant="ghost" onClick={() => setEditing((e) => ({ ...e, [n.type]: true }))}>
                  Cambiar
                </Button>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
