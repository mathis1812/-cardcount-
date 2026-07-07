import { describe, expect, test, vi } from 'vitest'
import { buildCheckout } from './stripe-checkout'

const baseDeps = () => ({
  userId: 'u1',
  plan: 'monthly' as const,
  priceForPlan: { monthly: 'price_m', yearly: 'price_y' },
  siteUrl: 'https://site.test',
  findCustomerId: vi.fn().mockResolvedValue(null),
  createCustomer: vi.fn().mockResolvedValue('cus_new'),
  saveCustomer: vi.fn().mockResolvedValue(undefined),
  createSession: vi
    .fn()
    .mockResolvedValue({ url: 'https://checkout.stripe/x' }),
})

describe('buildCheckout', () => {
  test('crée un customer, l’enregistre et renvoie l’URL de session', async () => {
    const d = baseDeps()
    const result = await buildCheckout(d)
    expect(d.createCustomer).toHaveBeenCalledWith('u1')
    expect(d.saveCustomer).toHaveBeenCalledWith('u1', 'cus_new')
    expect(d.createSession).toHaveBeenCalledWith({
      customer: 'cus_new',
      priceId: 'price_m',
      userId: 'u1',
      successUrl: 'https://site.test/?checkout=success',
      cancelUrl: 'https://site.test/?checkout=cancel',
    })
    expect(result).toEqual({ url: 'https://checkout.stripe/x' })
  })

  test('réutilise le customer existant', async () => {
    const d = baseDeps()
    d.findCustomerId.mockResolvedValue('cus_old')
    await buildCheckout(d)
    expect(d.createCustomer).not.toHaveBeenCalled()
    expect(d.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_old', priceId: 'price_m' }),
    )
  })

  test('plan yearly sélectionne le bon prix', async () => {
    const d = { ...baseDeps(), plan: 'yearly' as const }
    await buildCheckout(d)
    expect(d.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ priceId: 'price_y' }),
    )
  })
})
