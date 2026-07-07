import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { startCheckout } from '../../lib/billingApi'

export function PaywallPanel({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation()
  const [error, setError] = useState(false)

  const subscribe = async (plan: 'monthly' | 'yearly') => {
    setError(false)
    try {
      const url = await startCheckout(plan)
      window.location.assign(url)
    } catch {
      setError(true)
    }
  }

  return (
    <section aria-label={t('billing.title')}>
      <h2>{t('billing.title')}</h2>
      <p>{t('billing.quotaReached')}</p>
      <button type="button" onClick={() => void subscribe('monthly')}>
        {t('billing.monthly')}
      </button>
      <button type="button" onClick={() => void subscribe('yearly')}>
        {t('billing.yearly')}
      </button>
      {onClose && (
        <button type="button" onClick={onClose}>
          {t('billing.close')}
        </button>
      )}
      {error && <p role="alert">{t('billing.error')}</p>}
    </section>
  )
}
