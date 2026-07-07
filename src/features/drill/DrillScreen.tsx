import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  computeXp,
  currentCard,
  getTierConfig,
  levelFromXp,
} from '../../engine'
import { recordDrillSession } from '../../lib/profileApi'
import { useAuthStore } from '../auth/authStore'
import { CardView } from './CardView'
import { CountInput } from './CountInput'
import { useDrillSession } from './useDrillSession'
import { useProfileStore } from './profileStore'
import { useServerProfileStore } from './serverProfileStore'
import { ReplayPanel } from './ReplayPanel'
import { ResultsPanel } from './ResultsPanel'
import { TierPicker } from './TierPicker'

export function DrillScreen() {
  const { t } = useTranslation()
  const [selectedTier, setSelectedTier] = useState(1)
  const [xpEarned, setXpEarned] = useState(0)
  const { session, result, start, submitCheckpoint, submitFinal, reset } =
    useDrillSession()

  const isAuthenticated = useAuthStore(
    (state) => state.status === 'authenticated',
  )
  const localXpTotal = useProfileStore((state) => state.xpTotal)
  const recordLocalSession = useProfileStore((state) => state.recordSession)
  const serverProfile = useServerProfileStore((state) => state.profile)
  const setServerProfile = useServerProfileStore((state) => state.setProfile)

  const displayedXp = isAuthenticated
    ? (serverProfile?.xpTotal ?? 0)
    : localXpTotal
  const displayedLevel = isAuthenticated
    ? (serverProfile?.level ?? 1)
    : levelFromXp(localXpTotal)

  const handleFinal = (given: number) => {
    if (!session) {
      return
    }
    const sessionResult = submitFinal(given)
    if (!sessionResult) {
      return
    }
    const xp = computeXp({
      xpBase: session.config.xpBase,
      correct: sessionResult.correct,
      accuracy: sessionResult.accuracy,
      streakActive: false,
    })
    setXpEarned(xp)
    if (isAuthenticated) {
      void recordDrillSession({
        tier: session.config.tier,
        correct: sessionResult.correct,
        accuracy: sessionResult.accuracy,
        cardsSeen: sessionResult.cardsSeen,
        durationMs: sessionResult.cardsSeen * session.config.speedMs,
        xpEarned: xp,
        difficulty: {
          tier: session.config.tier,
          speedMs: session.config.speedMs,
          deckCount: session.config.deckCount,
          cardsCount: session.config.cardsCount,
        },
      }).then(setServerProfile)
    } else {
      recordLocalSession({
        tier: session.config.tier,
        correct: sessionResult.correct,
        xpEarned: xp,
      })
    }
  }

  return (
    <main>
      <header>
        <p>{t('drill.level', { level: displayedLevel })}</p>
        <p>{t('drill.xpTotal', { xp: displayedXp })}</p>
        {isAuthenticated && serverProfile && (
          <p>{t('drill.streak', { days: serverProfile.currentStreak })}</p>
        )}
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
