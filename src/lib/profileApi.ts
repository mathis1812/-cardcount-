import { getSupabase } from './supabase'

export interface ServerProfile {
  readonly xpTotal: number
  readonly level: number
  readonly currentStreak: number
  readonly longestStreak: number
}

export interface RecordSessionInput {
  readonly tier: number
  readonly correct: boolean
  readonly accuracy: number
  readonly cardsSeen: number
  readonly durationMs: number
  readonly xpEarned: number
  readonly difficulty: Record<string, unknown>
}

interface ProfileJson {
  xp_total: number
  level: number
  current_streak: number
  longest_streak: number
}

const toServerProfile = (json: ProfileJson): ServerProfile => ({
  xpTotal: json.xp_total,
  level: json.level,
  currentStreak: json.current_streak,
  longestStreak: json.longest_streak,
})

async function callRpc(
  name: string,
  args?: Record<string, unknown>,
): Promise<ServerProfile> {
  const { data, error } = await getSupabase().rpc(name, args)
  if (error) {
    throw new Error(error.message)
  }
  return toServerProfile(data as ProfileJson)
}

export function fetchProfile(): Promise<ServerProfile> {
  return callRpc('get_profile')
}

export function recordDrillSession(
  input: RecordSessionInput,
): Promise<ServerProfile> {
  return callRpc('record_drill_session', {
    p_tier: input.tier,
    p_correct: input.correct,
    p_accuracy: input.accuracy,
    p_cards_seen: input.cardsSeen,
    p_duration_ms: input.durationMs,
    p_xp_earned: input.xpEarned,
    p_difficulty: input.difficulty,
  })
}

export function migrateAnonymousProgress(
  anonXp: number,
): Promise<ServerProfile> {
  return callRpc('migrate_anonymous_progress', { p_xp: anonXp })
}
