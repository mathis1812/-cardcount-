import { afterEach, describe, expect, test, vi } from 'vitest'
import * as authClient from '../../lib/authClient'
import { useAuthStore } from './authStore'
import { initAuth } from './initAuth'

vi.mock('../../lib/authClient')

afterEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ userId: null, status: 'loading' })
})

describe('initAuth', () => {
  test('hydrate le store avec la session courante et s’abonne', async () => {
    vi.mocked(authClient.getCurrentUserId).mockResolvedValue('u9')
    let changeHandler: (id: string | null) => void = () => {}
    const off = vi.fn()
    vi.mocked(authClient.onAuthChange).mockImplementation((cb) => {
      changeHandler = cb
      return off
    })

    const unsubscribe = await initAuth()
    expect(useAuthStore.getState()).toMatchObject({
      userId: 'u9',
      status: 'authenticated',
    })

    changeHandler(null)
    expect(useAuthStore.getState()).toMatchObject({
      userId: null,
      status: 'anonymous',
    })

    unsubscribe()
    expect(off).toHaveBeenCalled()
  })

  test('sans session : anonymous', async () => {
    vi.mocked(authClient.getCurrentUserId).mockResolvedValue(null)
    vi.mocked(authClient.onAuthChange).mockReturnValue(vi.fn())
    await initAuth()
    expect(useAuthStore.getState().status).toBe('anonymous')
  })
})
