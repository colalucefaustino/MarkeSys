'use client'

import { createClient as createSupabase, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/** Solo para subir archivos con URL firmada. Los datos pasan siempre por el servidor. */
export function createClient() {
  if (!client) {
    client = createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}
