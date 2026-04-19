import { type AutoCompleteCompleteEvent } from 'primereact/autocomplete'
import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { InputNumber, type InputNumberValueChangeEvent } from 'primereact/inputnumber'
import { Panel } from 'primereact/panel'
import { Tooltip } from 'primereact/tooltip'
import { memo, useCallback, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Store } from 'tinybase'

import { EcoIcon } from '@/components/common/EcoIcon'
import {
  GroupedAutoComplete,
  type GroupedAutoCompleteGroup,
} from '@/components/common/GroupedAutoComplete'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { useSkillManagement } from '@/hooks/use-skill-management'
import { useCellValue, useTableRowIdsRevision } from '@/hooks/use-store-revision'
import { useStores } from '@/stores/providers'

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
}

type SkillGroup = GroupedAutoCompleteGroup<SkillOption>

interface TalentRow {
  id: string
  userTalentId: string
  name: string
  talentGroupName: string
  level: number
  isLevelable: boolean
  maxTalentLevel: number
}

interface UserSkillRow {
  id: string
  skillId: string
  name: string
  rawName: string
  maxLevel: number
  talents: TalentRow[]
}

// Subscribes to its own userSkills.level cell so typing in the InputNumber
// re-renders only this one component — no DataTable rebuild. Memoized on
// userSkillId so unrelated parent re-renders also skip.
const SkillLevelCell = memo(function SkillLevelCell({
  buildStore,
  userSkillId,
  maxLevel,
  onChange,
}: {
  buildStore: Store
  userSkillId: string
  maxLevel: number
  onChange: (userSkillId: string, level: number) => void
}) {
  const level = useCellValue<number>(buildStore, 'userSkills', userSkillId, 'level') ?? 1
  return (
    <InputNumber
      value={level}
      onValueChange={(e: InputNumberValueChangeEvent) => onChange(userSkillId, e.value ?? 1)}
      min={1}
      max={maxLevel}
      showButtons
      size={1}
    />
  )
})

// Subscribes to the userSkill's level (for filtering) and renders a chip
// per available talent. Each chip subscribes to its own userTalents row via
// `TalentChip`. View-model is stable across level/enabled edits.
const TalentsCell = memo(function TalentsCell({
  buildStore,
  userSkillId,
  talents,
  onToggle,
  onSetLevel,
}: {
  buildStore: Store
  userSkillId: string
  talents: TalentRow[]
  onToggle: (talentId: string, userTalentId: string, enable: boolean) => void
  onSetLevel: (talentId: string, userTalentId: string, level: number) => void
}) {
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

// Subscribes to its own userTalents.enabled cell so toggling one talent only
// re-renders this single chip.
const TalentChip = memo(function TalentChip({
  buildStore,
  talent,
  onToggle,
  onSetLevel,
}: {
  buildStore: Store
  talent: TalentRow
  onToggle: (talentId: string, userTalentId: string, enable: boolean) => void
  onSetLevel: (talentId: string, userTalentId: string, level: number) => void
}) {
  const enabled =
    useCellValue<boolean>(buildStore, 'userTalents', talent.userTalentId, 'enabled') ?? false
  const talentLevel =
    useCellValue<number>(buildStore, 'userTalents', talent.userTalentId, 'talentLevel') ?? 0
  const tooltipClass = `talent-tooltip-${talent.id.replace(/[^a-zA-Z0-9]/g, '')}`

  const isLevelable = talent.isLevelable
  const active = isLevelable ? talentLevel > 0 : enabled
  const tooltipContent = isLevelable
    ? `${talent.name} (level ${talentLevel}/${talent.maxTalentLevel})\n\n(click to increase, shift/right-click to decrease)`
    : talent.name

  const handleClick = (e: ReactMouseEvent) => {
    if (isLevelable) {
      if (e.shiftKey) {
        onSetLevel(talent.id, talent.userTalentId, Math.max(0, talentLevel - 1))
      } else {
        // Wrap to 0 after max so the chip can be turned off via clicks alone.
        const next = talentLevel >= talent.maxTalentLevel ? 0 : talentLevel + 1
        onSetLevel(talent.id, talent.userTalentId, next)
      }
    } else {
      onToggle(talent.id, talent.userTalentId, !enabled)
    }
  }

  const handleContextMenu = (e: ReactMouseEvent) => {
    if (!isLevelable) return
    e.preventDefault()
    onSetLevel(talent.id, talent.userTalentId, Math.max(0, talentLevel - 1))
  }

  return (
    <div
      className={tooltipClass}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      style={{
        position: 'relative',
        cursor: 'pointer',
        opacity: active ? 1 : 0.3,
        transition: 'opacity 0.15s',
      }}
    >
      <EcoIcon name={talent.talentGroupName} size={24} />
      {isLevelable && talentLevel > 0 && (
        <span
          style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            background: 'var(--primary-color)',
            color: 'var(--primary-color-text)',
            borderRadius: '999px',
            fontSize: '0.6rem',
            lineHeight: 1,
            padding: '2px 4px',
            fontWeight: 600,
            pointerEvents: 'none',
          }}
        >
          {talentLevel}
        </span>
      )}
      <Tooltip
        target={`.${tooltipClass}`}
        content={tooltipContent}
        position="top"
        style={{ whiteSpace: 'pre-line' }}
      />
    </div>
  )
})

