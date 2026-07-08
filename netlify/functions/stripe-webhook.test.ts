import { describe, expect, test, vi } from 'vitest'
import { processWebhook } from './stripe-webhook'

const deps = (verified = true) => ({
  verifySignature: vi.fn(() => {
    if (!verified) {
      throw new Error('bad signature')
    }
    return {
      id: 'evt_1',
      type: 'customer.subscription.updated',
      data: { object: {} },
    }
  }),
  apply: vi.fn().mockResolvedValue({ handled: true }),
})

describe('processWebhook', () => {
  test('signature valide : applique l’event, renvoie 200', async () => {
    const d = deps()
    const res = await processWebhook('raw', 'sig', d)
    expect(d.apply).toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
  })

  test('signature invalide : 400, pas d’application', async () => {
    const d = deps(false)
    const res = await processWebhook('raw', 'sig', d)
    expect(res.statusCode).toBe(400)
    expect(d.apply).not.toHaveBeenCalled()
  })
})
