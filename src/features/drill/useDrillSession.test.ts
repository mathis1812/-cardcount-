import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { getTierConfig, runningCount, type SessionResult } from '../../engine'
import { useDrillSession } from './useDrillSession'

describe('useDrillSession', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('démarre à zéro puis révèle une carte par tick de speedMs', () => {
    const { result } = renderHook(() => useDrillSession())
    act(() => result.current.start(getTierConfig(1), 42))
    expect(result.current.session?.position).toBe(0)
    act(() => vi.advanceTimersByTime(1200))
    expect(result.current.session?.position).toBe(1)
    act(() => vi.advanceTimersByTime(1200 * 5))
    expect(result.current.session?.position).toBe(6)
  })

  test('atteint awaiting-final après la dernière carte et le timer s’arrête', () => {
    const { result } = renderHook(() => useDrillSession())
    act(() => result.current.start(getTierConfig(1), 42))
    act(() => vi.advanceTimersByTime(1200 * 20))
    expect(result.current.session?.phase).toBe('awaiting-final')
    act(() => vi.advanceTimersByTime(1200 * 10))
    expect(result.current.session?.position).toBe(20) // plus aucune révélation
  })

  test('s’arrête au checkpoint puis reprend après submitCheckpoint (palier 6)', () => {
    const { result } = renderHook(() => useDrillSession())
    act(() => result.current.start(getTierConfig(6), 42)) // checkpoints à 17 et 34
    act(() => vi.advanceTimersByTime(700 * 17))
    expect(result.current.session?.phase).toBe('awaiting-checkpoint')
    act(() => vi.advanceTimersByTime(700 * 5))
    expect(result.current.session?.position).toBe(17) // gelé pendant la question
    act(() => result.current.submitCheckpoint(0))
    expect(result.current.session?.phase).toBe('running')
    act(() => vi.advanceTimersByTime(700))
    expect(result.current.session?.position).toBe(18)
  })

  test('submitFinal retourne le résultat et l’expose via result', () => {
    const { result } = renderHook(() => useDrillSession())
    act(() => result.current.start(getTierConfig(1), 42))
    act(() => vi.advanceTimersByTime(1200 * 20))
    const expected = runningCount(result.current.session?.cards ?? [])
    let returned: SessionResult | null = null
    act(() => {
      returned = result.current.submitFinal(expected)
    })
    expect((returned as SessionResult | null)?.correct).toBe(true)
    expect(result.current.result?.correct).toBe(true)
  })

  test('reset repart à l’état vide', () => {
    const { result } = renderHook(() => useDrillSession())
    act(() => result.current.start(getTierConfig(1), 42))
    act(() => result.current.reset())
    expect(result.current.session).toBeNull()
    expect(result.current.result).toBeNull()
  })
})
