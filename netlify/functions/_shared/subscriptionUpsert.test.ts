import { describe, expect, test, vi } from 'vitest'
import { applyStripeEvent } from './subscriptionUpsert'

const deps = (already = false) => ({
  monthlyPriceId: 'price_m',
  yearlyPriceId: 'price_y',
  upsertSubscription: vi.fn().mockResolvedValue(undefined),
  markProcessed: vi.fn().mockResolvedValue(!already),
})

describe('applyStripeEvent', () => {
  test('event déjà traité : idempotent, aucun upsert', async () => {
    const d = deps(true)
    const result = await applyStripeEvent(
      {
        id: 'evt_1',
        type: 'customer.subscription.updated',
        data: { object: {} },
      },
      d,
    )
    expect(result.handled).toBe(false)
    expect(d.upsertSubscription).not.toHaveBeenCalled()
  })

  test('subscription.updated : mappe statut, plan et période', async () => {
    const d = deps()
    await applyStripeEvent(
      {
        id: 'evt_2',
        type: 'customer.subscription.updated',
        data: {
          object: {
            customer: 'cus_1',
            id: 'sub_1',
            status: 'active',
            current_period_end: 1_800_000_000,
            items: { data: [{ price: { id: 'price_y' } }] },
          },
        },
      },
      d,
    )
    expect(d.upsertSubscription).toHaveBeenCalledWith({
      stripe_customer_id: 'cus_1',
      stripe_sub_id: 'sub_1',
      status: 'active',
      plan: 'yearly',
      current_period_end: new Date(1_800_000_000 * 1000).toISOString(),
    })
  })

  test('subscription.deleted : statut canceled', async () => {
    const d = deps()
    await applyStripeEvent(
      {
        id: 'evt_3',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            customer: 'cus_1',
            id: 'sub_1',
            status: 'canceled',
            current_period_end: 1_800_000_000,
            items: { data: [{ price: { id: 'price_m' } }] },
          },
        },
      },
      d,
    )
    expect(d.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'canceled', plan: 'monthly' }),
    )
  })

  test('type non géré : marqué traité mais pas d’upsert', async () => {
    const d = deps()
    const result = await applyStripeEvent(
      { id: 'evt_4', type: 'invoice.paid', data: { object: {} } },
      d,
    )
    expect(result.handled).toBe(true)
    expect(d.upsertSubscription).not.toHaveBeenCalled()
  })
})
