'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

interface Obj {
  description: string
  type: string
  deadline: string
  metric?: string
  target?: number
  proposed_by?: 'copiloto' | 'cliente'
}

/** Fecha por defecto para un objetivo nuevo: dentro de 30 días. */
const in30 = () => {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

export function ObjectivesCard({
  objectives,
  onConfirm,
}: {
  objectives: Obj[]
  onConfirm: (selected: Obj[]) => Promise<void> | void
}) {
  const [items, setItems] = useState<(Obj & { on: boolean })[]>(objectives.map((o) => ({ ...o, proposed_by: 'copiloto', on: true })))
  const [saving, setSaving] = useState(false)

  const selected = items.filter((i) => i.on && i.description.trim() && i.deadline)
  const addOwn = () => setItems((s) => [...s, { description: '', type: 'otro', deadline: in30(), proposed_by: 'cliente', on: true }])

  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-sm font-medium">Elegí los objetivos que te sirven</p>
      <p className="text-sm text-muted-foreground">Elegí todos los que quieras, ajustá el texto y la fecha, o sumá los tuyos.</p>
      <ul className="mt-3 flex flex-col gap-3">
        {items.map((o, i) => (
          <li key={i} className="flex gap-3 rounded-lg border p-2.5">
            <Checkbox
              checked={o.on}
              aria-label={`Elegir objetivo ${i + 1}`}
              onCheckedChange={(v) => setItems((s) => s.map((x, j) => (j === i ? { ...x, on: !!v } : x)))}
              className="mt-2"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Input
                value={o.description}
                placeholder="Ej.: vender 50 jeans antes de fin de mes"
                autoFocus={o.proposed_by === 'cliente' && !o.description}
                aria-label="Objetivo"
                onChange={(e) => setItems((s) => s.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Para el
                <Input
                  type="date"
                  value={o.deadline}
                  className="h-8 w-auto"
                  onChange={(e) => setItems((s) => s.map((x, j) => (j === i ? { ...x, deadline: e.target.value } : x)))}
                />
              </label>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={addOwn} disabled={saving}>
          Sumar otro objetivo
        </Button>
        <Button
          size="sm"
          disabled={!selected.length || saving}
          onClick={async () => {
            setSaving(true)
            try {
              await onConfirm(selected.map(({ on: _on, ...rest }) => ({ ...rest, description: rest.description.trim() })))
            } finally {
              setSaving(false)
            }
          }}
        >
          Confirmar {selected.length === 1 ? 'objetivo' : `${selected.length} objetivos`}
        </Button>
      </div>
    </div>
  )
}
