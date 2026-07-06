import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { signIn, signOut, signUp } from '../../lib/authClient'
import { useAuthStore } from './authStore'

type Mode = 'signup' | 'login'

export function AuthPanel({
  onSignedUp,
}: {
  onSignedUp?: (userId: string) => void
}) {
  const { t } = useTranslation()
  const status = useAuthStore((state) => state.status)
  const [mode, setMode] = useState<Mode>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)

  if (status === 'authenticated') {
    return (
      <section aria-label={t('auth.loggedIn')}>
        <span>{t('auth.loggedIn')}</span>
        <button type="button" onClick={() => void signOut()}>
          {t('auth.logout')}
        </button>
      </section>
    )
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(false)
    try {
      if (mode === 'signup') {
        const { userId } = await signUp(email, password)
        onSignedUp?.(userId)
      } else {
        await signIn(email, password)
      }
    } catch {
      setError(true)
    }
  }

  return (
    <section>
      <div role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'signup'}
          onClick={() => setMode('signup')}
        >
          {t('auth.signupTab')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          onClick={() => setMode('login')}
        >
          {t('auth.loginTab')}
        </button>
      </div>
      <form onSubmit={handleSubmit}>
        <label>
          {t('auth.email')}
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          {t('auth.password')}
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit">
          {t(mode === 'signup' ? 'auth.submitSignup' : 'auth.submitLogin')}
        </button>
      </form>
      {error && <p role="alert">{t('auth.genericError')}</p>}
    </section>
  )
}
