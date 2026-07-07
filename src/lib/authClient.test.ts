import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  getCurrentUserId,
  onAuthChange,
  signIn,
  signOut,
  signUp,
} from './authClient'
import { getSupabase } from './supabase'

vi.mock('./supabase', () => ({ getSupabase: vi.fn() }))

const mockAuth = (auth: Record<string, unknown>) => {
  vi.mocked(getSupabase).mockReturnValue({ auth } as never)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('signUp', () => {
  test('retourne l’userId et needsConfirmation=false quand une session est ouverte', async () => {
    mockAuth({
      signUp: vi.fn().mockResolvedValue({
        data: { user: { id: 'u1' }, session: { access_token: 't' } },
        error: null,
      }),
    })
    await expect(signUp('a@b.fr', 'secret123')).resolves.toEqual({
      userId: 'u1',
      needsConfirmation: false,
    })
  })

  test('needsConfirmation=true quand la session est nulle', async () => {
    mockAuth({
      signUp: vi.fn().mockResolvedValue({
        data: { user: { id: 'u1' }, session: null },
        error: null,
      }),
    })
    await expect(signUp('a@b.fr', 'secret123')).resolves.toEqual({
      userId: 'u1',
      needsConfirmation: true,
    })
  })

  test('propage l’erreur serveur', async () => {
    mockAuth({
      signUp: vi
        .fn()
        .mockResolvedValue({ data: {}, error: { message: 'déjà pris' } }),
    })
    await expect(signUp('a@b.fr', 'x')).rejects.toThrow('déjà pris')
  })
})

describe('signIn', () => {
  test('retourne l’userId', async () => {
    mockAuth({
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: 'u2' } }, error: null }),
    })
    await expect(signIn('a@b.fr', 'secret123')).resolves.toEqual({
      userId: 'u2',
    })
  })

  test('propage l’erreur', async () => {
    mockAuth({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: {},
        error: { message: 'identifiants invalides' },
      }),
    })
    await expect(signIn('a@b.fr', 'x')).rejects.toThrow(
      'identifiants invalides',
    )
  })
})

describe('signOut', () => {
  test('résout sans erreur', async () => {
    mockAuth({ signOut: vi.fn().mockResolvedValue({ error: null }) })
    await expect(signOut()).resolves.toBeUndefined()
  })

  test('propage l’erreur', async () => {
    mockAuth({
      signOut: vi.fn().mockResolvedValue({ error: { message: 'échec' } }),
    })
    await expect(signOut()).rejects.toThrow('échec')
  })
})

describe('getCurrentUserId', () => {
  test('retourne l’id de session ou null', async () => {
    mockAuth({
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: { user: { id: 'u3' } } } }),
    })
    await expect(getCurrentUserId()).resolves.toBe('u3')
    mockAuth({
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    })
    await expect(getCurrentUserId()).resolves.toBeNull()
  })
})

describe('onAuthChange', () => {
  test('appelle le callback avec l’userId et retourne un désabonnement', () => {
    const unsubscribe = vi.fn()
    let handler: (event: string, session: unknown) => void = () => {}
    mockAuth({
      onAuthStateChange: vi.fn((cb) => {
        handler = cb
        return { data: { subscription: { unsubscribe } } }
      }),
    })
    const seen: (string | null)[] = []
    const off = onAuthChange((id) => seen.push(id))
    handler('SIGNED_IN', { user: { id: 'u4' } })
    handler('SIGNED_OUT', null)
    expect(seen).toEqual(['u4', null])
    off()
    expect(unsubscribe).toHaveBeenCalled()
  })
})
