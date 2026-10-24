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
}

export function ObjectivesCard({
  objectives,
  onConfirm,
}: {
  objectives: Obj[]
  onConfirm: (selected: Obj[]) => void
}) {
  const [items, setItems] = useState(objectives.map((o) => ({ ...o, on: true })))

  const selected = items.filter((i) => i.on)

  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-sm font-medium">Elegí los objetivos que te sirven</p>
      <p className="text-sm text-muted-foreground">Podés ajustar el texto y la fecha antes de confirmar.</p>
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
      <Button
        size="sm"
        className="mt-3"
        disabled={!selected.length}
        onClick={() => onConfirm(selected.map(({ on: _on, ...rest }) => rest))}
      >
        Confirmar {selected.length === 1 ? 'objetivo' : 'objetivos'}
      </Button>
    </div>
  )
}
