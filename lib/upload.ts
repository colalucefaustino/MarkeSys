'use client'

import { createClient } from '@/lib/supabase/client'

export type MediaKind =
  | 'catalogo'
  | 'stock'
  | 'ventas'
  | 'branding'
  | 'logo'
  | 'fotos'
  | 'videos'
  | 'grabacion'
  | 'skill'
  | 'resenas'
  | 'otro'

export const ACCEPT: Record<string, string> = {
  catalogo: '.xlsx,.xls,.csv,.pdf',
  stock: '.xlsx,.xls,.csv,.pdf',
  branding: '.pdf,.png,.jpg,.jpeg',
  logo: '.png,.jpg,.jpeg,.svg',
  fotos: 'image/*',
  ventas: '.xlsx,.xls,.csv',
  resenas: '.txt,.csv',
  videos: 'video/*',
  grabacion: 'video/*,audio/*',
  skill: '.md,.txt',
  otro: '*',
}

export async function uploadFile(brandId: string, kind: MediaKind, file: File, planItemId?: string) {
  const signRes = await fetch('/api/media/sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ brandId, filename: file.name }),
  })
  if (!signRes.ok) throw new Error((await signRes.json().catch(() => null))?.error ?? 'No pude preparar la subida')
  const { path, token } = (await signRes.json()) as { path: string; token: string }

  const up = await createClient().storage.from('brand-files').uploadToSignedUrl(path, token, file, {
    contentType: file.type || undefined,
  })
  if (up.error) throw new Error('No pude subir el archivo')

  const res = await fetch('/api/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ brandId, kind, path, name: file.name, mime: file.type, size: file.size, planItemId }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'No pude registrar el archivo')
  return (await res.json()).media as { id: string }
}
