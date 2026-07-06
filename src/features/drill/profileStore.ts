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
    {
      name: 'cardcount-profile',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
