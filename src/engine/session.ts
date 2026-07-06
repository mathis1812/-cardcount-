import { buildDecks, CARDS_PER_DECK, type Card } from './cards'
import { createRng, shuffle } from './shuffle'
import type { TierConfig } from './tiers'

export type SessionPhase = 'running' | 'awaiting-checkpoint' | 'awaiting-final'

export interface CheckpointAnswer {
  readonly position: number
  readonly expected: number
  readonly given: number
  readonly correct: boolean
}

export interface SessionState {
  readonly config: TierConfig
  readonly cards: readonly Card[]
  readonly checkpointPositions: readonly number[]
  readonly position: number
  readonly phase: SessionPhase
  readonly checkpointAnswers: readonly CheckpointAnswer[]
}

// Positions réparties uniformément, strictement avant la dernière carte.
export function checkpointPositionsFor(
  cardsCount: number,
  checkpoints: number,
): number[] {
  return Array.from({ length: checkpoints }, (_, k) =>
    Math.floor((cardsCount * (k + 1)) / (checkpoints + 1)),
  )
}

export function createSession(config: TierConfig, seed: number): SessionState {
  const shoeSize = config.deckCount * CARDS_PER_DECK
  if (config.cardsCount > shoeSize) {
    throw new Error(
      `Config invalide : ${config.cardsCount} cartes demandées pour un sabot de ${shoeSize}`,
    )
  }
  const shoe = shuffle(buildDecks(config.deckCount), createRng(seed))
  return {
    config,
    cards: shoe.slice(0, config.cardsCount),
    checkpointPositions: checkpointPositionsFor(
      config.cardsCount,
      config.checkpoints,
    ),
    position: 0,
    phase: 'running',
    checkpointAnswers: [],
  }
}

export function revealNextCard(state: SessionState): SessionState {
  if (state.phase !== 'running') {
    throw new Error(`Impossible de révéler une carte en phase ${state.phase}`)
  }
  const position = state.position + 1
  const phase: SessionPhase =
    position === state.cards.length
      ? 'awaiting-final'
      : state.checkpointPositions.includes(position)
        ? 'awaiting-checkpoint'
        : 'running'
  return { ...state, position, phase }
}

export function currentCard(state: SessionState): Card {
  if (state.position === 0) {
    throw new Error('Aucune carte révélée pour le moment')
  }
  return state.cards[state.position - 1]
}
