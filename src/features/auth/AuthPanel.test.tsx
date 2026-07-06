import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import * as authClient from '../../lib/authClient'
import { useAuthStore } from './authStore'
import { AuthPanel } from './AuthPanel'

vi.mock('../../lib/authClient')

beforeEach(() => {
  useAuthStore.setState({ userId: null, status: 'anonymous' })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('AuthPanel — déconnecté', () => {
  test('inscription : appelle signUp puis onSignedUp', async () => {
    vi.mocked(authClient.signUp).mockResolvedValue({
      userId: 'u1',
      needsConfirmation: false,
    })
    const onSignedUp = vi.fn()
    render(<AuthPanel onSignedUp={onSignedUp} />)
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), {
      target: { value: 'a@b.fr' },
    })
    fireEvent.change(screen.getByLabelText('Mot de passe'), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }))
    await waitFor(() =>
      expect(authClient.signUp).toHaveBeenCalledWith('a@b.fr', 'secret123'),
    )
    await waitFor(() => expect(onSignedUp).toHaveBeenCalledWith('u1'))
  })

  test('bascule vers connexion : appelle signIn, pas onSignedUp', async () => {
    vi.mocked(authClient.signIn).mockResolvedValue({ userId: 'u2' })
    const onSignedUp = vi.fn()
    render(<AuthPanel onSignedUp={onSignedUp} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Se connecter' }))
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), {
      target: { value: 'a@b.fr' },
    })
    fireEvent.change(screen.getByLabelText('Mot de passe'), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Connexion' }))
    await waitFor(() =>
      expect(authClient.signIn).toHaveBeenCalledWith('a@b.fr', 'secret123'),
    )
    expect(onSignedUp).not.toHaveBeenCalled()
  })

  test('affiche un message d’erreur si signUp échoue', async () => {
    vi.mocked(authClient.signUp).mockRejectedValue(new Error('boom'))
    render(<AuthPanel />)
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), {
      target: { value: 'a@b.fr' },
    })
    fireEvent.change(screen.getByLabelText('Mot de passe'), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }))
    await waitFor(() =>
      expect(
        screen.getByText('Une erreur est survenue. Réessaie.'),
      ).toBeInTheDocument(),
    )
  })
})

describe('AuthPanel — connecté', () => {
  test('affiche l’état connecté et déconnecte', async () => {
    useAuthStore.setState({ userId: 'u1', status: 'authenticated' })
    vi.mocked(authClient.signOut).mockResolvedValue()
    render(<AuthPanel />)
    expect(screen.getByText('Connecté')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }))
    await waitFor(() => expect(authClient.signOut).toHaveBeenCalled())
  })
})
