import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import * as billingApi from '../../lib/billingApi'
import { PaywallPanel } from './PaywallPanel'

vi.mock('../../lib/billingApi')

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('PaywallPanel', () => {
  test('affiche les deux offres et le message de quota', () => {
    render(<PaywallPanel />)
    expect(
      screen.getByText('Tu as utilisé tes 3 sessions gratuites du jour.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mensuel' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Annuel (2 mois offerts)' }),
    ).toBeInTheDocument()
  })

  test('clic sur Mensuel : lance le checkout et redirige', async () => {
    vi.mocked(billingApi.startCheckout).mockResolvedValue('https://checkout/x')
    const assign = vi.fn()
    vi.stubGlobal('location', { assign } as unknown as Location)
    render(<PaywallPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Mensuel' }))
    await waitFor(() =>
      expect(billingApi.startCheckout).toHaveBeenCalledWith('monthly'),
    )
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('https://checkout/x'),
    )
  })

  test('erreur de checkout : message affiché', async () => {
    vi.mocked(billingApi.startCheckout).mockRejectedValue(new Error('boom'))
    render(<PaywallPanel />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Annuel (2 mois offerts)' }),
    )
    await waitFor(() =>
      expect(
        screen.getByText('Le paiement n’a pas pu démarrer. Réessaie.'),
      ).toBeInTheDocument(),
    )
  })
})
