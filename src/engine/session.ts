import { buildDecks, CARDS_PER_DECK, runningCount, type Card } from './cards'
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

export interface SessionResult {
  readonly correct: boolean
  readonly expectedCount: number
  readonly givenCount: number
  readonly accuracy: number
  readonly cardsSeen: number
  readonly checkpointAnswers: readonly CheckpointAnswer[]
}

export function answerCheckpoint(
  state: SessionState,
  given: number,
): SessionState {
  if (state.phase !== 'awaiting-checkpoint') {
    throw new Error(`Réponse de checkpoint impossible en phase ${state.phase}`)
  }
  const expected = runningCount(state.cards.slice(0, state.position))
  const answer: CheckpointAnswer = {
    position: state.position,
    expected,
    given,
    correct: given === expected,
  }
  return {
    ...state,
    phase: 'running',
    checkpointAnswers: [...state.checkpointAnswers, answer],
  }
}

export function answerFinal(state: SessionState, given: number): SessionResult {
  if (state.phase !== 'awaiting-final') {
    throw new Error(`Réponse finale impossible en phase ${state.phase}`)
  }
  const expectedCount = runningCount(state.cards)
  const correct = given === expectedCount
  const totalAnswers = state.checkpointAnswers.length + 1
  const correctAnswers =
    state.checkpointAnswers.filter((a) => a.correct).length + (correct ? 1 : 0)
  return {
    correct,
    expectedCount,
    givenCount: given,
    accuracy: correctAnswers / totalAnswers,
    cardsSeen: state.cards.length,
    checkpointAnswers: state.checkpointAnswers,
  }
}
