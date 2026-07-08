import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let admin: SupabaseClient | null = null

// Client service_role : contourne la RLS. Uniquement côté serveur (Functions).
export function getAdminClient(): SupabaseClient {
  if (admin) {
    return admin
  }
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants')
  }
  admin = createClient(url, key, { auth: { persistSession: false } })
  return admin
}
