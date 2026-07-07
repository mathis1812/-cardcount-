import { useTranslation } from 'react-i18next'
import { migrateAnonymousProgress } from './lib/profileApi'
import { AuthPanel } from './features/auth/AuthPanel'
import { DrillScreen } from './features/drill/DrillScreen'
import { useProfileStore } from './features/drill/profileStore'
import { useServerProfileStore } from './features/drill/serverProfileStore'

function App() {
  const { t } = useTranslation()

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
