import { create } from 'zustand'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface AuthState {
  readonly userId: string | null
  readonly status: AuthStatus
  setUser: (userId: string | null) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  status: 'loading',
  setUser: (userId) =>
    set({ userId, status: userId ? 'authenticated' : 'anonymous' }),
}))
