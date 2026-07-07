import { beforeEach, describe, expect, test } from 'vitest'
import { useServerProfileStore } from './serverProfileStore'

describe('useServerProfileStore', () => {
  beforeEach(() => {
    useServerProfileStore.setState({ profile: null })
  })

  test('état initial : profil null', () => {
    expect(useServerProfileStore.getState().profile).toBeNull()
  })

  test('setProfile enregistre le profil serveur', () => {
    useServerProfileStore.getState().setProfile({
      xpTotal: 30,
      level: 1,
      currentStreak: 2,
      longestStreak: 4,
    })
    expect(useServerProfileStore.getState().profile).toEqual({
      xpTotal: 30,
      level: 1,
      currentStreak: 2,
      longestStreak: 4,
    })
  })
})
