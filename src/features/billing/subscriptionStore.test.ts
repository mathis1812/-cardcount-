import { beforeEach, describe, expect, test } from 'vitest'
import { useSubscriptionStore } from './subscriptionStore'

describe('useSubscriptionStore', () => {
  beforeEach(() => {
    useSubscriptionStore.setState({ isPremium: false, plan: null })
  })

  test('état initial : non premium', () => {
    expect(useSubscriptionStore.getState().isPremium).toBe(false)
    expect(useSubscriptionStore.getState().plan).toBeNull()
  })

  test('setStatus met à jour premium et plan', () => {
    useSubscriptionStore
      .getState()
      .setStatus({ isPremium: true, plan: 'monthly' })
    expect(useSubscriptionStore.getState()).toMatchObject({
      isPremium: true,
      plan: 'monthly',
    })
  })
})
