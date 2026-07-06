import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  computeXp,
  currentCard,
  getTierConfig,
  levelFromXp,
} from '../../engine'
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
          <button
            type="button"
            onClick={() => start(getTierConfig(selectedTier))}
          >
            {t('drill.start')}
          </button>
        </>
      ) : session.phase === 'awaiting-checkpoint' ? (
        <CountInput
          label={t('drill.checkpointPrompt')}
          onSubmit={submitCheckpoint}
        />
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
