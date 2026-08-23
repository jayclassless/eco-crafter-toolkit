import { MultiSelect } from 'primereact/multiselect'
import { type CSSProperties, memo, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { EcoIcon } from '@/components/common/EcoIcon'
import { SkillIcon } from '@/components/common/SkillIcon'
import { useLocalization } from '@/hooks/use-localization'
import {
  groupSkillOptions,
  OTHER_PROFESSION,
  type SkillSelectGroup,
  type SkillSelectOption,
} from '@/lib/skill-options'

interface Props {
  options: readonly SkillSelectOption[]
  /** `null` means "every skill", which is distinct from `[]` ("none"). */
  value: string[] | null
  onChange: (next: string[] | null) => void
  /** Fixed label for the closed control — the list runs to 40 entries, so the
   * selection is never summarized (see `maxSelectedLabels` below). */
  placeholder: string
  ariaLabel: string
  style?: CSSProperties
}

/** Stand-in glyph for the rows that represent the absence of a skill, sized to
 * match `SkillIcon` so those rows stay aligned with the icon-bearing ones. A
 * shared element rather than a component: elements are immutable, and one more
 * component in this module would break the one-component-per-file rule. */
const noSkillIcon = <i className="pi pi-ban" style={{ width: 24, textAlign: 'center' }} />

// The shared "which skills do you have?" input, used by both Housing Score
// tools. Grouped by profession like the Price Calculator's skill dropdown, with
// each skill's icon and how many items it unlocks, and the synthetic Unskilled
// entry pinned to the top for the items no recipe gates behind a skill.
function SkillMultiSelectImpl({ options, value, onChange, placeholder, ariaLabel, style }: Props) {
  const { t } = useTranslation()
  const { compare } = useLocalization()

  const groups = useMemo<SkillSelectGroup[]>(
    () => groupSkillOptions(options, compare),
    [options, compare]
  )
  // Memoized so PrimeReact's MultiSelect sees a stable `value` array and
  // doesn't re-render its whole option list on unrelated parent renders.
  const allIds = useMemo(() => options.map((o) => o.id), [options])
  const selected = value ?? allIds

  const itemTemplate = useCallback(
    (option: SkillSelectOption) =>
      option ? (
        <span className="flex align-items-center gap-2">
          {/* Unskilled has no sprite of its own. */}
          {option.rawName ? <SkillIcon skill={{ name: option.rawName }} /> : noSkillIcon}
          <span>{t('common.skillOption', { name: option.name, items: option.count })}</span>
        </span>
      ) : null,
    [t]
  )

  const groupTemplate = useCallback(
    (group: SkillSelectGroup) => (
      <div className="flex align-items-center gap-2">
        {/* `_Other` is a sentinel, not a skill, so it has no sprite to load. */}
        {group.professionRawName === OTHER_PROFESSION ? (
          noSkillIcon
        ) : (
          <EcoIcon name={group.professionRawName} size={24} />
        )}
        <span className="font-bold">{group.profession}</span>
      </div>
    ),
    []
  )

  return (
    <MultiSelect
      value={selected}
      options={groups}
      optionGroupLabel="profession"
      optionGroupChildren="items"
      optionLabel="name"
      optionValue="id"
      itemTemplate={itemTemplate}
      optionGroupTemplate={groupTemplate}
      // Selecting every skill is the same as no filter, so normalize back to
      // null — otherwise the selection would pin a stale set of ids when the
      // dataset changes.
      onChange={(e) => {
        const next = e.value as string[]
        onChange(next.length === options.length ? null : next)
      }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      filter
      // 0 means "never list the selection" — the list runs to 40 entries, so a
      // summary would resize the control on every change.
      maxSelectedLabels={0}
      selectedItemsLabel={placeholder}
      style={style}
    />
  )
}

export const SkillMultiSelect = memo(SkillMultiSelectImpl)
