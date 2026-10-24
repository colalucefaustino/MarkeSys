import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

// Acceso solo desde el servidor con service role. RLS está activado sin políticas,
// así la anon key pública no puede leer nada.
// TODO: migrar a Supabase Auth + políticas por usuario cuando haya multiusuario real.
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
    if (!url || !key) throw new Error('Faltan las variables de Supabase')
    client = createClient(url, key, { auth: { persistSession: false } })
  }
  return client
}

export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}
