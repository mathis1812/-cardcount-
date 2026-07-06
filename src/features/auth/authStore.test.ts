import { beforeEach, describe, expect, test } from 'vitest'
import { useAuthStore } from './authStore'

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ userId: null, status: 'loading' })
  })

  test('état initial : loading', () => {
    expect(useAuthStore.getState().status).toBe('loading')
    expect(useAuthStore.getState().userId).toBeNull()
  })

  test('setUser avec un id passe à authenticated', () => {
    useAuthStore.getState().setUser('u1')
    expect(useAuthStore.getState()).toMatchObject({
      userId: 'u1',
      status: 'authenticated',
    })
  })

  test('setUser(null) passe à anonymous', () => {
    useAuthStore.getState().setUser('u1')
    useAuthStore.getState().setUser(null)
    expect(useAuthStore.getState()).toMatchObject({
      userId: null,
      status: 'anonymous',
    })
  })
})
