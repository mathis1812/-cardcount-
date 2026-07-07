# Phase 1 — Drill Engine Hi-Lo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Moteur de drill Hi-Lo en TypeScript pur (deck, valeurs Hi-Lo, running count, paliers, XP/niveaux, machine à états de session avec checkpoints), 100 % testé, zéro dépendance UI/réseau.

**Architecture:** Modules purs et immuables sous `src/engine/` : `cards.ts` (cartes + valeurs Hi-Lo + running count), `shuffle.ts` (RNG seedé + Fisher-Yates), `tiers.ts` (10 paliers fixes + déblocage), `xp.ts` (XP + niveaux), `session.ts` (machine à états d'une session de drill). Le timing (`speedMs`) est une donnée de config consommée par l'UI en Phase 2 — l'engine est agnostique au temps.

**Tech Stack:** TypeScript strict, Vitest (tests colocalisés `src/engine/*.test.ts`), couverture v8.

## Global Constraints

- Immutabilité stricte : aucune fonction ne mute ses arguments ; retours = nouveaux objets (`readonly` partout dans les types publics).
- Zéro dépendance UI/réseau dans `src/engine/` (spec §3 « Principes structurants »).
- Déterminisme : tout aléatoire passe par un RNG seedé injecté (spec §7).
- Validation des entrées aux frontières : `throw new Error(...)` sur usage invalide. Ces messages d'erreur sont destinés au développeur (violations d'invariants), jamais affichés à l'utilisateur — ils ne passent donc pas par i18n.
- Style projet : Prettier `semi: false, singleQuote: true` ; conventional commits ; un commit par tâche.
- Vérification par tâche : `npm run lint && npm run typecheck && npm run test` avant chaque commit.
- Paramètres spec §5 : palier 1 = 20 cartes / 1200 ms ; palier 10 = 104 cartes / 2 decks / 400 ms / checkpoints ; déblocage = 3 sessions réussies du palier courant ; `xp = base_palier × multiplicateur_réussite`, +10 % si streak actif, session ratée = petite XP de participation, bornes max ; `xp_requis(n) = 100 × n^1.5` (arrondi) ; propriété : count final d'un deck complet = 0.

---

### Task 1: Cartes, valeurs Hi-Lo, running count

**Files:**
- Create: `src/engine/cards.ts`
- Test: `src/engine/cards.test.ts`

