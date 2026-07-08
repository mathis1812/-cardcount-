import { describe, expect, test, vi } from 'vitest'
import { buildPortal } from '../stripe-portal'

describe('buildPortal', () => {
  test('crée une session de portail pour le customer et renvoie l’URL', async () => {
    const findCustomerId = vi.fn().mockResolvedValue('cus_1')
    const createPortal = vi.fn().mockResolvedValue({ url: 'https://portal/x' })
    const result = await buildPortal({
      userId: 'u1',
      siteUrl: 'https://site.test',
      findCustomerId,
      createPortal,
    })
    expect(createPortal).toHaveBeenCalledWith({
      customer: 'cus_1',
      returnUrl: 'https://site.test/',
    })
    expect(result).toEqual({ url: 'https://portal/x' })
  })

  test('sans customer : renvoie url null', async () => {
    const result = await buildPortal({
      userId: 'u1',
      siteUrl: 'https://site.test',
      findCustomerId: vi.fn().mockResolvedValue(null),
      createPortal: vi.fn(),
    })
    expect(result).toEqual({ url: null })
  })
})
