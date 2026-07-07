import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  computeXp,
  currentCard,
  getTierConfig,
  levelFromXp,
} from '../../engine'
import { recordDrillSession } from '../../lib/profileApi'
import {
  startDrillSession,
  QuotaExceededError,
  openBillingPortal,
} from '../../lib/billingApi'
import { useAuthStore } from '../auth/authStore'
import { useSubscriptionStore } from '../billing/subscriptionStore'
import { PaywallPanel } from '../billing/PaywallPanel'
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
  const isPremium = useSubscriptionStore((state) => state.isPremium)
  const [showPaywall, setShowPaywall] = useState(false)

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

  const handleStart = async () => {
    if (isAuthenticated) {
      try {
        await startDrillSession()
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          setShowPaywall(true)
          return
        }
        throw err
      }
    }
    start(getTierConfig(selectedTier))
  }

  return (
    <main>
      <header>
        <p>{t('drill.level', { level: displayedLevel })}</p>
        <p>{t('drill.xpTotal', { xp: displayedXp })}</p>
        {isAuthenticated && serverProfile && (
          <p>{t('drill.streak', { days: serverProfile.currentStreak })}</p>
        )}
        {isPremium && (
          <>
            <span>{t('billing.premiumBadge')}</span>
            <button
              type="button"
              onClick={() =>
                void openBillingPortal().then((u) => window.location.assign(u))
              }
            >
              {t('billing.manage')}
            </button>
          </>
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
      ) : showPaywall ? (
        <PaywallPanel onClose={() => setShowPaywall(false)} />
      ) : !session ? (
        <>
          <TierPicker selected={selectedTier} onSelect={setSelectedTier} />
          <button type="button" onClick={() => void handleStart()}>
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
