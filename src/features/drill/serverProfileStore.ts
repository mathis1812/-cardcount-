import { create } from 'zustand'
import type { ServerProfile } from '../../lib/profileApi'

export interface ServerProfileState {
  readonly profile: ServerProfile | null
  setProfile: (profile: ServerProfile | null) => void
}

export const useServerProfileStore = create<ServerProfileState>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
}))
