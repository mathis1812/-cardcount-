import { describe, expect, test } from 'vitest'
import {
  buildDecks,
  CARDS_PER_DECK,
  hiLoValue,
  runningCount,
  type Card,
  type Rank,
} from './cards'

const card = (rank: Rank): Card => ({ rank, suit: 'spades' })

describe('hiLoValue', () => {
  test.each<[Rank, number]>([
    ['2', 1],
    ['3', 1],
    ['4', 1],
    ['5', 1],
    ['6', 1],
    ['7', 0],
    ['8', 0],
    ['9', 0],
    ['10', -1],
    ['J', -1],
    ['Q', -1],
    ['K', -1],
    ['A', -1],
  ])('rank %s vaut %i', (rank, expected) => {
    expect(hiLoValue(card(rank))).toBe(expected)
  })
})

describe('buildDecks', () => {
  test('un deck contient 52 cartes uniques', () => {
    const deck = buildDecks(1)
    expect(deck).toHaveLength(CARDS_PER_DECK)
    const keys = new Set(deck.map((c) => `${c.rank}-${c.suit}`))
    expect(keys.size).toBe(CARDS_PER_DECK)
  })

  test('deux decks contiennent 104 cartes (chaque carte en double)', () => {
    const deck = buildDecks(2)
    expect(deck).toHaveLength(104)
    const counts = new Map<string, number>()
    for (const c of deck) {
      const key = `${c.rank}-${c.suit}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    expect([...counts.values()].every((n) => n === 2)).toBe(true)
  })

  test.each([0, -1, 1.5])('rejette deckCount invalide %p', (deckCount) => {
    expect(() => buildDecks(deckCount)).toThrow(/deckCount/)
  })
})

describe('runningCount', () => {
  test('liste vide vaut 0', () => {
    expect(runningCount([])).toBe(0)
  })

  test('additionne les valeurs Hi-Lo', () => {
    // +1 (2) +1 (6) +0 (8) -1 (K) -1 (A) = 0 ; puis +1 (5) = 1
    expect(
      runningCount([
        card('2'),
        card('6'),
        card('8'),
        card('K'),
        card('A'),
        card('5'),
      ]),
    ).toBe(1)
  })

  test('propriété : le count d’un deck complet vaut 0', () => {
    expect(runningCount(buildDecks(1))).toBe(0)
    expect(runningCount(buildDecks(2))).toBe(0)
    expect(runningCount(buildDecks(6))).toBe(0)
  })
})
