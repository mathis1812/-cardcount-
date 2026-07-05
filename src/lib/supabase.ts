import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

// Instanciation paresseuse : l'app doit fonctionner sans Supabase configuré
// (Phase 0-2, essai anonyme). L'erreur ne survient qu'à l'usage effectif.
export function getSupabase(): SupabaseClient {
  if (client) {
    return client
  }

  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Supabase non configuré : renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY (voir .env.example)',
    )
  }

  client = createClient(url, anonKey)
  return client
}
