import { useTranslation } from 'react-i18next'
import { highestUnlockedTier, TIERS } from '../../engine'
import { useProfileStore } from './profileStore'

export function TierPicker({
  selected,
  onSelect,
}: {
  selected: number
  onSelect: (tier: number) => void
}) {
  const { t } = useTranslation()
  const successesByTier = useProfileStore((state) => state.successesByTier)
  const maxUnlocked = highestUnlockedTier(successesByTier)

  return (
    <fieldset>
      <legend>{t('drill.pickTier')}</legend>
      {TIERS.map((tierConfig) => {
        const isLocked = tierConfig.tier > maxUnlocked
        const label = t(isLocked ? 'drill.tierLocked' : 'drill.tier', {
          tier: tierConfig.tier,
        })
        return (
          <label key={tierConfig.tier}>
            <input
              type="radio"
              name="tier"
              value={tierConfig.tier}
              checked={selected === tierConfig.tier}
              disabled={isLocked}
              onChange={() => onSelect(tierConfig.tier)}
              aria-label={label}
            />
            {label}
          </label>
        )
      })}
    </fieldset>
  )
}
