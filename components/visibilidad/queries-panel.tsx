'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Check, Loader2, Pencil, Play, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useBrand } from '@/components/brand/brand-context'

export interface QueryRow {
  id: string
  text: string
  kind: string | null
  approved: boolean
  origin: string | null
}

const KIND_LABEL: Record<string, string> = {
  generica: 'Genéricas',
  nicho: 'De nicho',
  atributo: 'Por atributo',
  marca: 'Con tu marca',
  cliente: 'Sumadas por vos',
}
const KIND_ORDER = ['generica', 'nicho', 'atributo', 'marca', 'cliente']

export function QueriesPanel({
  queries,
  onChange,
  onRun,
  onRegenerate,
  busy,
}: {
  queries: QueryRow[]
  onChange: () => Promise<unknown>
  onRun: () => void
  onRegenerate: () => void
  busy: boolean
}) {
  const { brandId } = useBrand()
  const [newText, setNewText] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [pending, setPending] = useState(false)

  async function call(input: RequestInfo, init: RequestInit) {
    setPending(true)
    try {
      const res = await fetch(input, init)
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'No pude guardar')
      await onChange()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Algo salió mal')
    } finally {
      setPending(false)
    }
  }

  const add = async () => {
    if (!newText.trim()) return
    await call('/api/visibility/queries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brandId, text: newText }),
    })
    setNewText('')
  }

  const groups = KIND_ORDER.map((k) => ({ kind: k, items: queries.filter((q) => (q.kind ?? 'cliente') === k) })).filter((g) => g.items.length)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 pb-28">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-balance">Esto es lo que vamos a buscar</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Son las búsquedas que haría un cliente tuyo. Las vamos a probar en asistentes de IA, Google y Google Maps. Podés sacar, editar o sumar las que quieras.
        </p>
      </header>

      {groups.map((g) => (
        <section key={g.kind} className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{KIND_LABEL[g.kind]}</h2>
          <ul className="divide-y">
            {g.items.map((q) => (
              <li key={q.id} className="flex items-center gap-2 px-4 py-2.5">
                {editId === q.id ? (
                  <>
                    <Input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      autoFocus
                      className="h-8"
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          if (e.nativeEvent.isComposing || e.keyCode === 229) return
                          await call('/api/visibility/queries', {
                            method: 'PATCH',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ id: q.id, text: editText }),
                          })
                          setEditId(null)
                        }
                        if (e.key === 'Escape') setEditId(null)
                      }}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0"
                      aria-label="Guardar"
                      disabled={pending}
                      onClick={async () => {
                        await call('/api/visibility/queries', {
                          method: 'PATCH',
                          headers: { 'content-type': 'application/json' },
                          body: JSON.stringify({ id: q.id, text: editText }),
                        })
                        setEditId(null)
                      }}
                    >
                      <Check />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label="Cancelar" onClick={() => setEditId(null)}>
                      <X />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-pretty">{q.text}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0"
                      aria-label={`Editar ${q.text}`}
                      onClick={() => {
                        setEditId(q.id)
                        setEditText(q.text)
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0"
                      aria-label={`Sacar ${q.text}`}
                      disabled={pending}
                      onClick={() => call(`/api/visibility/queries?id=${q.id}`, { method: 'DELETE' })}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="flex gap-2">
        <Input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Sumá otra búsqueda que haría un cliente"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              void add()
            }
          }}
        />
        <Button variant="outline" onClick={add} disabled={pending || newText.trim().length < 4}>
          <Plus /> Sumar
        </Button>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 px-4 py-3 backdrop-blur lg:left-[var(--sidebar-w,16rem)]">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={onRegenerate} disabled={busy}>
            <RefreshCw /> Generar otras
          </Button>
          <Button size="lg" onClick={onRun} disabled={busy || queries.length === 0}>
            {busy ? <Loader2 className="animate-spin" /> : <Play />}
            Ejecutar búsquedas ({queries.length})
          </Button>
        </div>
      </div>
    </div>
  )
}
