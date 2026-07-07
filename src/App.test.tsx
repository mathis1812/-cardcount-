import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App'
import { useAuthStore } from './features/auth/authStore'

vi.mock('./lib/profileApi')
vi.mock('./lib/authClient')

describe('App', () => {
  beforeEach(() => {
    useAuthStore.setState({ userId: null, status: 'anonymous' })
  })

  test('affiche le titre, l’auth et l’écran de drill', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'CardCount' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Créer mon compte' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Lancer la session' }),
    ).toBeInTheDocument()
  })
})
