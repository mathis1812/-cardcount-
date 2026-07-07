import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createSession, getTierConfig, runningCount } from '../../engine'
import { DrillScreen } from './DrillScreen'
import { useProfileStore } from './profileStore'
import { useAuthStore } from '../auth/authStore'
import { useServerProfileStore } from './serverProfileStore'
import * as profileApi from '../../lib/profileApi'

vi.mock('../../lib/profileApi')

const FIXED_NOW = 1_700_000_000_000

describe('DrillScreen', () => {
  beforeEach(() => {
    localStorage.clear()
    useProfileStore.setState({ xpTotal: 0, successesByTier: {} })
    useAuthStore.setState({ userId: null, status: 'anonymous' })
    useServerProfileStore.setState({ profile: null })
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('flux complet palier 1 : défilement, réponse juste, résultat, XP, rejeu', () => {
    render(<DrillScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la session' }))
    act(() => {
      vi.advanceTimersByTime(1200 * 20)
    })
    // le deck est déterministe : seed = Date.now() figé
    const expected = runningCount(
      createSession(getTierConfig(1), FIXED_NOW).cards,
    )
    const input = screen.getByLabelText('Quel est le running count final ?')
    fireEvent.change(input, { target: { value: String(expected) } })
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    expect(screen.getByText('Bien joué !')).toBeInTheDocument()
    expect(screen.getByText('+10 XP')).toBeInTheDocument()
    expect(screen.getByText('Rejeu pédagogique')).toBeInTheDocument()
    expect(useProfileStore.getState().xpTotal).toBe(10)
    expect(useProfileStore.getState().successesByTier).toEqual({ 1: 1 })
  })

  test('pendant le défilement : carte courante et progression affichées', () => {
    render(<DrillScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la session' }))
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(screen.getByText('Carte 1 / 20')).toBeInTheDocument()
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  test('nouvelle session après résultat revient à la sélection', () => {
    render(<DrillScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la session' }))
    act(() => {
      vi.advanceTimersByTime(1200 * 20)
    })
    fireEvent.change(
      screen.getByLabelText('Quel est le running count final ?'),
      {
        target: { value: '999' },
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle session' }))
    expect(
      screen.getByRole('button', { name: 'Lancer la session' }),
    ).toBeInTheDocument()
  })

  test('affiche niveau et XP totale du profil', () => {
    useProfileStore.setState({ xpTotal: 150 })
    render(<DrillScreen />)
    expect(screen.getByText('Niveau 2')).toBeInTheDocument()
    expect(screen.getByText('150 XP')).toBeInTheDocument()
  })
})

describe('DrillScreen — connecté', () => {
  beforeEach(() => {
    localStorage.clear()
    useProfileStore.setState({ xpTotal: 0, successesByTier: {} })
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
    useAuthStore.setState({ userId: 'u1', status: 'authenticated' })
    useServerProfileStore.setState({
      profile: { xpTotal: 200, level: 2, currentStreak: 4, longestStreak: 6 },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('affiche les stats serveur (niveau, XP, streak)', () => {
    render(<DrillScreen />)
    expect(screen.getByText('Niveau 2')).toBeInTheDocument()
    expect(screen.getByText('200 XP')).toBeInTheDocument()
    expect(screen.getByText('Série : 4 j')).toBeInTheDocument()
  })

  test('fin de session : appelle recordDrillSession et met à jour le profil serveur', async () => {
    vi.mocked(profileApi.recordDrillSession).mockResolvedValue({
      xpTotal: 210,
      level: 2,
      currentStreak: 5,
      longestStreak: 6,
    })
    render(<DrillScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la session' }))
    act(() => {
      vi.advanceTimersByTime(1200 * 20)
    })
    fireEvent.change(
      screen.getByLabelText('Quel est le running count final ?'),
      {
        target: { value: '999' },
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    await vi.waitFor(() =>
      expect(profileApi.recordDrillSession).toHaveBeenCalledWith(
        expect.objectContaining({ tier: 1, correct: false }),
      ),
    )
    // le store local n'est pas touché quand on est connecté
    expect(useProfileStore.getState().xpTotal).toBe(0)
  })
})
