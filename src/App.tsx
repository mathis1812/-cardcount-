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
