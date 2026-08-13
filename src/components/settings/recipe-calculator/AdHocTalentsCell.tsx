import { useMemo } from 'react'
import type { Store } from 'tinybase'

import type { TalentRow } from '@/components/price-calculator/build-options/skills-types'
import { TalentChipView } from '@/components/price-calculator/build-options/TalentChipView'
import { useLocalization } from '@/hooks/use-localization'
import { getGameDataIndexes } from '@/lib/game-data-indexes'
import type { GetNameFn } from '@/lib/recipe-modifiers'

import type { AdHocTalentStates } from './adhoc-recipe-calc'

interface Props {
  gameDataStore: Store
  skillId: string
  skillLevel: number
  getName: GetNameFn
  talentStates: AdHocTalentStates
  onTalentChange: (talentId: string, state: { enabled: boolean; level: number }) => void
}

// Same chip UI as the Skills panel (TalentChipView), but driven by the dialog's
// local talent state instead of the build store. Only talents unlocked at the
// chosen skill level are shown, mirroring TalentsCell's filtering.
export function AdHocTalentsCell({
  gameDataStore,
  skillId,
  skillLevel,
  getName,
  talentStates,
  onTalentChange,
}: Props) {
  const { compare } = useLocalization()

  const talents = useMemo<TalentRow[]>(() => {
    if (!skillId) return []
    const details = getGameDataIndexes(gameDataStore).talentDetailsBySkillId.get(skillId) ?? []
    return details
      .filter((tl) => tl.level <= skillLevel)
      .map((tl) => ({
        id: tl.id,
        userTalentId: '',
        name: getName('talent', tl.id) || tl.name,
        description: getName('talentDescription', tl.id),
        talentGroupName: tl.talentGroupName,
        level: tl.level,
        isLevelable: tl.isLevelable,
        maxTalentLevel: tl.maxTalentLevel,
      }))
      .sort((a, b) => a.level - b.level || compare(a.name, b.name))
  }, [gameDataStore, skillId, skillLevel, getName, compare])

  if (talents.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1">
      {talents.map((talent) => {
        const state = talentStates[talent.id]
        return (
          <TalentChipView
            key={talent.id}
            talent={talent}
            enabled={!!state?.enabled}
            talentLevel={state?.level ?? 0}
            onToggle={(talentId, _ut, enable) =>
              onTalentChange(talentId, { enabled: enable, level: 0 })
            }
            onSetLevel={(talentId, _ut, level) =>
              onTalentChange(talentId, { enabled: level > 0, level })
            }
          />
        )
      })}
    </div>
  )
}
