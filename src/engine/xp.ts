export const PARTICIPATION_MULTIPLIER = 0.1
export const STREAK_BONUS_MULTIPLIER = 1.1
export const XP_SESSION_MAX = 200

export interface XpInput {
  readonly xpBase: number
  readonly correct: boolean
  readonly accuracy: number
  readonly streakActive: boolean
}

export function computeXp(input: XpInput): number {
  if (input.accuracy < 0 || input.accuracy > 1) {
    throw new Error(`accuracy doit être dans [0, 1], reçu : ${input.accuracy}`)
  }
  if (input.xpBase <= 0) {
    throw new Error(`xpBase doit être > 0, reçu : ${input.xpBase}`)
  }
  const successMultiplier = input.correct
    ? input.accuracy
    : PARTICIPATION_MULTIPLIER
  const raw = input.xpBase * successMultiplier
  const withStreak = input.streakActive ? raw * STREAK_BONUS_MULTIPLIER : raw
  return Math.min(Math.round(withStreak), XP_SESSION_MAX)
}

// XP totale requise pour atteindre `level` ; le niveau 1 est acquis d'office.
// Formule spec : xp_requis(n) = 100 × n^1.5 où n est le niveau à franchir.
export function xpRequiredForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new Error(`Niveau invalide : ${level}`)
  }
  if (level === 1) {
    return 0
  }
  return Math.round(100 * Math.pow(level - 1, 1.5))
}

export function levelFromXp(xpTotal: number): number {
  if (xpTotal < 0) {
    throw new Error(`xpTotal doit être >= 0, reçu : ${xpTotal}`)
  }
  let level = 1
  while (xpRequiredForLevel(level + 1) <= xpTotal) {
    level += 1
  }
  return level
}
