import { useCallback, useEffect, useState } from 'react'
import {
  answerCheckpoint,
  answerFinal,
  createSession,
  revealNextCard,
  type SessionResult,
  type SessionState,
  type TierConfig,
} from '../../engine'

export function useDrillSession() {
  const [session, setSession] = useState<SessionState | null>(null)
  const [result, setResult] = useState<SessionResult | null>(null)

  const start = useCallback((config: TierConfig, seed: number = Date.now()) => {
    setResult(null)
    setSession(createSession(config, seed))
  }, [])

  const isRunning = session?.phase === 'running'
  const speedMs = session?.config.speedMs

  useEffect(() => {
    if (!isRunning || speedMs === undefined) {
      return
    }
    const id = setInterval(() => {
      setSession((s) => (s && s.phase === 'running' ? revealNextCard(s) : s))
    }, speedMs)
    return () => clearInterval(id)
  }, [isRunning, speedMs])

  const submitCheckpoint = useCallback((given: number) => {
    setSession((s) =>
      s && s.phase === 'awaiting-checkpoint' ? answerCheckpoint(s, given) : s,
    )
  }, [])

  const submitFinal = useCallback(
    (given: number): SessionResult | null => {
      if (!session || session.phase !== 'awaiting-final') {
        return null
      }
      const sessionResult = answerFinal(session, given)
      setResult(sessionResult)
      return sessionResult
    },
    [session],
  )

  const reset = useCallback(() => {
    setSession(null)
    setResult(null)
  }, [])

  return { session, result, start, submitCheckpoint, submitFinal, reset }
}
