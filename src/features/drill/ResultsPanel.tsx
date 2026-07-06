import { useTranslation } from 'react-i18next'
import type { SessionResult } from '../../engine'

export function ResultsPanel({
  result,
  xpEarned,
}: {
  result: SessionResult
  xpEarned: number
}) {
  const { t } = useTranslation()
  return (
    <section
      aria-label={t(result.correct ? 'drill.correct' : 'drill.incorrect')}
    >
      <h2>{t(result.correct ? 'drill.correct' : 'drill.incorrect')}</h2>
      <p>{t('drill.expected', { value: result.expectedCount })}</p>
      <p>{t('drill.given', { value: result.givenCount })}</p>
      <p>
        {t('drill.accuracy', { percent: Math.round(result.accuracy * 100) })}
      </p>
      <p>{t('drill.xpEarned', { xp: xpEarned })}</p>
    </section>
  )
}
