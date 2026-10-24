import { redirect } from 'next/navigation'
import { db } from '@/lib/supabase/server'
import { PLACEHOLDER_BRAND_NAME } from '@/lib/brand-constants'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const supabase = db()
  const { data } = await supabase
    .from('brands')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(1)

  let brandId = data?.[0]?.id as string | undefined
  if (!brandId) {
    const created = await supabase.from('brands').insert({ name: PLACEHOLDER_BRAND_NAME }).select('id').single()
    if (created.error) throw new Error(created.error.message)
    brandId = created.data.id as string
  }

  redirect(`/marca/${brandId}/copiloto`)
}
