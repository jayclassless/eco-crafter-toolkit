import { useMemo } from 'react'

import { SELF_IMPROVEMENT_SKILL_NAME } from '@/lib/game-constants'
import { useStores } from '@/stores/providers'

import { useStoreRevision } from './use-store-revision'

const BUILD_TABLES = ['userSkills', 'userTalents'] as const

interface StarCost {
  total: number
  skillCost: number
  talentCost: number
  skillCount: number
  talentCount: number
  // True when the dataset behaves like v13: at least one skill carries a
  // per-skill SpecialtyCost > 1. Pre-v13 datasets uniformly default to 1, so
  // the presence of any non-default value is the definitive signal — we don't
  // rely on a game version number.
  isV13: boolean
}

export function useStarCost(buildId: string, datasetId: string): StarCost {
  const { buildStore, gameDataStore } = useStores()
  const rev = useStoreRevision(buildStore, BUILD_TABLES)

  const isV13 = useMemo(() => {
    for (const rowId of gameDataStore.getRowIds('skills')) {
      const skill = gameDataStore.getRow('skills', rowId)
      if (skill.datasetId !== datasetId) continue
      if (((skill.specialtyCost as number) ?? 1) > 1) return true
    }
    return false
  }, [datasetId, gameDataStore])

  return useMemo<StarCost>(() => {
    let skillCount = 0
    let specialtySum = 0
    for (const rowId of buildStore.getRowIds('userSkills')) {
      const row = buildStore.getRow('userSkills', rowId)
      if (row.buildId !== buildId) continue
      const skill = gameDataStore.getRow('skills', row.skillId as string)
      if (!skill || !skill.name) continue
      if (skill.name === SELF_IMPROVEMENT_SKILL_NAME) continue
      skillCount += 1
      specialtySum += (skill.specialtyCost as number) ?? 1
    }

    let talentCount = 0
    let talentCost = 0
    if (isV13) {
      for (const rowId of buildStore.getRowIds('userTalents')) {
        const row = buildStore.getRow('userTalents', rowId)
        if (row.buildId !== buildId) continue
        if (row.enabled !== true) continue
        const talent = gameDataStore.getRow('talents', row.talentId as string)
        if (!talent || !talent.id) continue
        talentCount += 1
        if (talent.isLevelable === true) {
          talentCost += (row.talentLevel as number) ?? 0
        } else {
          talentCost += 1
        }
      }
    }

    const skillCost = isV13 ? specialtySum + (skillCount * (skillCount - 1)) / 2 : skillCount
    const total = isV13 ? skillCost + talentCost : skillCount

    return { total, skillCost, talentCost, skillCount, talentCount, isV13 }
    // rev is the invalidation key for any buildStore change in userSkills /
    // userTalents (including cell edits like talentLevel).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev, buildId, datasetId, buildStore, gameDataStore, isV13])
}
