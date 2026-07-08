import { describe, expect, test } from 'vitest'
import { mapStripeStatus, planFromPriceId } from './stripeStatus'

describe('mapStripeStatus', () => {
  test.each([
    ['active', 'active'],
    ['trialing', 'trialing'],
    ['past_due', 'past_due'],
    ['canceled', 'canceled'],
    ['incomplete', 'incomplete'],
    ['unpaid', 'past_due'],
    ['incomplete_expired', 'canceled'],
    ['n_importe_quoi', 'incomplete'],
  ])('%s → %s', (input, expected) => {
    expect(mapStripeStatus(input)).toBe(expected)
  })
})

describe('planFromPriceId', () => {
  test('reconnaît mensuel et annuel, sinon null', () => {
    expect(planFromPriceId('price_m', 'price_m', 'price_y')).toBe('monthly')
    expect(planFromPriceId('price_y', 'price_m', 'price_y')).toBe('yearly')
    expect(planFromPriceId('price_x', 'price_m', 'price_y')).toBeNull()
  })
})
