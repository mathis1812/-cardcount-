export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const
export const RANKS = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
] as const

export type Suit = (typeof SUITS)[number]
export type Rank = (typeof RANKS)[number]

export interface Card {
  readonly rank: Rank
  readonly suit: Suit
}

export const CARDS_PER_DECK = SUITS.length * RANKS.length

const LOW_RANKS: readonly Rank[] = ['2', '3', '4', '5', '6']
const NEUTRAL_RANKS: readonly Rank[] = ['7', '8', '9']

export function hiLoValue(card: Card): -1 | 0 | 1 {
  if (LOW_RANKS.includes(card.rank)) {
    return 1
  }
  if (NEUTRAL_RANKS.includes(card.rank)) {
    return 0
  }
  return -1
}

export function buildDecks(deckCount: number): Card[] {
  if (!Number.isInteger(deckCount) || deckCount < 1) {
    throw new Error(`deckCount doit être un entier >= 1, reçu : ${deckCount}`)
  }
  return Array.from({ length: deckCount }, () =>
    SUITS.flatMap((suit) => RANKS.map((rank): Card => ({ rank, suit }))),
  ).flat()
}

export function runningCount(cards: readonly Card[]): number {
  return cards.reduce((count, card) => count + hiLoValue(card), 0)
}
