import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { migrateAnonymousProgress } from './lib/profileApi'
import { fetchSubscriptionStatus } from './lib/billingApi'
import { AuthPanel } from './features/auth/AuthPanel'
import { useAuthStore } from './features/auth/authStore'
import { DrillScreen } from './features/drill/DrillScreen'
import { useProfileStore } from './features/drill/profileStore'
import { useServerProfileStore } from './features/drill/serverProfileStore'
import { useSubscriptionStore } from './features/billing/subscriptionStore'

function App() {
  const { t } = useTranslation()
  const isAuthenticated = useAuthStore(
    (state) => state.status === 'authenticated',
  )
  const setStatus = useSubscriptionStore((state) => state.setStatus)

  useEffect(() => {
    if (isAuthenticated) {
      void fetchSubscriptionStatus().then(setStatus)
    }
  }, [isAuthenticated, setStatus])

  const handleSignedUp = () => {
    const anonXp = useProfileStore.getState().xpTotal
    void migrateAnonymousProgress(anonXp).then((profile) => {
      useServerProfileStore.getState().setProfile(profile)
      useProfileStore.setState({ xpTotal: 0, successesByTier: {} })
    })
  }

  return (
    <>
      <h1>{t('app.title')}</h1>
      <AuthPanel onSignedUp={handleSignedUp} />
      <DrillScreen />
    </>
  )
}

export default App
