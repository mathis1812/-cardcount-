import { describe, expect, test } from 'vitest'
import {
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
