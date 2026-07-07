# Phase 2 — UI du drill anonyme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Écran de jeu jouable sans compte : défilement des cartes au rythme du palier, saisie du count (checkpoints + final), feedback avec rejeu pédagogique, XP/niveau persistés en localStorage.

**Architecture:** Composants React sous `src/features/drill/`, branchés sur l'engine pur de la Phase 1 (`src/engine/`). Le timing vit dans un hook `useDrillSession` (setInterval au `speedMs` du palier) ; le profil anonyme (XP, réussites par palier) vit dans un store Zustand avec middleware `persist` (localStorage). Zéro texte en dur : toutes les chaînes via react-i18next (`fr.json`).

**Tech Stack:** React 19, Zustand (+persist), react-i18next, Vitest + React Testing Library (fake timers).

## Global Constraints

- Zéro texte en dur dans les composants : toute chaîne visible passe par `t('...')` (spec §2 « i18n structuré dès le départ »).
- Immutabilité : jamais de mutation d'état ; l'engine reste la seule source de logique de jeu (aucune règle Hi-Lo dupliquée dans l'UI).
- Essai anonyme : état en localStorage, aucun appel réseau/Supabase dans cette phase (spec §3).
- Streak : non applicable à l'essai anonyme (`streakActive: false` dans `computeXp`) — la streak arrive en Phase 3 avec les comptes (spec §4-5).
- Import engine via le barrel : `import { ... } from '../../engine'`.
- Seuils de couverture bloquants déjà actifs : global ≥ 80 %, `src/engine/**` = 100 % (ne pas abaisser).
- Style projet : Prettier `semi: false, singleQuote: true` ; conventional commits ; un commit par tâche ; `npm run lint && npm run typecheck && npm run test` avant chaque commit.
- Le titre applicatif passe de « Hello CardCount » (critère Phase 0) à « CardCount » — mise à jour de la clé `app.title` et du test de fumée en Task 6.

## File Structure

```
src/features/drill/
├── profileStore.ts       — store Zustand persist : xpTotal, successesByTier, recordSession
├── CardView.tsx          — affichage d'une carte (rank + symbole, rouge/noir)
├── CountInput.tsx        — formulaire de saisie d'un count (entier, clavier)
├── useDrillSession.ts    — hook : session engine + timer au speedMs
├── ResultsPanel.tsx      — feedback fin de session (correct, attendu/donné, accuracy, XP)
├── ReplayPanel.tsx       — rejeu pédagogique (table cartes → valeur Hi-Lo → count cumulé)
├── TierPicker.tsx        — sélection du palier (verrouillage via highestUnlockedTier)
└── DrillScreen.tsx       — orchestration des phases UI
```

---

### Task 1: Store de profil anonyme (Zustand + persist)

**Files:**
- Create: `src/features/drill/profileStore.ts`
- Test: `src/features/drill/profileStore.test.ts`
- Modify: `package.json` (dépendance `zustand`)

**Interfaces:**
- Consumes: rien de l'engine.
- Produces: `useProfileStore` (hook Zustand) avec l'état `{ xpTotal: number; successesByTier: Record<number, number> }` et l'action `recordSession(input: { tier: number; correct: boolean; xpEarned: number }): void`. Persisté sous la clé localStorage `cardcount-profile`.

- [ ] **Step 1: Install zustand**

Run: `npm install zustand`
Expected: ajout à `dependencies` sans erreur.

- [ ] **Step 2: Write the failing tests**

```ts
// src/features/drill/profileStore.test.ts
import { beforeEach, describe, expect, test } from 'vitest'
import { useProfileStore } from './profileStore'

describe('useProfileStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useProfileStore.setState({ xpTotal: 0, successesByTier: {} })
  })

  test('état initial : 0 XP, aucun palier réussi', () => {
    expect(useProfileStore.getState().xpTotal).toBe(0)
    expect(useProfileStore.getState().successesByTier).toEqual({})
  })

  test('recordSession ajoute l’XP et compte la réussite du palier', () => {
    useProfileStore.getState().recordSession({ tier: 1, correct: true, xpEarned: 10 })
    useProfileStore.getState().recordSession({ tier: 1, correct: true, xpEarned: 8 })
    const state = useProfileStore.getState()
    expect(state.xpTotal).toBe(18)
    expect(state.successesByTier).toEqual({ 1: 2 })
  })

  test('une session ratée donne l’XP mais ne compte pas comme réussite', () => {
    useProfileStore.getState().recordSession({ tier: 2, correct: false, xpEarned: 5 })
    const state = useProfileStore.getState()
    expect(state.xpTotal).toBe(5)
    expect(state.successesByTier).toEqual({})
  })

  test('rejette une XP négative', () => {
    expect(() =>
      useProfileStore.getState().recordSession({ tier: 1, correct: true, xpEarned: -1 }),
    ).toThrow(/xpEarned/)
  })

  test('persiste dans localStorage sous cardcount-profile', () => {
    useProfileStore.getState().recordSession({ tier: 1, correct: true, xpEarned: 12 })
    const raw = localStorage.getItem('cardcount-profile')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string).state.xpTotal).toBe(12)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/features/drill/profileStore.test.ts`
Expected: FAIL — `Failed to resolve import "./profileStore"`.

- [ ] **Step 4: Write the implementation**

```ts
// src/features/drill/profileStore.ts
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface RecordSessionInput {
  readonly tier: number
  readonly correct: boolean
  readonly xpEarned: number
}

export interface ProfileState {
  readonly xpTotal: number
  readonly successesByTier: Readonly<Record<number, number>>
  recordSession: (input: RecordSessionInput) => void
}

// Profil anonyme (essai sans compte) : persisté en localStorage.
// À l'inscription (Phase 3), ces valeurs migrent vers le profil serveur.
export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      xpTotal: 0,
      successesByTier: {},
      recordSession: ({ tier, correct, xpEarned }) => {
        if (xpEarned < 0) {
          throw new Error(`xpEarned doit être >= 0, reçu : ${xpEarned}`)
        }
        set((state) => ({
          xpTotal: state.xpTotal + xpEarned,
          successesByTier: correct
            ? {
                ...state.successesByTier,
                [tier]: (state.successesByTier[tier] ?? 0) + 1,
              }
            : state.successesByTier,
        }))
      },
    }),
    { name: 'cardcount-profile', storage: createJSONStorage(() => localStorage) },
  ),
)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/features/drill/profileStore.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Verify quality gates and commit**

Run: `npm run lint && npm run typecheck && npx prettier --write src/features && npm run test`
Expected: tout vert.

```bash
git add package.json package-lock.json src/features/drill/profileStore.ts src/features/drill/profileStore.test.ts
git commit -m "feat(drill): store de profil anonyme Zustand persisté en localStorage"
```

---

### Task 2: Clés i18n + CardView + CountInput

**Files:**
- Modify: `src/i18n/locales/fr.json` (ajout des clés `drill.*`, `app.title` inchangé jusqu'à la Task 6)
- Create: `src/features/drill/CardView.tsx`
- Create: `src/features/drill/CountInput.tsx`
- Test: `src/features/drill/CardView.test.tsx`, `src/features/drill/CountInput.test.tsx`

**Interfaces:**
- Consumes: `type Card`, `type Suit` de `../../engine`.
- Produces: `CardView({ card }: { card: Card })` — `role="img"`, `aria-label` = `"{rank} {suit}"` ; `CountInput({ label, onSubmit }: { label: string; onSubmit: (value: number) => void })` — formulaire avec input `type="number"`, bouton `t('drill.submit')`, n'appelle `onSubmit` que pour un entier valide puis vide le champ.

- [ ] **Step 1: Update fr.json**

```json
{
  "app": {
    "title": "Hello CardCount"
  },
  "drill": {
    "pickTier": "Choisis ton palier",
    "tier": "Palier {{tier}}",
    "tierLocked": "Palier {{tier}} (verrouillé)",
    "start": "Lancer la session",
    "progress": "Carte {{current}} / {{total}}",
    "checkpointPrompt": "Quel est le count actuel ?",
    "finalPrompt": "Quel est le running count final ?",
    "submit": "Valider",
    "correct": "Bien joué !",
    "incorrect": "Raté…",
    "expected": "Count attendu : {{value}}",
    "given": "Ta réponse : {{value}}",
    "accuracy": "Précision : {{percent}} %",
    "xpEarned": "+{{xp}} XP",
    "newSession": "Nouvelle session",
    "level": "Niveau {{level}}",
    "xpTotal": "{{xp}} XP",
    "replayTitle": "Rejeu pédagogique",
    "replayCard": "Carte",
    "replayValue": "Valeur Hi-Lo",
    "replayCount": "Count cumulé"
  }
}
```

Note : la variable s'appelle `{{value}}` (pas `{{count}}`) car `count` est une option réservée d'i18next (pluralisation).

- [ ] **Step 2: Write the failing tests**

```tsx
// src/features/drill/CardView.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { CardView } from './CardView'

describe('CardView', () => {
  test('affiche le rang et le symbole de la couleur', () => {
    render(<CardView card={{ rank: 'K', suit: 'hearts' }} />)
    const card = screen.getByRole('img', { name: 'K hearts' })
    expect(card).toHaveTextContent('K♥')
  })

  test('affiche un 10 de pique', () => {
    render(<CardView card={{ rank: '10', suit: 'spades' }} />)
    expect(screen.getByRole('img', { name: '10 spades' })).toHaveTextContent('10♠')
  })
})
```

```tsx
// src/features/drill/CountInput.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { CountInput } from './CountInput'

describe('CountInput', () => {
  test('soumet un entier (négatif inclus) et vide le champ', () => {
    const onSubmit = vi.fn()
    render(<CountInput label="Count ?" onSubmit={onSubmit} />)
    const input = screen.getByLabelText('Count ?')
    fireEvent.change(input, { target: { value: '-3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    expect(onSubmit).toHaveBeenCalledWith(-3)
    expect(input).toHaveValue(null)
  })

  test('ignore une saisie vide ou non entière', () => {
    const onSubmit = vi.fn()
    render(<CountInput label="Count ?" onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/features/drill/CardView.test.tsx src/features/drill/CountInput.test.tsx`
Expected: FAIL — imports non résolus.

- [ ] **Step 4: Write the implementations**

```tsx
// src/features/drill/CardView.tsx
import type { Card, Suit } from '../../engine'

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
}

const RED_SUITS: readonly Suit[] = ['hearts', 'diamonds']

export function CardView({ card }: { card: Card }) {
  const color = RED_SUITS.includes(card.suit) ? '#c0392b' : '#1a1a2e'
  return (
    <div
      role="img"
      aria-label={`${card.rank} ${card.suit}`}
      style={{
        display: 'inline-block',
        padding: '2rem 1.5rem',
        border: '2px solid #ccc',
        borderRadius: '12px',
        fontSize: '3rem',
        fontWeight: 700,
        color,
        background: '#fff',
      }}
    >
      {card.rank}
      {SUIT_SYMBOLS[card.suit]}
    </div>
  )
}
```

```tsx
// src/features/drill/CountInput.tsx
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

export function CountInput({
  label,
  onSubmit,
}: {
  label: string
  onSubmit: (value: number) => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = Number(value)
    if (value.trim() === '' || !Number.isInteger(parsed)) {
      return
    }
    onSubmit(parsed)
    setValue('')
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        {label}
        <input
          type="number"
          step="1"
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button type="submit">{t('drill.submit')}</button>
    </form>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/features/drill/CardView.test.tsx src/features/drill/CountInput.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Verify quality gates and commit**

Run: `npm run lint && npm run typecheck && npx prettier --write src/features src/i18n && npm run test`
Expected: tout vert.

```bash
git add src/i18n/locales/fr.json src/features/drill/CardView.tsx src/features/drill/CardView.test.tsx src/features/drill/CountInput.tsx src/features/drill/CountInput.test.tsx
git commit -m "feat(drill): clés i18n du drill, CardView et CountInput"
```

---

### Task 3: Hook useDrillSession (timer + engine)

**Files:**
- Create: `src/features/drill/useDrillSession.ts`
- Test: `src/features/drill/useDrillSession.test.ts`

**Interfaces:**
- Consumes: `answerCheckpoint`, `answerFinal`, `createSession`, `revealNextCard`, `type SessionResult`, `type SessionState`, `type TierConfig` de `../../engine`.
- Produces: `useDrillSession(): { session: SessionState | null; result: SessionResult | null; start: (config: TierConfig, seed?: number) => void; submitCheckpoint: (given: number) => void; submitFinal: (given: number) => SessionResult | null; reset: () => void }`. Le timer révèle une carte toutes les `config.speedMs` ms tant que `phase === 'running'` ; il s'arrête seul aux checkpoints/final (changement de phase) et reprend après `submitCheckpoint`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/drill/useDrillSession.test.ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { getTierConfig, runningCount } from '../../engine'
import { useDrillSession } from './useDrillSession'

describe('useDrillSession', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('démarre à zéro puis révèle une carte par tick de speedMs', () => {
    const { result } = renderHook(() => useDrillSession())
    act(() => result.current.start(getTierConfig(1), 42))
    expect(result.current.session?.position).toBe(0)
    act(() => vi.advanceTimersByTime(1200))
    expect(result.current.session?.position).toBe(1)
    act(() => vi.advanceTimersByTime(1200 * 5))
    expect(result.current.session?.position).toBe(6)
  })

  test('atteint awaiting-final après la dernière carte et le timer s’arrête', () => {
    const { result } = renderHook(() => useDrillSession())
    act(() => result.current.start(getTierConfig(1), 42))
    act(() => vi.advanceTimersByTime(1200 * 20))
    expect(result.current.session?.phase).toBe('awaiting-final')
    act(() => vi.advanceTimersByTime(1200 * 10))
    expect(result.current.session?.position).toBe(20) // plus aucune révélation
  })

  test('s’arrête au checkpoint puis reprend après submitCheckpoint (palier 6)', () => {
    const { result } = renderHook(() => useDrillSession())
    act(() => result.current.start(getTierConfig(6), 42)) // checkpoints à 17 et 34
    act(() => vi.advanceTimersByTime(700 * 17))
    expect(result.current.session?.phase).toBe('awaiting-checkpoint')
    act(() => vi.advanceTimersByTime(700 * 5))
    expect(result.current.session?.position).toBe(17) // gelé pendant la question
    act(() => result.current.submitCheckpoint(0))
    expect(result.current.session?.phase).toBe('running')
    act(() => vi.advanceTimersByTime(700))
    expect(result.current.session?.position).toBe(18)
  })

  test('submitFinal retourne le résultat et l’expose via result', () => {
    const { result } = renderHook(() => useDrillSession())
    act(() => result.current.start(getTierConfig(1), 42))
    act(() => vi.advanceTimersByTime(1200 * 20))
    const expected = runningCount(result.current.session?.cards ?? [])
    let returned: ReturnType<typeof result.current.submitFinal> = null
    act(() => {
      returned = result.current.submitFinal(expected)
    })
    expect(returned?.correct).toBe(true)
    expect(result.current.result?.correct).toBe(true)
  })

  test('reset repart à l’état vide', () => {
    const { result } = renderHook(() => useDrillSession())
    act(() => result.current.start(getTierConfig(1), 42))
    act(() => result.current.reset())
    expect(result.current.session).toBeNull()
    expect(result.current.result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/drill/useDrillSession.test.ts`
Expected: FAIL — `Failed to resolve import "./useDrillSession"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/drill/useDrillSession.ts
import { useCallback, useEffect, useState } from 'react'
import {
  answerCheckpoint,
  answerFinal,
  createSession,
  revealNextCard,
  type SessionResult,
  type SessionState,
  type TierConfig,
} from '../../engine'

export function useDrillSession() {
  const [session, setSession] = useState<SessionState | null>(null)
  const [result, setResult] = useState<SessionResult | null>(null)

  const start = useCallback((config: TierConfig, seed: number = Date.now()) => {
    setResult(null)
    setSession(createSession(config, seed))
  }, [])

  const isRunning = session?.phase === 'running'
  const speedMs = session?.config.speedMs

  useEffect(() => {
    if (!isRunning || speedMs === undefined) {
      return
    }
    const id = setInterval(() => {
      setSession((s) => (s && s.phase === 'running' ? revealNextCard(s) : s))
    }, speedMs)
    return () => clearInterval(id)
  }, [isRunning, speedMs])

  const submitCheckpoint = useCallback((given: number) => {
    setSession((s) =>
      s && s.phase === 'awaiting-checkpoint' ? answerCheckpoint(s, given) : s,
    )
  }, [])

  const submitFinal = useCallback(
    (given: number): SessionResult | null => {
      if (!session || session.phase !== 'awaiting-final') {
        return null
      }
      const sessionResult = answerFinal(session, given)
      setResult(sessionResult)
      return sessionResult
    },
    [session],
  )

  const reset = useCallback(() => {
    setSession(null)
    setResult(null)
  }, [])

  return { session, result, start, submitCheckpoint, submitFinal, reset }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/drill/useDrillSession.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Verify quality gates and commit**

Run: `npm run lint && npm run typecheck && npx prettier --write src/features && npm run test`
Expected: tout vert.

```bash
git add src/features/drill/useDrillSession.ts src/features/drill/useDrillSession.test.ts
git commit -m "feat(drill): hook useDrillSession, timer au rythme du palier"
```

---

### Task 4: ResultsPanel + ReplayPanel

**Files:**
- Create: `src/features/drill/ResultsPanel.tsx`
- Create: `src/features/drill/ReplayPanel.tsx`
- Test: `src/features/drill/ResultsPanel.test.tsx`, `src/features/drill/ReplayPanel.test.tsx`

**Interfaces:**
- Consumes: `type SessionResult`, `type Card`, `type Suit`, `hiLoValue` de `../../engine` ; clés i18n `drill.*` (Task 2).
- Produces: `ResultsPanel({ result, xpEarned }: { result: SessionResult; xpEarned: number })` ; `ReplayPanel({ cards }: { cards: readonly Card[] })` — table avec une ligne par carte : rang+symbole, valeur Hi-Lo signée, count cumulé.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/drill/ResultsPanel.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { SessionResult } from '../../engine'
import { ResultsPanel } from './ResultsPanel'

const baseResult: SessionResult = {
  correct: true,
  expectedCount: 3,
  givenCount: 3,
  accuracy: 1,
  cardsSeen: 20,
  checkpointAnswers: [],
}

describe('ResultsPanel', () => {
  test('session réussie : félicitations, counts, accuracy et XP', () => {
    render(<ResultsPanel result={baseResult} xpEarned={10} />)
    expect(screen.getByText('Bien joué !')).toBeInTheDocument()
    expect(screen.getByText('Count attendu : 3')).toBeInTheDocument()
    expect(screen.getByText('Ta réponse : 3')).toBeInTheDocument()
    expect(screen.getByText('Précision : 100 %')).toBeInTheDocument()
    expect(screen.getByText('+10 XP')).toBeInTheDocument()
  })

  test('session ratée : message d’échec', () => {
    render(
      <ResultsPanel
        result={{ ...baseResult, correct: false, givenCount: 5, accuracy: 0 }}
        xpEarned={1}
      />,
    )
    expect(screen.getByText('Raté…')).toBeInTheDocument()
    expect(screen.getByText('Ta réponse : 5')).toBeInTheDocument()
    expect(screen.getByText('Précision : 0 %')).toBeInTheDocument()
  })
})
```

```tsx
// src/features/drill/ReplayPanel.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { Card } from '../../engine'
import { ReplayPanel } from './ReplayPanel'

describe('ReplayPanel', () => {
  test('affiche chaque carte avec sa valeur Hi-Lo et le count cumulé', () => {
    const cards: readonly Card[] = [
      { rank: '5', suit: 'hearts' }, // +1 → 1
      { rank: 'K', suit: 'spades' }, // -1 → 0
      { rank: '8', suit: 'clubs' }, // 0 → 0
    ]
    render(<ReplayPanel cards={cards} />)
    expect(screen.getByText('Rejeu pédagogique')).toBeInTheDocument()
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(4) // en-tête + 3 cartes
    expect(rows[1]).toHaveTextContent('5♥')
    expect(rows[1]).toHaveTextContent('+1')
    expect(rows[2]).toHaveTextContent('K♠')
    expect(rows[2]).toHaveTextContent('-1')
    expect(rows[3]).toHaveTextContent('8♣')
    expect(rows[3]).toHaveTextContent('0')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/drill/ResultsPanel.test.tsx src/features/drill/ReplayPanel.test.tsx`
Expected: FAIL — imports non résolus.

- [ ] **Step 3: Write the implementations**

```tsx
// src/features/drill/ResultsPanel.tsx
import { useTranslation } from 'react-i18next'
import type { SessionResult } from '../../engine'

export function ResultsPanel({
  result,
  xpEarned,
}: {
  result: SessionResult
  xpEarned: number
}) {
  const { t } = useTranslation()
  return (
    <section aria-label={t(result.correct ? 'drill.correct' : 'drill.incorrect')}>
      <h2>{t(result.correct ? 'drill.correct' : 'drill.incorrect')}</h2>
      <p>{t('drill.expected', { value: result.expectedCount })}</p>
      <p>{t('drill.given', { value: result.givenCount })}</p>
      <p>{t('drill.accuracy', { percent: Math.round(result.accuracy * 100) })}</p>
      <p>{t('drill.xpEarned', { xp: xpEarned })}</p>
    </section>
  )
}
```

```tsx
// src/features/drill/ReplayPanel.tsx
import { useTranslation } from 'react-i18next'
import { hiLoValue, type Card, type Suit } from '../../engine'

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
}

const formatSigned = (value: number): string => (value > 0 ? `+${value}` : `${value}`)

export function ReplayPanel({ cards }: { cards: readonly Card[] }) {
  const { t } = useTranslation()
  const rows = cards.reduce<{ card: Card; value: number; total: number }[]>(
    (acc, card) => {
      const value = hiLoValue(card)
      const total = (acc.at(-1)?.total ?? 0) + value
      return [...acc, { card, value, total }]
    },
    [],
  )
  return (
    <section>
      <h2>{t('drill.replayTitle')}</h2>
      <table>
        <thead>
          <tr>
            <th>{t('drill.replayCard')}</th>
            <th>{t('drill.replayValue')}</th>
            <th>{t('drill.replayCount')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ card, value, total }, index) => (
            <tr key={index}>
              <td>
                {card.rank}
                {SUIT_SYMBOLS[card.suit]}
              </td>
              <td>{formatSigned(value)}</td>
              <td>{formatSigned(total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
```

Note : `SUIT_SYMBOLS` est dupliqué depuis CardView ; si un troisième usage apparaît, l'extraire dans `src/features/drill/suits.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/drill/ResultsPanel.test.tsx src/features/drill/ReplayPanel.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify quality gates and commit**

Run: `npm run lint && npm run typecheck && npx prettier --write src/features && npm run test`
Expected: tout vert.

```bash
git add src/features/drill/ResultsPanel.tsx src/features/drill/ResultsPanel.test.tsx src/features/drill/ReplayPanel.tsx src/features/drill/ReplayPanel.test.tsx
git commit -m "feat(drill): panneaux de résultat et de rejeu pédagogique"
```

---

### Task 5: TierPicker (sélection + verrouillage)

**Files:**
- Create: `src/features/drill/TierPicker.tsx`
- Test: `src/features/drill/TierPicker.test.tsx`

**Interfaces:**
- Consumes: `TIERS`, `highestUnlockedTier` de `../../engine` ; `useProfileStore` (Task 1).
- Produces: `TierPicker({ selected, onSelect }: { selected: number; onSelect: (tier: number) => void })` — un bouton radio par palier, désactivé si verrouillé (au-delà de `highestUnlockedTier(successesByTier)`).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/drill/TierPicker.test.tsx
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useProfileStore } from './profileStore'
import { TierPicker } from './TierPicker'

describe('TierPicker', () => {
  beforeEach(() => {
    localStorage.clear()
    useProfileStore.setState({ xpTotal: 0, successesByTier: {} })
  })

  test('sans historique : palier 1 actif, paliers 2+ verrouillés', () => {
    render(<TierPicker selected={1} onSelect={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Palier 1' })).toBeEnabled()
    expect(screen.getByRole('radio', { name: 'Palier 2 (verrouillé)' })).toBeDisabled()
    expect(screen.getAllByRole('radio')).toHaveLength(10)
  })

  test('3 réussites au palier 1 : palier 2 déverrouillé', () => {
    useProfileStore.setState({ successesByTier: { 1: 3 } })
    render(<TierPicker selected={1} onSelect={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Palier 2' })).toBeEnabled()
    expect(screen.getByRole('radio', { name: 'Palier 3 (verrouillé)' })).toBeDisabled()
  })

  test('la sélection remonte via onSelect', () => {
    useProfileStore.setState({ successesByTier: { 1: 3 } })
    const onSelect = vi.fn()
    render(<TierPicker selected={1} onSelect={onSelect} />)
    screen.getByRole('radio', { name: 'Palier 2' }).click()
    expect(onSelect).toHaveBeenCalledWith(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/drill/TierPicker.test.tsx`
Expected: FAIL — `Failed to resolve import "./TierPicker"`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/features/drill/TierPicker.tsx
import { useTranslation } from 'react-i18next'
import { highestUnlockedTier, TIERS } from '../../engine'
import { useProfileStore } from './profileStore'

export function TierPicker({
  selected,
  onSelect,
}: {
  selected: number
  onSelect: (tier: number) => void
}) {
  const { t } = useTranslation()
  const successesByTier = useProfileStore((state) => state.successesByTier)
  const maxUnlocked = highestUnlockedTier(successesByTier)

  return (
    <fieldset>
      <legend>{t('drill.pickTier')}</legend>
      {TIERS.map((tierConfig) => {
        const isLocked = tierConfig.tier > maxUnlocked
        const label = t(isLocked ? 'drill.tierLocked' : 'drill.tier', {
          tier: tierConfig.tier,
        })
        return (
          <label key={tierConfig.tier}>
            <input
              type="radio"
              name="tier"
              value={tierConfig.tier}
              checked={selected === tierConfig.tier}
              disabled={isLocked}
              onChange={() => onSelect(tierConfig.tier)}
              aria-label={label}
            />
            {label}
          </label>
        )
      })}
    </fieldset>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/drill/TierPicker.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify quality gates and commit**

Run: `npm run lint && npm run typecheck && npx prettier --write src/features && npm run test`
Expected: tout vert.

```bash
git add src/features/drill/TierPicker.tsx src/features/drill/TierPicker.test.tsx
git commit -m "feat(drill): sélecteur de palier avec verrouillage progressif"
```

---

### Task 6: DrillScreen + App + bascule du titre

**Files:**
- Create: `src/features/drill/DrillScreen.tsx`
- Test: `src/features/drill/DrillScreen.test.tsx`
- Modify: `src/App.tsx` (rend DrillScreen)
- Modify: `src/App.test.tsx` (titre « CardCount »)
- Modify: `src/i18n/locales/fr.json` (`app.title` → « CardCount »)

**Interfaces:**
- Consumes: tout Task 1-5 ; `computeXp`, `getTierConfig`, `levelFromXp`, `currentCard` de `../../engine` (+ `createSession`, `runningCount` dans les tests).
- Produces: `DrillScreen()` — composant autonome orchestrant : sélection → défilement → checkpoints → saisie finale → résultats + rejeu → nouvelle session. L'XP est calculée via `computeXp({ xpBase, correct, accuracy, streakActive: false })` et enregistrée une seule fois par session via `recordSession`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/drill/DrillScreen.test.tsx
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createSession, getTierConfig, runningCount } from '../../engine'
import { DrillScreen } from './DrillScreen'
import { useProfileStore } from './profileStore'

const FIXED_NOW = 1_700_000_000_000

describe('DrillScreen', () => {
  beforeEach(() => {
    localStorage.clear()
    useProfileStore.setState({ xpTotal: 0, successesByTier: {} })
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('flux complet palier 1 : défilement, réponse juste, résultat, XP, rejeu', () => {
    render(<DrillScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la session' }))
    act(() => {
      vi.advanceTimersByTime(1200 * 20)
    })
    // le deck est déterministe : seed = Date.now() figé
    const expected = runningCount(createSession(getTierConfig(1), FIXED_NOW).cards)
    const input = screen.getByLabelText('Quel est le running count final ?')
    fireEvent.change(input, { target: { value: String(expected) } })
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    expect(screen.getByText('Bien joué !')).toBeInTheDocument()
    expect(screen.getByText('+10 XP')).toBeInTheDocument()
    expect(screen.getByText('Rejeu pédagogique')).toBeInTheDocument()
    expect(useProfileStore.getState().xpTotal).toBe(10)
    expect(useProfileStore.getState().successesByTier).toEqual({ 1: 1 })
  })

  test('pendant le défilement : carte courante et progression affichées', () => {
    render(<DrillScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la session' }))
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(screen.getByText('Carte 1 / 20')).toBeInTheDocument()
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  test('nouvelle session après résultat revient à la sélection', () => {
    render(<DrillScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la session' }))
    act(() => {
      vi.advanceTimersByTime(1200 * 20)
    })
    fireEvent.change(screen.getByLabelText('Quel est le running count final ?'), {
      target: { value: '999' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle session' }))
    expect(screen.getByRole('button', { name: 'Lancer la session' })).toBeInTheDocument()
  })

  test('affiche niveau et XP totale du profil', () => {
    useProfileStore.setState({ xpTotal: 150 })
    render(<DrillScreen />)
    expect(screen.getByText('Niveau 2')).toBeInTheDocument()
    expect(screen.getByText('150 XP')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/drill/DrillScreen.test.tsx`
Expected: FAIL — `Failed to resolve import "./DrillScreen"`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/features/drill/DrillScreen.tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { computeXp, currentCard, getTierConfig, levelFromXp } from '../../engine'
import { CardView } from './CardView'
import { CountInput } from './CountInput'
import { useDrillSession } from './useDrillSession'
import { useProfileStore } from './profileStore'
import { ReplayPanel } from './ReplayPanel'
import { ResultsPanel } from './ResultsPanel'
import { TierPicker } from './TierPicker'

export function DrillScreen() {
  const { t } = useTranslation()
  const [selectedTier, setSelectedTier] = useState(1)
  const [xpEarned, setXpEarned] = useState(0)
  const { session, result, start, submitCheckpoint, submitFinal, reset } =
    useDrillSession()
  const xpTotal = useProfileStore((state) => state.xpTotal)
  const recordSession = useProfileStore((state) => state.recordSession)

  const handleFinal = (given: number) => {
    if (!session) {
      return
    }
    const sessionResult = submitFinal(given)
    if (sessionResult) {
      const xp = computeXp({
        xpBase: session.config.xpBase,
        correct: sessionResult.correct,
        accuracy: sessionResult.accuracy,
        streakActive: false,
      })
      recordSession({
        tier: session.config.tier,
        correct: sessionResult.correct,
        xpEarned: xp,
      })
      setXpEarned(xp)
    }
  }

  return (
    <main>
      <header>
        <p>{t('drill.level', { level: levelFromXp(xpTotal) })}</p>
        <p>{t('drill.xpTotal', { xp: xpTotal })}</p>
      </header>

      {result && session ? (
        <>
          <ResultsPanel result={result} xpEarned={xpEarned} />
          <ReplayPanel cards={session.cards} />
          <button type="button" onClick={reset}>
            {t('drill.newSession')}
          </button>
        </>
      ) : !session ? (
        <>
          <TierPicker selected={selectedTier} onSelect={setSelectedTier} />
          <button type="button" onClick={() => start(getTierConfig(selectedTier))}>
            {t('drill.start')}
          </button>
        </>
      ) : session.phase === 'awaiting-checkpoint' ? (
        <CountInput label={t('drill.checkpointPrompt')} onSubmit={submitCheckpoint} />
      ) : session.phase === 'awaiting-final' ? (
        <CountInput label={t('drill.finalPrompt')} onSubmit={handleFinal} />
      ) : (
        <>
          {session.position > 0 && <CardView card={currentCard(session)} />}
          <p>
            {t('drill.progress', {
              current: session.position,
              total: session.cards.length,
            })}
          </p>
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Update App, smoke test and title key**

```tsx
// src/App.tsx
import { useTranslation } from 'react-i18next'
import { DrillScreen } from './features/drill/DrillScreen'

function App() {
  const { t } = useTranslation()
  return (
    <>
      <h1>{t('app.title')}</h1>
      <DrillScreen />
    </>
  )
}

export default App
```

Dans `src/i18n/locales/fr.json`, remplacer `"title": "Hello CardCount"` par `"title": "CardCount"`.

```tsx
// src/App.test.tsx (contenu complet)
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import App from './App'

describe('App', () => {
  test('affiche le titre et l’écran de drill', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'CardCount' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Lancer la session' }),
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run all tests to verify they pass**

Run: `npm run test`
Expected: PASS — tous les fichiers, y compris le test de fumée mis à jour.

- [ ] **Step 6: Verify quality gates and commit**

Run: `npm run lint && npm run typecheck && npx prettier --write src && npm run format:check && npm run test`
Expected: tout vert.

```bash
git add src/features/drill/DrillScreen.tsx src/features/drill/DrillScreen.test.tsx src/App.tsx src/App.test.tsx src/i18n/locales/fr.json
git commit -m "feat(drill): écran de drill complet, App branchée, titre CardCount"
```

---

### Task 7: Clôture de phase — couverture, build, push, vérification en ligne

**Files:**
- Aucun nouveau fichier (corrections de couverture éventuelles uniquement).

- [ ] **Step 1: Coverage**

Run: `npm run test:coverage`
Expected: PASS — global ≥ 80 % (seuil bloquant), `src/engine/**` = 100 %. Si un fichier de `src/features/drill/` fait chuter le global sous 80 %, ajouter le test manquant (ne jamais abaisser le seuil ni exclure le fichier).

- [ ] **Step 2: Full gates**

Run: `npm run lint && npm run typecheck && npm run format:check && npm run test && npm run build`
Expected: tout vert.

- [ ] **Step 3: Push**

```bash
git push
```

- [ ] **Step 4: Verify CI**

Vérifier `https://api.github.com/repos/mathis1812/-cardcount-/actions/runs?per_page=1` : `"status": "completed", "conclusion": "success"`.

- [ ] **Step 5: Verify online (critère de sortie)**

Netlify redéploie automatiquement après le push. Demander à l'utilisateur d'ouvrir `https://cardcountj.netlify.app` et de jouer une session palier 1 de bout en bout (WebFetch ne rend pas le JS — la vérification humaine fait foi).

---

## Vérification de fin de phase

1. Gates locaux verts (lint, typecheck, format, tests, coverage ≥ 80 %, build).
2. CI GitHub Actions verte sur `main`.
3. `https://cardcountj.netlify.app` : session de drill jouable sans compte — défilement, saisie, feedback, rejeu, XP persistée après rechargement (localStorage).
4. Zéro texte en dur (toutes les chaînes dans `fr.json`).
5. Aucun appel réseau (Supabase importé nulle part dans `src/features/`).
