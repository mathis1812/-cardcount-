import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  fetchProfile,
  migrateAnonymousProgress,
  recordDrillSession,
} from './profileApi'
import { getSupabase } from './supabase'

vi.mock('./supabase', () => ({ getSupabase: vi.fn() }))

const rpcJson = {
  xp_total: 42,
  level: 2,
  current_streak: 3,
  longest_streak: 5,
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('fetchProfile', () => {
  test('appelle get_profile et mappe vers ServerProfile', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: rpcJson, error: null })
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never)
    await expect(fetchProfile()).resolves.toEqual({
      xpTotal: 42,
      level: 2,
      currentStreak: 3,
      longestStreak: 5,
    })
    expect(rpc).toHaveBeenCalledWith('get_profile', undefined)
  })

  test('propage l’erreur RPC', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'rls' } })
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never)
    await expect(fetchProfile()).rejects.toThrow('rls')
  })
})

describe('recordDrillSession', () => {
  test('appelle record_drill_session avec les paramètres snake_case', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: rpcJson, error: null })
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never)
    const result = await recordDrillSession({
      tier: 1,
      correct: true,
      accuracy: 1,
      cardsSeen: 20,
      durationMs: 24000,
      xpEarned: 10,
      difficulty: { tier: 1, speedMs: 1200 },
    })
    expect(result).toEqual({
      xpTotal: 42,
      level: 2,
      currentStreak: 3,
      longestStreak: 5,
    })
    expect(rpc).toHaveBeenCalledWith('record_drill_session', {
      p_tier: 1,
      p_correct: true,
      p_accuracy: 1,
      p_cards_seen: 20,
      p_duration_ms: 24000,
      p_xp_earned: 10,
      p_difficulty: { tier: 1, speedMs: 1200 },
    })
  })
})

describe('migrateAnonymousProgress', () => {
  test('appelle migrate_anonymous_progress avec p_xp', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: rpcJson, error: null })
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never)
    await migrateAnonymousProgress(120)
    expect(rpc).toHaveBeenCalledWith('migrate_anonymous_progress', {
      p_xp: 120,
    })
  })
})
