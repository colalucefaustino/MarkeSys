'use server'

import { redirect } from 'next/navigation'
import { db } from '@/lib/supabase/server'
import { PLACEHOLDER_BRAND_NAME } from '@/lib/brand-constants'

/** "Probar con mi negocio" desde la landing: crea una marca nueva y abre Marky. */
export async function startOwnBrand() {
  const { data, error } = await db().from('brands').insert({ name: PLACEHOLDER_BRAND_NAME }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'No pude crear la marca')
  redirect(`/marca/${data.id}/copiloto`)
}