**Interfaces:**
- Consumes: rien (module feuille).
- Produces: `type Suit`, `type Rank`, `interface Card { readonly rank: Rank; readonly suit: Suit }`, `const CARDS_PER_DECK = 52`, `hiLoValue(card: Card): -1 | 0 | 1`, `buildDecks(deckCount: number): Card[]`, `runningCount(cards: readonly Card[]): number`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/cards.test.ts
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
    expect(runningCount([card('2'), card('6'), card('8'), card('K'), card('A'), card('5')])).toBe(1)
  })

  test('propriété : le count d’un deck complet vaut 0', () => {
    expect(runningCount(buildDecks(1))).toBe(0)
    expect(runningCount(buildDecks(2))).toBe(0)
    expect(runningCount(buildDecks(6))).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/cards.test.ts`
Expected: FAIL — `Failed to resolve import "./cards"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/engine/cards.ts
export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/cards.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify quality gates and commit**

Run: `npm run lint && npm run typecheck && npm run format && npm run test`
Expected: tout vert.

```bash
git add src/engine/cards.ts src/engine/cards.test.ts
git commit -m "feat(engine): cartes, valeurs Hi-Lo, running count"
```

---

### Task 2: RNG seedé et mélange déterministe

**Files:**
- Create: `src/engine/shuffle.ts`
- Test: `src/engine/shuffle.test.ts`

**Interfaces:**
- Consumes: `buildDecks`, `runningCount` de `./cards` (tests seulement).
- Produces: `createRng(seed: number): () => number` (flottants dans [0, 1)), `shuffle<T>(items: readonly T[], rng: () => number): T[]` (copie mélangée, l'original n'est pas muté).

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/shuffle.test.ts
import { describe, expect, test } from 'vitest'
import { buildDecks, runningCount } from './cards'
import { createRng, shuffle } from './shuffle'

describe('createRng', () => {
  test('même seed produit la même séquence', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  test('seeds différents produisent des séquences différentes', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(Array.from({ length: 5 }, () => a())).not.toEqual(
      Array.from({ length: 5 }, () => b()),
    )
  })

  test('les valeurs sont dans [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('shuffle', () => {
  test('ne mute pas le tableau source', () => {
    const source = [1, 2, 3, 4, 5]
    const copy = [...source]
    shuffle(source, createRng(1))
    expect(source).toEqual(copy)
  })

  test('retourne une permutation (mêmes éléments, même taille)', () => {
    const source = Array.from({ length: 52 }, (_, i) => i)
    const result = shuffle(source, createRng(3))
    expect(result).toHaveLength(52)
    expect([...result].sort((a, b) => a - b)).toEqual(source)
  })

  test('même seed produit le même ordre, seeds différents des ordres différents', () => {
    const source = Array.from({ length: 20 }, (_, i) => i)
    expect(shuffle(source, createRng(9))).toEqual(shuffle(source, createRng(9)))
    expect(shuffle(source, createRng(9))).not.toEqual(shuffle(source, createRng(10)))
  })

  test('propriété : un deck complet mélangé garde un count de 0', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      expect(runningCount(shuffle(buildDecks(2), createRng(seed)))).toBe(0)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/shuffle.test.ts`
Expected: FAIL — `Failed to resolve import "./shuffle"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/engine/shuffle.ts
// RNG mulberry32 : déterministe, rapide, suffisant pour un mélange de cartes
// (aucun usage cryptographique).
export function createRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Fisher-Yates sur une copie : le tableau source n'est jamais muté.
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const swap = result[i]
    result[i] = result[j]
    result[j] = swap
  }
  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/shuffle.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify quality gates and commit**

Run: `npm run lint && npm run typecheck && npm run format && npm run test`
Expected: tout vert.

```bash
git add src/engine/shuffle.ts src/engine/shuffle.test.ts
git commit -m "feat(engine): RNG seedé (mulberry32) et mélange Fisher-Yates immuable"
```

---

### Task 3: Paliers de difficulté et déblocage

**Files:**
- Create: `src/engine/tiers.ts`
- Test: `src/engine/tiers.test.ts`

**Interfaces:**
- Consumes: `CARDS_PER_DECK` de `./cards` (tests seulement).
- Produces: `interface TierConfig { readonly tier: number; readonly cardsCount: number; readonly speedMs: number; readonly deckCount: number; readonly checkpoints: number; readonly xpBase: number }`, `const TIERS: readonly TierConfig[]` (10 éléments), `const SESSIONS_TO_UNLOCK_NEXT_TIER = 3`, `getTierConfig(tier: number): TierConfig`, `highestUnlockedTier(successesByTier: Readonly<Record<number, number>>): number`.

Table des paliers (interpolation spec §5 : palier 1 = 20 cartes/1200 ms → palier 10 = 104 cartes/2 decks/400 ms ; checkpoints 2-3 aux paliers supérieurs) :

| tier | cardsCount | speedMs | deckCount | checkpoints | xpBase |
| ---- | ---------- | ------- | --------- | ----------- | ------ |
| 1    | 20         | 1200    | 1         | 0           | 10     |
| 2    | 26         | 1100    | 1         | 0           | 15     |
| 3    | 32         | 1000    | 1         | 0           | 20     |
| 4    | 40         | 900     | 1         | 0           | 26     |
| 5    | 52         | 800     | 1         | 0           | 33     |
| 6    | 52         | 700     | 1         | 2           | 41     |
| 7    | 64         | 600     | 2         | 2           | 50     |
| 8    | 78         | 500     | 2         | 2           | 60     |
| 9    | 90         | 450     | 2         | 3           | 71     |
| 10   | 104        | 400     | 2         | 3           | 83     |

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/tiers.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/tiers.test.ts`
Expected: FAIL — `Failed to resolve import "./tiers"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/engine/tiers.ts
export interface TierConfig {
  readonly tier: number
  readonly cardsCount: number
  readonly speedMs: number
  readonly deckCount: number
  readonly checkpoints: number
  readonly xpBase: number
}

export const TIERS: readonly TierConfig[] = [
  { tier: 1, cardsCount: 20, speedMs: 1200, deckCount: 1, checkpoints: 0, xpBase: 10 },
  { tier: 2, cardsCount: 26, speedMs: 1100, deckCount: 1, checkpoints: 0, xpBase: 15 },
  { tier: 3, cardsCount: 32, speedMs: 1000, deckCount: 1, checkpoints: 0, xpBase: 20 },
  { tier: 4, cardsCount: 40, speedMs: 900, deckCount: 1, checkpoints: 0, xpBase: 26 },
  { tier: 5, cardsCount: 52, speedMs: 800, deckCount: 1, checkpoints: 0, xpBase: 33 },
  { tier: 6, cardsCount: 52, speedMs: 700, deckCount: 1, checkpoints: 2, xpBase: 41 },
  { tier: 7, cardsCount: 64, speedMs: 600, deckCount: 2, checkpoints: 2, xpBase: 50 },
  { tier: 8, cardsCount: 78, speedMs: 500, deckCount: 2, checkpoints: 2, xpBase: 60 },
  { tier: 9, cardsCount: 90, speedMs: 450, deckCount: 2, checkpoints: 3, xpBase: 71 },
  { tier: 10, cardsCount: 104, speedMs: 400, deckCount: 2, checkpoints: 3, xpBase: 83 },
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/tiers.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify quality gates and commit**

Run: `npm run lint && npm run typecheck && npm run format && npm run test`
Expected: tout vert.

```bash
git add src/engine/tiers.ts src/engine/tiers.test.ts
git commit -m "feat(engine): 10 paliers de difficulté et logique de déblocage"
```

---

### Task 4: XP et niveaux

**Files:**
- Create: `src/engine/xp.ts`
- Test: `src/engine/xp.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `interface XpInput { readonly xpBase: number; readonly correct: boolean; readonly accuracy: number; readonly streakActive: boolean }`, `computeXp(input: XpInput): number`, `xpRequiredForLevel(level: number): number`, `levelFromXp(xpTotal: number): number`, constantes `PARTICIPATION_MULTIPLIER = 0.1`, `STREAK_BONUS_MULTIPLIER = 1.1`, `XP_SESSION_MAX = 200`.

Interprétation spec §5 (documentée ici, réutilisée en Phase 3 côté serveur) :
- `multiplicateur_réussite` = `accuracy` (∈ [0, 1], fraction de réponses justes : checkpoints + count final) si la session est réussie (`correct`), sinon `PARTICIPATION_MULTIPLIER` (petite XP de participation).
- Bonus streak : ×1.1 (« +10 % si streak actif »). Résultat arrondi, borné par `XP_SESSION_MAX` (borne miroir de la future borne serveur).
- Niveaux : `xpRequiredForLevel(n)` = XP totale requise pour **atteindre** le niveau `n` = `round(100 × (n-1)^1.5)` ; niveau 1 acquis d'office (0 XP). Équivaut à la formule spec `xp_requis(n) = 100 × n^1.5` où `n` est le niveau courant à franchir.

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/xp.test.ts
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
    expect(computeXp({ xpBase: 33, correct: true, accuracy: 1, streakActive: false })).toBe(33)
  })

  test('session réussie avec checkpoints partiels : proportionnel à l’accuracy', () => {
    // 41 × (2/3) = 27.33 → 27
    expect(
      computeXp({ xpBase: 41, correct: true, accuracy: 2 / 3, streakActive: false }),
    ).toBe(27)
  })

  test('session ratée : XP de participation', () => {
    expect(computeXp({ xpBase: 50, correct: false, accuracy: 0, streakActive: false })).toBe(
      Math.round(50 * PARTICIPATION_MULTIPLIER),
    )
  })

  test('streak actif : +10 %', () => {
    expect(computeXp({ xpBase: 30, correct: true, accuracy: 1, streakActive: true })).toBe(
      Math.round(30 * STREAK_BONUS_MULTIPLIER),
    )
  })

  test('borné par XP_SESSION_MAX', () => {
    expect(computeXp({ xpBase: 10000, correct: true, accuracy: 1, streakActive: true })).toBe(
      XP_SESSION_MAX,
    )
  })

  test('rejette une accuracy hors [0, 1] et un xpBase non positif', () => {
    expect(() =>
      computeXp({ xpBase: 10, correct: true, accuracy: 1.2, streakActive: false }),
    ).toThrow(/accuracy/)
    expect(() =>
      computeXp({ xpBase: 10, correct: true, accuracy: -0.1, streakActive: false }),
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/xp.test.ts`
Expected: FAIL — `Failed to resolve import "./xp"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/engine/xp.ts
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
  const successMultiplier = input.correct ? input.accuracy : PARTICIPATION_MULTIPLIER
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/xp.test.ts`
Expected: PASS. Vérifier notamment `xpRequiredForLevel(3)` : `100 × 2^1.5 = 282.84 → 283`.

- [ ] **Step 5: Verify quality gates and commit**

Run: `npm run lint && npm run typecheck && npm run format && npm run test`
Expected: tout vert.

```bash
git add src/engine/xp.ts src/engine/xp.test.ts
git commit -m "feat(engine): calcul d'XP borné et courbe de niveaux"
```

---

### Task 5: Session de drill — création et défilement des cartes

**Files:**
- Create: `src/engine/session.ts`
- Test: `src/engine/session.test.ts`

**Interfaces:**
- Consumes: `buildDecks`, `CARDS_PER_DECK`, `type Card` de `./cards` ; `createRng`, `shuffle` de `./shuffle` ; `type TierConfig` de `./tiers` ; `getTierConfig`, `runningCount` (tests).
- Produces: `type SessionPhase = 'running' | 'awaiting-checkpoint' | 'awaiting-final'`, `interface CheckpointAnswer { readonly position: number; readonly expected: number; readonly given: number; readonly correct: boolean }`, `interface SessionState { readonly config: TierConfig; readonly cards: readonly Card[]; readonly checkpointPositions: readonly number[]; readonly position: number; readonly phase: SessionPhase; readonly checkpointAnswers: readonly CheckpointAnswer[] }`, `checkpointPositionsFor(cardsCount: number, checkpoints: number): number[]`, `createSession(config: TierConfig, seed: number): SessionState`, `revealNextCard(state: SessionState): SessionState`, `currentCard(state: SessionState): Card`. (Task 6 ajoutera `answerCheckpoint`, `answerFinal`, `SessionResult` dans ce même fichier.)

Sémantique : `position` = nombre de cartes déjà révélées. Un checkpoint se déclenche quand `position` atteint une valeur de `checkpointPositions` (positions réparties uniformément : `floor(cardsCount × k / (checkpoints+1))` pour k = 1..checkpoints — jamais égales à `cardsCount`, donc jamais en collision avec la question finale). La cadence `speedMs` est gérée par l'UI (Phase 2) : l'engine ne manipule aucun timer.

- [ ] **Step 1: Write the failing tests**

```ts
// src/engine/session.test.ts
import { describe, expect, test } from 'vitest'
import { runningCount } from './cards'
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
    expect(createSession(config, 7).cards).toEqual(createSession(config, 7).cards)
    expect(createSession(config, 7).cards).not.toEqual(createSession(config, 8).cards)
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/session.test.ts`
Expected: FAIL — `Failed to resolve import "./session"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/engine/session.ts
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
export function checkpointPositionsFor(cardsCount: number, checkpoints: number): number[] {
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
    checkpointPositions: checkpointPositionsFor(config.cardsCount, config.checkpoints),
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify quality gates and commit**

Run: `npm run lint && npm run typecheck && npm run format && npm run test`
Expected: tout vert.

```bash
git add src/engine/session.ts src/engine/session.test.ts
git commit -m "feat(engine): session de drill, création seedée et défilement avec checkpoints"
```

---

### Task 6: Session de drill — réponses aux checkpoints et résultat final

**Files:**
- Modify: `src/engine/session.ts` (ajout en fin de fichier)
- Test: `src/engine/session.test.ts` (ajout de describe blocks)

**Interfaces:**
- Consumes: tout Task 5, plus `runningCount` de `./cards` (à ajouter à l'import existant de `session.ts`).
- Produces: `interface SessionResult { readonly correct: boolean; readonly expectedCount: number; readonly givenCount: number; readonly accuracy: number; readonly cardsSeen: number; readonly checkpointAnswers: readonly CheckpointAnswer[] }`, `answerCheckpoint(state: SessionState, given: number): SessionState`, `answerFinal(state: SessionState, given: number): SessionResult`.

Sémantique : `accuracy` = réponses justes / réponses totales (checkpoints + count final). `correct` = le count final seul. Sans checkpoint : `accuracy` vaut 1 ou 0. Ce `SessionResult` alimente `computeXp` (Task 4) via `{ xpBase: config.xpBase, correct, accuracy, streakActive }` — branchement effectif en Phase 2.

- [ ] **Step 1: Write the failing tests** (ajouter à la fin de `src/engine/session.test.ts` ; ajouter `answerCheckpoint, answerFinal` à l'import de `./session`)

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/session.test.ts`
Expected: FAIL — `answerCheckpoint is not a function` (ou export manquant).

- [ ] **Step 3: Write the implementation** (à ajouter à la fin de `src/engine/session.ts` ; modifier la 1re ligne d'import en `import { buildDecks, CARDS_PER_DECK, runningCount, type Card } from './cards'`)

```ts
export interface SessionResult {
  readonly correct: boolean
  readonly expectedCount: number
  readonly givenCount: number
  readonly accuracy: number
  readonly cardsSeen: number
  readonly checkpointAnswers: readonly CheckpointAnswer[]
}

export function answerCheckpoint(state: SessionState, given: number): SessionState {
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/session.test.ts`
Expected: PASS (Tasks 5 + 6, tous verts).

- [ ] **Step 5: Verify quality gates and commit**

Run: `npm run lint && npm run typecheck && npm run format && npm run test`
Expected: tout vert.

```bash
git add src/engine/session.ts src/engine/session.test.ts
git commit -m "feat(engine): réponses aux checkpoints, résultat final et accuracy"
```

---

### Task 7: API publique de l'engine, seuils de couverture, clôture de phase

**Files:**
- Create: `src/engine/index.ts`
- Create: `src/lib/supabase.test.ts`
- Modify: `vite.config.ts` (bloc `coverage`, lignes 12-16)

**Interfaces:**
- Consumes: tous les modules engine (Tasks 1-6) ; `getSupabase` de `src/lib/supabase.ts` (existant).
- Produces: barrel `src/engine/index.ts` — point d'import unique pour la Phase 2.

Contexte : le plan Phase 0 a différé l'activation du seuil de couverture 80 % à la Phase 1. `src/lib/supabase.ts` est actuellement non couvert — un test dédié (via `vi.stubEnv`) le couvre entièrement plutôt que de l'exclure.

- [ ] **Step 1: Write the barrel**

```ts
// src/engine/index.ts
export * from './cards'
export * from './shuffle'
export * from './tiers'
export * from './xp'
export * from './session'
```

- [ ] **Step 2: Write the Supabase client test**

```ts
// src/lib/supabase.test.ts
import { afterEach, describe, expect, test, vi } from 'vitest'

describe('getSupabase', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  test('lève une erreur explicite sans configuration', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const { getSupabase } = await import('./supabase')
    expect(() => getSupabase()).toThrow(/Supabase non configuré/)
  })

  test('retourne un client mémoïsé quand la configuration est présente', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://exemple-projet.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'cle-anon-de-test')
    const { getSupabase } = await import('./supabase')
    const first = getSupabase()
    const second = getSupabase()
    expect(first).toBeDefined()
    expect(second).toBe(first)
  })
})
```

Note : `vi.resetModules()` est nécessaire entre les deux tests car le client est mémoïsé au niveau module (`let client`), d'où les `await import` dynamiques.

- [ ] **Step 3: Run the new test**

Run: `npx vitest run src/lib/supabase.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 4: Activate coverage thresholds**

Dans `vite.config.ts`, remplacer le bloc `coverage` existant par :

```ts
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/test/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        'src/engine/**': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
      },
    },
```

- [ ] **Step 5: Run coverage and fix any gap**

Run: `npm run test:coverage`
Expected: PASS, engine à 100 % (lignes/branches/fonctions/statements), global ≥ 80 %. Si une branche de l'engine n'est pas couverte, ajouter le test manquant dans le fichier de test du module concerné (ne jamais abaisser le seuil).

- [ ] **Step 6: Verify all quality gates**

Run: `npm run lint && npm run typecheck && npm run format:check && npm run test && npm run build`
Expected: tout vert.

- [ ] **Step 7: Commit and push**

```bash
git add src/engine/index.ts src/lib/supabase.test.ts vite.config.ts
git commit -m "feat(engine): API publique, seuils de couverture (engine 100 %, global 80 %)"
git push
```

Vérifier ensuite la CI : `https://api.github.com/repos/mathis1812/-cardcount-/actions/runs?per_page=1` doit rapporter `"status": "completed", "conclusion": "success"`.

---

## Vérification de fin de phase

1. `npm run lint && npm run typecheck && npm run format:check && npm run test && npm run build` — tout vert.
2. `npm run test:coverage` — `src/engine/**` à 100 %, global ≥ 80 %, seuils bloquants actifs.
3. CI GitHub Actions verte sur `main`.
4. Aucune dépendance UI/réseau dans `src/engine/` (imports uniquement internes au dossier).
5. Propriété spec vérifiée par test : count final d'un deck complet (1, 2, 6 decks, mélangé ou non) = 0.
