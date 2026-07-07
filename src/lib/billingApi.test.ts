import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  fetchSubscriptionStatus,
  openBillingPortal,
  QuotaExceededError,
  startCheckout,
  startDrillSession,
} from './billingApi'
import { getSupabase } from './supabase'

vi.mock('./supabase', () => ({ getSupabase: vi.fn() }))

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('startDrillSession', () => {
  test('renvoie remaining', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { remaining: 2 }, error: null })
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never)
    await expect(startDrillSession()).resolves.toEqual({ remaining: 2 })
    expect(rpc).toHaveBeenCalledWith('start_drill_session', undefined)
  })

  test('quota_exceeded : lève QuotaExceededError', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'quota_exceeded' } })
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never)
    await expect(startDrillSession()).rejects.toBeInstanceOf(QuotaExceededError)
  })
})

describe('fetchSubscriptionStatus', () => {
  test('mappe is_premium et plan', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({
        data: { is_premium: true, plan: 'yearly' },
        error: null,
      })
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never)
    await expect(fetchSubscriptionStatus()).resolves.toEqual({
      isPremium: true,
      plan: 'yearly',
    })
  })
})

describe('startCheckout / openBillingPortal', () => {
  const stubSession = () =>
    vi.mocked(getSupabase).mockReturnValue({
      auth: {
        getSession: vi
          .fn()
          .mockResolvedValue({ data: { session: { access_token: 'tok' } } }),
      },
    } as never)

  test('startCheckout POSTe le plan avec le token et renvoie l’URL', async () => {
    stubSession()
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ url: 'https://co/x' }),
      })
    vi.stubGlobal('fetch', fetchMock)
    await expect(startCheckout('monthly')).resolves.toBe('https://co/x')
    expect(fetchMock).toHaveBeenCalledWith(
      '/.netlify/functions/stripe-checkout',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer tok' }),
        body: JSON.stringify({ plan: 'monthly' }),
      }),
    )
  })

  test('openBillingPortal renvoie l’URL', async () => {
    stubSession()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({ url: 'https://p/x' }),
        }),
    )
    await expect(openBillingPortal()).resolves.toBe('https://p/x')
  })
})
