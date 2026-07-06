import { describe, expect, test } from 'vitest'
import { runningCount } from './cards'
import {
  answerCheckpoint,
  answerFinal,
  checkpointPositionsFor,
  createSession,
  currentCard,
  revealNextCard,
  type SessionState,
} from './session'
import { getTierConfig } from './tiers'

const revealUpTo = (state: SessionState, position: number): SessionState => {
  let s = state
  while (s.position < position) {
    s = revealNextCard(s)
  }
  return s
}

describe('checkpointPositionsFor', () => {
  test('0 checkpoint : aucune position', () => {
    expect(checkpointPositionsFor(52, 0)).toEqual([])
  })

  test('2 checkpoints sur 52 cartes : positions aux tiers', () => {
    expect(checkpointPositionsFor(52, 2)).toEqual([17, 34])
  })

  test('3 checkpoints sur 104 cartes : positions aux quarts', () => {
    expect(checkpointPositionsFor(104, 3)).toEqual([26, 52, 78])
  })

  test('jamais de checkpoint sur la dernière carte', () => {
    for (const [cards, cps] of [
      [20, 3],
      [52, 2],
      [104, 3],
    ]) {
      for (const p of checkpointPositionsFor(cards, cps)) {
        expect(p).toBeGreaterThan(0)
        expect(p).toBeLessThan(cards)
      }
    }
  })
})

describe('createSession', () => {
  test('initialise une session au palier 1', () => {
    const session = createSession(getTierConfig(1), 42)
    expect(session.cards).toHaveLength(20)
    expect(session.position).toBe(0)
    expect(session.phase).toBe('running')
    expect(session.checkpointPositions).toEqual([])
    expect(session.checkpointAnswers).toEqual([])
  })

  test('même seed → mêmes cartes ; seeds différents → cartes différentes', () => {
    const config = getTierConfig(5)
    expect(createSession(config, 7).cards).toEqual(
      createSession(config, 7).cards,
    )
    expect(createSession(config, 7).cards).not.toEqual(
      createSession(config, 8).cards,
    )
  })

  test('rejette une config demandant plus de cartes que le sabot', () => {
    const bad = { ...getTierConfig(1), cardsCount: 53 }
    expect(() => createSession(bad, 1)).toThrow(/cartes/)
  })
})

describe('revealNextCard / currentCard', () => {
  test('révèle les cartes une à une et expose la carte courante', () => {
    const session = createSession(getTierConfig(1), 42)
    expect(() => currentCard(session)).toThrow(/carte/i)
    const after = revealNextCard(session)
    expect(after.position).toBe(1)
    expect(currentCard(after)).toEqual(after.cards[0])
    expect(session.position).toBe(0) // immutabilité : l'état d'origine est intact
  })

  test('passe en awaiting-final après la dernière carte', () => {
    const session = createSession(getTierConfig(1), 42)
    const done = revealUpTo(session, 20)
    expect(done.phase).toBe('awaiting-final')
    expect(() => revealNextCard(done)).toThrow(/phase/)
  })

  test('passe en awaiting-checkpoint aux positions de checkpoint (palier 6)', () => {
    const session = createSession(getTierConfig(6), 42) // 52 cartes, 2 checkpoints
    const atFirst = revealUpTo(session, 17)
    expect(atFirst.phase).toBe('awaiting-checkpoint')
    expect(() => revealNextCard(atFirst)).toThrow(/phase/)
  })
})

describe('answerCheckpoint', () => {
  test('enregistre la réponse et relance le défilement', () => {
    const session = createSession(getTierConfig(6), 42)
    const atCheckpoint = revealUpTo(session, 17)
    const expected = runningCount(atCheckpoint.cards.slice(0, 17))
    const after = answerCheckpoint(atCheckpoint, expected)
    expect(after.phase).toBe('running')
    expect(after.checkpointAnswers).toEqual([
      { position: 17, expected, given: expected, correct: true },
    ])
    expect(atCheckpoint.checkpointAnswers).toEqual([]) // immutabilité
  })

  test('réponse fausse enregistrée comme incorrecte', () => {
    const session = createSession(getTierConfig(6), 42)
    const atCheckpoint = revealUpTo(session, 17)
    const expected = runningCount(atCheckpoint.cards.slice(0, 17))
    const after = answerCheckpoint(atCheckpoint, expected + 3)
    expect(after.checkpointAnswers[0].correct).toBe(false)
  })

  test('rejette hors phase awaiting-checkpoint', () => {
    const session = createSession(getTierConfig(1), 42)
    expect(() => answerCheckpoint(session, 0)).toThrow(/phase/)
  })
})

describe('answerFinal', () => {
  test('session sans checkpoint : count juste → correct, accuracy 1', () => {
    const session = createSession(getTierConfig(1), 42)
    const done = revealUpTo(session, 20)
    const expected = runningCount(done.cards)
    const result = answerFinal(done, expected)
    expect(result).toEqual({
      correct: true,
      expectedCount: expected,
      givenCount: expected,
      accuracy: 1,
      cardsSeen: 20,
      checkpointAnswers: [],
    })
  })

  test('count faux → correct false, accuracy 0', () => {
    const session = createSession(getTierConfig(1), 42)
    const done = revealUpTo(session, 20)
    const expected = runningCount(done.cards)
    const result = answerFinal(done, expected + 1)
    expect(result.correct).toBe(false)
    expect(result.accuracy).toBe(0)
    expect(result.expectedCount).toBe(expected)
    expect(result.givenCount).toBe(expected + 1)
  })

  test('accuracy combine checkpoints et final (palier 6 complet)', () => {
    const config = getTierConfig(6) // 52 cartes, checkpoints à 17 et 34
    let s = createSession(config, 42)
    s = revealUpTo(s, 17)
    s = answerCheckpoint(s, runningCount(s.cards.slice(0, 17))) // juste
    s = revealUpTo(s, 34)
    s = answerCheckpoint(s, runningCount(s.cards.slice(0, 34)) + 5) // faux
    s = revealUpTo(s, 52)
    const result = answerFinal(s, runningCount(s.cards)) // juste
    expect(result.correct).toBe(true)
    expect(result.accuracy).toBeCloseTo(2 / 3)
    expect(result.checkpointAnswers).toHaveLength(2)
  })

  test('rejette hors phase awaiting-final', () => {
    const session = createSession(getTierConfig(1), 42)
    expect(() => answerFinal(session, 0)).toThrow(/phase/)
  })
})
