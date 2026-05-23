import { memo } from 'react'
import type { Store } from 'tinybase'

import { useCellValue } from '@/hooks/use-store-revision'

import type { TalentRow } from './skills-types'
import { TalentChipView } from './TalentChipView'

interface Props {
  buildStore: Store
  talent: TalentRow
  onToggle: (talentId: string, userTalentId: string, enable: boolean) => void
  onSetLevel: (talentId: string, userTalentId: string, level: number) => void
}

// Subscribes to its own userTalents.enabled cell so toggling one talent only
// re-renders this single chip, then defers to the presentational TalentChipView.
export const TalentChip = memo(function TalentChip({
  buildStore,
  talent,
  onToggle,
  onSetLevel,
}: Props) {
  const enabled =
    useCellValue<boolean>(buildStore, 'userTalents', talent.userTalentId, 'enabled') ?? false
  const talentLevel =
    useCellValue<number>(buildStore, 'userTalents', talent.userTalentId, 'talentLevel') ?? 0

  return (
    <TalentChipView
      talent={talent}
      enabled={enabled}
      talentLevel={talentLevel}
      onToggle={onToggle}
      onSetLevel={onSetLevel}
    />
  )
})
