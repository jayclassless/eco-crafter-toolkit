import { type AutoCompleteCompleteEvent } from 'primereact/autocomplete'
import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Panel } from 'primereact/panel'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  GroupedAutoComplete,
  type GroupedAutoCompleteGroup,
} from '@/components/common/GroupedAutoComplete'
import { SkillIcon } from '@/components/common/SkillIcon'
import { useLocalization } from '@/hooks/use-localization'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { useSkillManagement } from '@/hooks/use-skill-management'
import { useStarCost } from '@/hooks/use-star-cost'
import { useTableRowIdsRevision } from '@/hooks/use-store-revision'
import { SELF_IMPROVEMENT_SKILL_NAME } from '@/lib/game-constants'
import { getGameDataIndexes } from '@/lib/game-data-indexes'
import { useStores } from '@/stores/providers'

import { SkillLevelCell } from './SkillLevelCell'
import type { TalentRow, UserSkillRow } from './skills-types'
import { TalentsCell } from './TalentsCell'

// userSkills/userTalents row-id changes rebuild the view-model (skill added/
// removed). Cell edits — level changes, talent enabled toggles — are NOT in
// the view-model; the cells that display them subscribe directly, so the
// DataTable doesn't re-render on a level edit.
const BUILD_TABLES = ['userSkills', 'userTalents'] as const

interface Props {
  buildId: string
  datasetId: string
}

interface SkillOption {
  id: string
  name: string
  rawName: string
  profession: string
  specialtyCost: number
}

type SkillGroup = GroupedAutoCompleteGroup<SkillOption>

