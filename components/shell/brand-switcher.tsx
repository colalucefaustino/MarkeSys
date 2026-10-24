'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useBrand } from '@/components/brand/brand-context'
import { isPlaceholderName } from '@/lib/brand-constants'

type BrandRow = { id: string; name: string }

export function BrandSwitcher() {
  const router = useRouter()
  const { brandId, data } = useBrand()
  const [brands, setBrands] = useState<BrandRow[]>([])
  const [creating, setCreating] = useState(false)
  const currentName = isPlaceholderName(data.brand.name) ? 'Marca nueva' : data.brand.name

  async function loadBrands(open: boolean) {
    if (!open) return
    const res = await fetch('/api/brands')
    if (res.ok) setBrands(await res.json())
  }

  async function createBrand() {
    setCreating(true)
    try {
      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'No pude crear la marca')
      router.push(`/marca/${body.id}/copiloto`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pude crear la marca')
    } finally {
      setCreating(false)
    }
  }

  return (
    <DropdownMenu onOpenChange={loadBrands}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="max-w-56 gap-1.5 px-2 font-semibold" aria-label="Cambiar de marca" />
        }
      >
        <span className="truncate">{currentName}</span>
        {creating ? <Loader2 className="animate-spin" /> : <ChevronsUpDown className="text-muted-foreground" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Tus marcas</DropdownMenuLabel>
        {brands.map((b) => (
          <DropdownMenuItem key={b.id} onClick={() => router.push(`/marca/${b.id}/copiloto`)}>
            <span className="flex-1 truncate">{isPlaceholderName(b.name) ? 'Marca nueva' : b.name}</span>
            {b.id === brandId && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={createBrand}>
          <Plus />
          Agregar marca
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
