export interface TierConfig {
  readonly tier: number
  readonly cardsCount: number
  readonly speedMs: number
  readonly deckCount: number
  readonly checkpoints: number
  readonly xpBase: number
}

export const TIERS: readonly TierConfig[] = [
  {
    tier: 1,
    cardsCount: 20,
    speedMs: 1200,
    deckCount: 1,
    checkpoints: 0,
    xpBase: 10,
  },
  {
    tier: 2,
    cardsCount: 26,
    speedMs: 1100,
    deckCount: 1,
    checkpoints: 0,
    xpBase: 15,
  },
  {
    tier: 3,
    cardsCount: 32,
    speedMs: 1000,
    deckCount: 1,
    checkpoints: 0,
    xpBase: 20,
  },
  {
    tier: 4,
    cardsCount: 40,
    speedMs: 900,
    deckCount: 1,
    checkpoints: 0,
    xpBase: 26,
  },
  {
    tier: 5,
    cardsCount: 52,
    speedMs: 800,
    deckCount: 1,
    checkpoints: 0,
    xpBase: 33,
  },
  {
    tier: 6,
    cardsCount: 52,
    speedMs: 700,
    deckCount: 1,
    checkpoints: 2,
    xpBase: 41,
  },
  {
    tier: 7,
    cardsCount: 64,
    speedMs: 600,
    deckCount: 2,
    checkpoints: 2,
    xpBase: 50,
  },
  {
    tier: 8,
    cardsCount: 78,
    speedMs: 500,
    deckCount: 2,
    checkpoints: 2,
    xpBase: 60,
  },
  {
    tier: 9,
    cardsCount: 90,
    speedMs: 450,
    deckCount: 2,
    checkpoints: 3,
    xpBase: 71,
  },
  {
    tier: 10,
    cardsCount: 104,
    speedMs: 400,
    deckCount: 2,
    checkpoints: 3,
    xpBase: 83,
  },
]

export const SESSIONS_TO_UNLOCK_NEXT_TIER = 3

export function getTierConfig(tier: number): TierConfig {
  const config = TIERS.find((t) => t.tier === tier)
  if (!config) {
    throw new Error(`Palier inconnu : ${tier}`)
  }
  return config
}

// Déblocage en chaîne : le palier n+1 s'ouvre après SESSIONS_TO_UNLOCK_NEXT_TIER
// sessions réussies au palier n. Le palier 1 est toujours débloqué.
export function highestUnlockedTier(
  successesByTier: Readonly<Record<number, number>>,
): number {
  let unlocked = 1
  while (
    unlocked < TIERS.length &&
    (successesByTier[unlocked] ?? 0) >= SESSIONS_TO_UNLOCK_NEXT_TIER
  ) {
    unlocked += 1
  }
  return unlocked
}
