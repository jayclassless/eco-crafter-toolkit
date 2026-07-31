import { Checkbox } from 'primereact/checkbox'
import { useTranslation } from 'react-i18next'

import type { GatheringTalentState } from '@/lib/gathering-calc'

/** Which toggles apply to the current target/tool pair. Structurally matched
 * against what `availableTalents()` returns, so it stays local. */
interface AvailableTalents {
  efficiency: boolean
  strength: boolean
  empower: boolean
  luckyBreak: boolean
  deadeye: boolean
  arrowRecovery: boolean
}

interface Props {
  talents: GatheringTalentState
  available: AvailableTalents
  onChange: (talents: GatheringTalentState) => void
}

type ToggleKey = keyof AvailableTalents

const ORDER: ToggleKey[] = [
  'efficiency',
  'strength',
  'empower',
  'luckyBreak',
  'deadeye',
  'arrowRecovery',
]

// A fixed set of booleans rather than the Ad-Hoc calculator's
// Record<talentId, {enabled, level}>: none of these talents is levelable, which
// bundled-data.test.ts pins so a dataset change can't silently break the model.
export function GatheringTalentToggles({ talents, available, onChange }: Props) {
  const { t } = useTranslation()
  const visible = ORDER.filter((key) => available[key])
  if (visible.length === 0) return null

  return (
    <div className="flex flex-wrap align-items-center gap-3">
      {visible.map((key) => (
        <div key={key} className="flex align-items-center gap-2">
          <Checkbox
            inputId={`gathering-talent-${key}`}
            checked={talents[key]}
            onChange={(e) => onChange({ ...talents, [key]: !!e.checked })}
          />
          <label htmlFor={`gathering-talent-${key}`} className="text-sm cursor-pointer">
            {t(`settings.gatheringCalculator.talents.${key}`)}
          </label>
        </div>
      ))}
    </div>
  )
}
