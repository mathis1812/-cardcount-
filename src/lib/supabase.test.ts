import { afterEach, describe, expect, test, vi } from 'vitest'

describe('getSupabase', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  test('lève une erreur explicite sans configuration', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const { getSupabase } = await import('./supabase')
    expect(() => getSupabase()).toThrow(/Supabase non configuré/)
  })

  test('retourne un client mémoïsé quand la configuration est présente', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://exemple-projet.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'cle-anon-de-test')
    const { getSupabase } = await import('./supabase')
    const first = getSupabase()
    const second = getSupabase()
    expect(first).toBeDefined()
    expect(second).toBe(first)
  })
})