export function SkillsPanel({ buildId, datasetId }: Props) {
  const { t } = useTranslation()
  const { gameDataStore, buildStore } = useStores()
  const { getName } = useLocalizedName(datasetId)
  const { compare } = useLocalization()
  const skillMgmt = useSkillManagement(buildId, datasetId)
  const starCost = useStarCost(buildId, datasetId)
  // The total now has up to three sources, so the tooltip breaks it down. Only
  // non-zero contributors are listed — on a v11-v13 dataset that collapses back
  // to the plain total, since talents and modules both contribute 0 there.
  const starTitle = (() => {
    const headline = t('priceCalculator.config.stars', { count: starCost.total })
    const parts: string[] = []
    if (starCost.skillCost > 0) {
      parts.push(t('priceCalculator.config.starsBreakdownSkills', { count: starCost.skillCost }))
    }
    if (starCost.talentCost > 0) {
      parts.push(t('priceCalculator.config.starsBreakdownTalents', { count: starCost.talentCost }))
    }
    if (starCost.moduleCost > 0) {
      parts.push(t('priceCalculator.config.starsBreakdownModules', { count: starCost.moduleCost }))
    }
    return parts.length > 1 ? `${headline}\n${parts.join('\n')}` : headline
  })()
  const [suggestions, setSuggestions] = useState<SkillGroup[]>([])
  // Only rebuild the view-model when rows are added/removed. Cell edits
  // (level, talent enabled) are handled by `SkillLevelCell` / `TalentChip`
  // subscribing to their own cells directly.
  const rowIdsRev = useTableRowIdsRevision(buildStore, BUILD_TABLES)

  const skills = useMemo<UserSkillRow[]>(() => {
    // Game-data indexes are cached per dataset import; reading them here is
    // O(1) instead of re-scanning ~140 talents per render.
    const { talentDetailsBySkillId } = getGameDataIndexes(gameDataStore)

    // Bucket the build's userTalents by talentId once so the per-talent
    // lookup below is O(1) — replaces an inner O(N_userTalents) scan that
    // made the original loop O(skills × talents × userTalents).
    const userTalentIdByTalentId = new Map<string, string>()
    for (const utId of buildStore.getRowIds('userTalents')) {
      const ut = buildStore.getRow('userTalents', utId)
      if (ut.buildId !== buildId) continue
      userTalentIdByTalentId.set(ut.talentId as string, utId)
    }

    const rows: UserSkillRow[] = []
    for (const rowId of buildStore.getRowIds('userSkills')) {
      const row = buildStore.getRow('userSkills', rowId)
      if (row.buildId !== buildId) continue

      const skillId = row.skillId as string
      const skillRow = gameDataStore.getRow('skills', skillId)
      if (!skillRow) continue

      const skillTalents = talentDetailsBySkillId.get(skillId) ?? []
      const talents: TalentRow[] = skillTalents.map((t) => ({
        id: t.id,
        userTalentId: userTalentIdByTalentId.get(t.id) ?? '',
        name: getName('talent', t.id),
        description: getName('talentDescription', t.id),
        talentGroupName: t.talentGroupName,
        level: t.level,
        isLevelable: t.isLevelable,
        maxTalentLevel: t.maxTalentLevel,
      }))

      talents.sort((a, b) => a.level - b.level || compare(a.name, b.name))

      rows.push({
        id: rowId,
        skillId,
        name: getName('skill', skillId),
        rawName: skillRow.name as string,
        maxLevel: skillRow.maxLevel as number,
        talents,
      })
    }
    return rows
    // rowIdsRev is the invalidation key for row add/remove — the lint rule
    // can't see through it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildId, buildStore, gameDataStore, getName, rowIdsRev])

  const searchSkills = (event: AutoCompleteCompleteEvent) => {
    const query = event.query.toLowerCase()
    const existingSkillIds = new Set(skills.map((s) => s.skillId))
    const options: SkillOption[] = []

    // Build a map from raw skill name to row ID for profession name resolution
    const skillIdByName = new Map<string, string>()
    for (const rowId of gameDataStore.getRowIds('skills')) {
      const skill = gameDataStore.getRow('skills', rowId)
      if (skill.datasetId !== datasetId) continue
      skillIdByName.set(skill.name as string, rowId)
    }

    for (const rowId of gameDataStore.getRowIds('skills')) {
      const skill = gameDataStore.getRow('skills', rowId)
      if (skill.datasetId !== datasetId) continue
      if (existingSkillIds.has(rowId)) continue
      if (!skill.profession) continue // skip profession skills themselves

      const name = getName('skill', rowId)
      if (name.toLowerCase().includes(query)) {
        options.push({
          id: rowId,
          name,
          rawName: skill.name as string,
          profession: skill.profession as string,
          specialtyCost: (skill.specialtyCost as number) ?? 1,
        })
      }
    }

    const grouped = new Map<string, { label: string; rawName: string; items: SkillOption[] }>()
    for (const opt of options) {
      const profRaw = opt.profession
      if (!grouped.has(profRaw)) {
        const profRowId = skillIdByName.get(profRaw)
        const label = profRowId ? getName('skill', profRowId) : profRaw
        grouped.set(profRaw, { label, rawName: profRaw, items: [] })
      }
      grouped.get(profRaw)!.items.push(opt)
    }

    const groups: SkillGroup[] = [...grouped.values()]
      .sort((a, b) => compare(a.label, b.label))
      .map(({ label, rawName, items }) => ({
        profession: label,
        professionRawName: rawName,
        items: items.sort((a, b) => compare(a.name, b.name)),
      }))

    setSuggestions(groups)
  }

  // Stable callback identities — SkillLevelCell / TalentChip memos compare
  // by reference, so rebinding every render would defeat the cell subscriptions.
  const setSkillLevel = skillMgmt.setSkillLevel
  const handleLevelChange = useCallback(
    (userSkillId: string, level: number) => setSkillLevel(userSkillId, level),
    [setSkillLevel]
  )
  const toggleTalent = skillMgmt.toggleTalent
  const handleTalentToggle = useCallback(
    (talentId: string, userTalentId: string, enable: boolean) =>
      toggleTalent(talentId, userTalentId, enable),
    [toggleTalent]
  )
  const setTalentLevelFn = skillMgmt.setTalentLevel
  const handleSetTalentLevel = useCallback(
    (talentId: string, userTalentId: string, level: number) =>
      setTalentLevelFn(talentId, userTalentId, level),
    [setTalentLevelFn]
  )
  const removeSkillFn = skillMgmt.removeSkill
  const handleRemoveSkill = useCallback(
    (userSkillId: string, skillId: string) => removeSkillFn(userSkillId, skillId),
    [removeSkillFn]
  )

  // Marginal star cost of adding one more skill, mirroring `useStarCost`'s
  // total. Pre-v13 every skill is a flat 1 star. On v13+ the skill total is
  // `specialtySum + n(n-1)/2`, so going from n to n+1 skills costs the new
  // skill's own specialty cost plus n (the increase in the triangular term).
  const { isV13, skillCount } = starCost
  const starCostToAdd = useCallback(
    (option: SkillOption) => (isV13 ? option.specialtyCost + skillCount : 1),
    [isV13, skillCount]
  )

  const optionStarsTemplate = useCallback(
    (option: SkillOption) => {
      // Self Improvement is star-exempt in `useStarCost` — it costs nothing and
      // doesn't raise the triangular term for other skills — so it gets no badge
      // at all rather than a misleading number.
      if (option.rawName === SELF_IMPROVEMENT_SKILL_NAME) return null
      const count = starCostToAdd(option)
      return (
        <span
          className="white-space-nowrap"
          title={t('priceCalculator.config.starsToAddSkill', { count })}
        >
          <i className="pi pi-star-fill mr-1" style={{ color: 'var(--yellow-500)' }} />
          {count}
        </span>
      )
    },
    [starCostToAdd, t]
  )

  const nameTemplate = useCallback(
    (row: UserSkillRow) => (
      <div className="flex align-items-center gap-2">
        <SkillIcon skill={{ name: row.rawName }} />
        <span>{row.name}</span>
      </div>
    ),
    []
  )

  const levelTemplate = useCallback(
    (row: UserSkillRow) => (
      <SkillLevelCell
        buildStore={buildStore}
        userSkillId={row.id}
        maxLevel={row.maxLevel}
        onChange={handleLevelChange}
      />
    ),
    [buildStore, handleLevelChange]
  )

  const talentTemplate = useCallback(
    (row: UserSkillRow) => (
      <TalentsCell
        buildStore={buildStore}
        userSkillId={row.id}
        talents={row.talents}
        onToggle={handleTalentToggle}
        onSetLevel={handleSetTalentLevel}
      />
    ),
    [buildStore, handleTalentToggle, handleSetTalentLevel]
  )

  const deleteTemplate = useCallback(
    (row: UserSkillRow) => (
      <Button
        icon="pi pi-trash"
        severity="danger"
        text
        size="small"
        onClick={() => handleRemoveSkill(row.id, row.skillId)}
      />
    ),
    [handleRemoveSkill]
  )

  return (
    <Panel
      headerTemplate={(options) => (
        <div className={`${options.className} justify-content-between`}>
          <span className={options.titleClassName}>
            {t('priceCalculator.config.skillsCount', { count: skills.length })}
          </span>
          <span
            className="ml-auto mr-2"
            title={starTitle}
            aria-label={t('priceCalculator.config.stars', { count: starCost.total })}
          >
            <i className="pi pi-star-fill mr-1" style={{ color: 'var(--yellow-500)' }} />
            {starCost.total}
          </span>
          {options.togglerElement}
        </div>
      )}
      toggleable
    >
      <GroupedAutoComplete
        placeholder={t('priceCalculator.config.addSkill')}
        suggestions={suggestions}
        completeMethod={searchSkills}
        onSelect={(item) => skillMgmt.addSkill(item.id)}
        itemEndTemplate={optionStarsTemplate}
      />
      {skills.length > 0 && (
        <DataTable value={skills} size="small" showGridlines={false}>
          <Column header={t('priceCalculator.config.skills')} body={nameTemplate} />
          <Column
            header={t('priceCalculator.config.level')}
            body={levelTemplate}
            style={{ width: '5rem' }}
          />
          <Column header={t('priceCalculator.config.talents')} body={talentTemplate} />
          <Column body={deleteTemplate} style={{ width: '3rem' }} />
        </DataTable>
      )}
    </Panel>
  )
}
