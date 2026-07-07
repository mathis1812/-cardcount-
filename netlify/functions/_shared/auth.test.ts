import { describe, expect, test, vi } from 'vitest'
import { userIdFromEvent } from './auth'

describe('userIdFromEvent', () => {
  test('extrait le Bearer token et renvoie l’userId vérifié', async () => {
    const verify = vi.fn().mockResolvedValue('u1')
    const id = await userIdFromEvent(
      { headers: { authorization: 'Bearer abc.def' } },
      verify,
    )
    expect(verify).toHaveBeenCalledWith('abc.def')
    expect(id).toBe('u1')
  })

  test('sans header Authorization : null sans appeler verify', async () => {
    const verify = vi.fn()
    expect(await userIdFromEvent({ headers: {} }, verify)).toBeNull()
    expect(verify).not.toHaveBeenCalled()
  })

  test('header mal formé : null', async () => {
    const verify = vi.fn()
    expect(
      await userIdFromEvent(
        { headers: { authorization: 'Basic xyz' } },
        verify,
      ),
    ).toBeNull()
  })
})