export function SkillsPanel({ buildId, datasetId }: Props) {
  const { t } = useTranslation()
  const { gameDataStore, buildStore } = useStores()
  const { getName } = useLocalizedName(datasetId)
  const skillMgmt = useSkillManagement(buildId, datasetId)
  const [suggestions, setSuggestions] = useState<SkillGroup[]>([])
  // Only rebuild the view-model when rows are added/removed. Cell edits
  // (level, talent enabled) are handled by `SkillLevelCell` / `TalentChip`
  // subscribing to their own cells directly.
  const rowIdsRev = useTableRowIdsRevision(buildStore, BUILD_TABLES)

  const skills = useMemo<UserSkillRow[]>(() => {
    const rows: UserSkillRow[] = []
    for (const rowId of buildStore.getRowIds('userSkills')) {
      const row = buildStore.getRow('userSkills', rowId)
      if (row.buildId !== buildId) continue

      const skillId = row.skillId as string
      const skillRow = gameDataStore.getRow('skills', skillId)
      if (!skillRow) continue

      const talents: TalentRow[] = []
      for (const tRowId of gameDataStore.getRowIds('talents')) {
        const talent = gameDataStore.getRow('talents', tRowId)
        if (talent.skillId !== skillId) continue

        let userTalentId = ''
        for (const utId of buildStore.getRowIds('userTalents')) {
          const ut = buildStore.getRow('userTalents', utId)
          if (ut.buildId === buildId && ut.talentId === talent.id) {
            userTalentId = utId
            break
          }
        }

        talents.push({
          id: talent.id as string,
          userTalentId,
          name: getName('talent', talent.id as string),
          talentGroupName: talent.talentGroupName as string,
          level: talent.level as number,
          isLevelable: (talent.isLevelable as boolean) ?? false,
          maxTalentLevel: (talent.maxTalentLevel as number) ?? 0,
        })
      }

      talents.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))

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
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(({ label, rawName, items }) => ({
        profession: label,
        professionRawName: rawName,
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
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
    (userSkillId: string, skillId: string) =>
      removeSkillFn(userSkillId, skillId, getName('skill', skillId)),
    [removeSkillFn, getName]
  )

  const nameTemplate = useCallback(
    (row: UserSkillRow) => (
      <div className="flex align-items-center gap-2">
        <EcoIcon name={row.rawName} size={20} />
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
    <Panel header={t('priceCalculator.config.skillsCount', { count: skills.length })} toggleable>
      <GroupedAutoComplete
        placeholder={t('priceCalculator.config.addSkill')}
        suggestions={suggestions}
        completeMethod={searchSkills}
        onSelect={(item) => skillMgmt.addSkill(item.id)}
      />
      {skills.length > 0 && (
        <DataTable value={skills} size="small" showGridlines={false}>
          <Column header={t('priceCalculator.config.skills')} body={nameTemplate} />
          <Column
            header={t('priceCalculator.config.level')}
            body={levelTemplate}
            style={{ width: '8rem' }}
          />
          <Column header={t('priceCalculator.config.talents')} body={talentTemplate} />
          <Column body={deleteTemplate} style={{ width: '3rem' }} />
        </DataTable>
      )}
    </Panel>
  )
}
