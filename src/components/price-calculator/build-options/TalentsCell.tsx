import { memo, useMemo } from 'react'
import type { Store } from 'tinybase'

import { useCellValue } from '@/hooks/use-store-revision'

import type { TalentRow } from './skills-types'
import { TalentChip } from './TalentChip'

interface Props {
  buildStore: Store
  userSkillId: string
  talents: TalentRow[]
  onToggle: (talentId: string, userTalentId: string, enable: boolean) => void
  onSetLevel: (talentId: string, userTalentId: string, level: number) => void
}

// Subscribes to the userSkill's level (for filtering) and renders a chip
// per available talent. Each chip subscribes to its own userTalents row via
// `TalentChip`. View-model is stable across level/enabled edits.
export const TalentsCell = memo(function TalentsCell({
  buildStore,
  userSkillId,
  talents,
  onToggle,
  onSetLevel,
}: Props) {
  const level = useCellValue<number>(buildStore, 'userSkills', userSkillId, 'level') ?? 1
  const available = useMemo(() => talents.filter((t) => t.level <= level), [talents, level])
  if (available.length === 0) return null
  return (
    <div className="flex gap-1">
      {available.map((talent) => (
        <TalentChip
          key={talent.id}
          buildStore={buildStore}
          talent={talent}
          onToggle={onToggle}
          onSetLevel={onSetLevel}
        />
      ))}
    </div>
  )
})
