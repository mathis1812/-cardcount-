import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useProfileStore } from './profileStore'
import { TierPicker } from './TierPicker'

describe('TierPicker', () => {
  beforeEach(() => {
    localStorage.clear()
    useProfileStore.setState({ xpTotal: 0, successesByTier: {} })
  })

  test('sans historique : palier 1 actif, paliers 2+ verrouillés', () => {
    render(<TierPicker selected={1} onSelect={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Palier 1' })).toBeEnabled()
    expect(
      screen.getByRole('radio', { name: 'Palier 2 (verrouillé)' }),
    ).toBeDisabled()
    expect(screen.getAllByRole('radio')).toHaveLength(10)
  })

  test('3 réussites au palier 1 : palier 2 déverrouillé', () => {
    useProfileStore.setState({ successesByTier: { 1: 3 } })
    render(<TierPicker selected={1} onSelect={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Palier 2' })).toBeEnabled()
    expect(
      screen.getByRole('radio', { name: 'Palier 3 (verrouillé)' }),
    ).toBeDisabled()
  })

  test('la sélection remonte via onSelect', () => {
    useProfileStore.setState({ successesByTier: { 1: 3 } })
    const onSelect = vi.fn()
    render(<TierPicker selected={1} onSelect={onSelect} />)
    screen.getByRole('radio', { name: 'Palier 2' }).click()
    expect(onSelect).toHaveBeenCalledWith(2)
  })
})
