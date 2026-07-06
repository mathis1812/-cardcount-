import { beforeEach, describe, expect, test } from 'vitest'
import { useProfileStore } from './profileStore'

describe('useProfileStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useProfileStore.setState({ xpTotal: 0, successesByTier: {} })
  })

  test('état initial : 0 XP, aucun palier réussi', () => {
    expect(useProfileStore.getState().xpTotal).toBe(0)
    expect(useProfileStore.getState().successesByTier).toEqual({})
  })

  test('recordSession ajoute l’XP et compte la réussite du palier', () => {
    useProfileStore
      .getState()
      .recordSession({ tier: 1, correct: true, xpEarned: 10 })
    useProfileStore
      .getState()
      .recordSession({ tier: 1, correct: true, xpEarned: 8 })
    const state = useProfileStore.getState()
    expect(state.xpTotal).toBe(18)
    expect(state.successesByTier).toEqual({ 1: 2 })
  })

  test('une session ratée donne l’XP mais ne compte pas comme réussite', () => {
    useProfileStore
      .getState()
      .recordSession({ tier: 2, correct: false, xpEarned: 5 })
    const state = useProfileStore.getState()
    expect(state.xpTotal).toBe(5)
    expect(state.successesByTier).toEqual({})
  })

  test('rejette une XP négative', () => {
    expect(() =>
      useProfileStore
        .getState()
        .recordSession({ tier: 1, correct: true, xpEarned: -1 }),
    ).toThrow(/xpEarned/)
  })

  test('persiste dans localStorage sous cardcount-profile', () => {
    useProfileStore
      .getState()
      .recordSession({ tier: 1, correct: true, xpEarned: 12 })
    const raw = localStorage.getItem('cardcount-profile')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string).state.xpTotal).toBe(12)
  })
})
