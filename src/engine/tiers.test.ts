import { describe, expect, test } from 'vitest'
import { CARDS_PER_DECK } from './cards'
import {
  getTierConfig,
  highestUnlockedTier,
  SESSIONS_TO_UNLOCK_NEXT_TIER,
  TIERS,
} from './tiers'

describe('TIERS', () => {
  test('contient 10 paliers numérotés 1 à 10', () => {
    expect(TIERS).toHaveLength(10)
    expect(TIERS.map((t) => t.tier)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  test('palier 1 : 20 cartes à 1200 ms, 1 deck, sans checkpoint', () => {
    expect(getTierConfig(1)).toEqual({
      tier: 1,
      cardsCount: 20,
      speedMs: 1200,
      deckCount: 1,
      checkpoints: 0,
      xpBase: 10,
    })
  })

  test('palier 10 : 104 cartes à 400 ms, 2 decks, checkpoints', () => {
    const t10 = getTierConfig(10)
    expect(t10.cardsCount).toBe(104)
    expect(t10.speedMs).toBe(400)
    expect(t10.deckCount).toBe(2)
    expect(t10.checkpoints).toBeGreaterThanOrEqual(2)
  })

  test('invariants : difficulté croissante et configs jouables', () => {
    for (let i = 0; i < TIERS.length; i++) {
      const t = TIERS[i]
      expect(t.cardsCount).toBeLessThanOrEqual(t.deckCount * CARDS_PER_DECK)
      expect(t.xpBase).toBeGreaterThan(0)
      expect(t.checkpoints).toBeGreaterThanOrEqual(0)
      expect(t.checkpoints).toBeLessThanOrEqual(3)
      if (i > 0) {
        expect(t.speedMs).toBeLessThanOrEqual(TIERS[i - 1].speedMs)
        expect(t.cardsCount).toBeGreaterThanOrEqual(TIERS[i - 1].cardsCount)
        expect(t.xpBase).toBeGreaterThan(TIERS[i - 1].xpBase)
      }
    }
  })

  test.each([0, 11, 1.5])('getTierConfig rejette le palier %p', (tier) => {
    expect(() => getTierConfig(tier)).toThrow(/[Pp]alier/)
  })
})

describe('highestUnlockedTier', () => {
  test('sans historique, seul le palier 1 est débloqué', () => {
    expect(highestUnlockedTier({})).toBe(1)
  })

  test('3 réussites au palier 1 débloquent le palier 2', () => {
    expect(highestUnlockedTier({ 1: SESSIONS_TO_UNLOCK_NEXT_TIER })).toBe(2)
  })

  test('2 réussites ne suffisent pas', () => {
    expect(highestUnlockedTier({ 1: 2 })).toBe(1)
  })

  test('la chaîne doit être continue (pas de saut de palier)', () => {
    // 5 réussites au palier 2 mais palier 1 incomplet : rien au-delà de 1
    expect(highestUnlockedTier({ 2: 5 })).toBe(1)
    expect(highestUnlockedTier({ 1: 3, 2: 3, 3: 3 })).toBe(4)
  })

  test('plafonne au palier 10', () => {
    const all = Object.fromEntries(TIERS.map((t) => [t.tier, 10]))
    expect(highestUnlockedTier(all)).toBe(10)
  })
})
