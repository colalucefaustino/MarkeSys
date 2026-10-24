'use client'

import { useRef, useState } from 'react'
import { Loader2, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ACCEPT, uploadFile, type MediaKind } from '@/lib/upload'
import { useBrand } from '@/components/brand/brand-context'

const LABEL: Record<string, string> = {
  catalogo: 'catálogo',
  stock: 'stock',
  ventas: 'historial de ventas',
  branding: 'manual de marca',
  logo: 'logo',
  fotos: 'fotos',
  resenas: 'reseñas',
}

export function UploadCard({
  kind,
  reason,
  onDone,
  onSkip,
}: {
  kind: MediaKind
  reason: string
  onDone: (names: string[]) => void
  onSkip: () => void
}) {
  const { brandId, refresh } = useBrand()
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    try {
      const list = kind === 'fotos' ? Array.from(files) : [files[0]]
      for (const f of list) await uploadFile(brandId, kind, f)
      await refresh()
      onDone(list.map((f) => f.name))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pude subir el archivo')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-sm font-medium">Subí tu {LABEL[kind] ?? kind}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{reason}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => ref.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Paperclip />}
          {busy ? 'Subiendo…' : 'Elegir archivo'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onSkip} disabled={busy}>
          Ahora no
        </Button>
      </div>
      <input
        ref={ref}
        type="file"
        hidden
        multiple={kind === 'fotos'}
        accept={ACCEPT[kind]}
        onChange={(e) => {
          void onFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
