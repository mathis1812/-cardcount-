import { create } from 'zustand'

export interface SubscriptionState {
  readonly isPremium: boolean
  readonly plan: 'monthly' | 'yearly' | null
  setStatus: (status: {
    isPremium: boolean
    plan: 'monthly' | 'yearly' | null
  }) => void
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  isPremium: false,
  plan: null,
  setStatus: ({ isPremium, plan }) => set({ isPremium, plan }),
}))
