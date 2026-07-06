import { describe, expect, test } from 'vitest'
import {
  computeXp,
  levelFromXp,
  PARTICIPATION_MULTIPLIER,
  STREAK_BONUS_MULTIPLIER,
  XP_SESSION_MAX,
  xpRequiredForLevel,
} from './xp'

describe('computeXp', () => {
  test('session parfaite sans streak : xpBase entier', () => {
    expect(
      computeXp({
        xpBase: 33,
        correct: true,
        accuracy: 1,
        streakActive: false,
      }),
    ).toBe(33)
  })

  test('session réussie avec checkpoints partiels : proportionnel à l’accuracy', () => {
    // 41 × (2/3) = 27.33 → 27
    expect(
      computeXp({
        xpBase: 41,
        correct: true,
        accuracy: 2 / 3,
        streakActive: false,
      }),
    ).toBe(27)
  })

  test('session ratée : XP de participation', () => {
    expect(
      computeXp({
        xpBase: 50,
        correct: false,
        accuracy: 0,
        streakActive: false,
      }),
    ).toBe(Math.round(50 * PARTICIPATION_MULTIPLIER))
  })

  test('streak actif : +10 %', () => {
    expect(
      computeXp({ xpBase: 30, correct: true, accuracy: 1, streakActive: true }),
    ).toBe(Math.round(30 * STREAK_BONUS_MULTIPLIER))
  })

  test('borné par XP_SESSION_MAX', () => {
    expect(
      computeXp({
        xpBase: 10000,
        correct: true,
        accuracy: 1,
        streakActive: true,
      }),
    ).toBe(XP_SESSION_MAX)
  })

  test('rejette une accuracy hors [0, 1] et un xpBase non positif', () => {
    expect(() =>
      computeXp({
        xpBase: 10,
        correct: true,
        accuracy: 1.2,
        streakActive: false,
      }),
    ).toThrow(/accuracy/)
    expect(() =>
      computeXp({
        xpBase: 10,
        correct: true,
        accuracy: -0.1,
        streakActive: false,
      }),
    ).toThrow(/accuracy/)
    expect(() =>
      computeXp({ xpBase: 0, correct: true, accuracy: 1, streakActive: false }),
    ).toThrow(/xpBase/)
  })
})

describe('xpRequiredForLevel', () => {
  test('niveau 1 acquis d’office', () => {
    expect(xpRequiredForLevel(1)).toBe(0)
  })

  test('suit round(100 × (n-1)^1.5)', () => {
    expect(xpRequiredForLevel(2)).toBe(100)
    expect(xpRequiredForLevel(3)).toBe(283)
    expect(xpRequiredForLevel(4)).toBe(520)
    expect(xpRequiredForLevel(11)).toBe(Math.round(100 * Math.pow(10, 1.5)))
  })

  test('rejette un niveau invalide', () => {
    expect(() => xpRequiredForLevel(0)).toThrow(/[Nn]iveau/)
    expect(() => xpRequiredForLevel(2.5)).toThrow(/[Nn]iveau/)
  })
})

describe('levelFromXp', () => {
  test.each<[number, number]>([
    [0, 1],
    [99, 1],
    [100, 2],
    [282, 2],
    [283, 3],
    [520, 4],
  ])('%i XP → niveau %i', (xp, level) => {
    expect(levelFromXp(xp)).toBe(level)
  })

  test('rejette une XP négative', () => {
    expect(() => levelFromXp(-1)).toThrow(/xpTotal/)
  })

  test('cohérence : levelFromXp(xpRequiredForLevel(n)) === n', () => {
    for (let n = 1; n <= 50; n++) {
      expect(levelFromXp(xpRequiredForLevel(n))).toBe(n)
    }
  })
})
