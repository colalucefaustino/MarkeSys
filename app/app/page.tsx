import { redirect } from 'next/navigation'
import { db } from '@/lib/supabase/server'
import { DEMO_BRAND_ID } from '@/lib/demo/constants'

export const dynamic = 'force-dynamic'

/** "Entrar": lleva a la última marca con la que se trabajó. Si no hay ninguna, a la demo. */
export default async function EnterApp() {
  const { data } = await db()
    .from('brands')
    .select('id')
    .neq('id', DEMO_BRAND_ID)
    .order('updated_at', { ascending: false })
    .limit(1)
  const id = data?.[0]?.id as string | undefined
  redirect(id ? `/marca/${id}/copiloto` : '/demo')
}
