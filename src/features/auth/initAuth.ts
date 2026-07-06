import { getCurrentUserId, onAuthChange } from '../../lib/authClient'
import { useAuthStore } from './authStore'

// Appelé une fois au démarrage (main.tsx). Hydrate le store depuis la session
// Supabase puis reste synchronisé. Retourne un désabonnement.
export async function initAuth(): Promise<() => void> {
  const userId = await getCurrentUserId()
  useAuthStore.getState().setUser(userId)
  return onAuthChange((id) => useAuthStore.getState().setUser(id))
}
