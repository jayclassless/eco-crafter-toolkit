import { Button } from 'primereact/button'
import { MultiSelect } from 'primereact/multiselect'
import { memo, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SkillMultiSelect } from '@/components/common/SkillMultiSelect'
import type { SkillSelectOption } from '@/lib/skill-options'

import type { FurnishingFilterOptions } from './housing-data'
import { ALL_SELECTED, type FurnishingFilterState, type RoomCategoryView } from './housing-types'
import { RoomCategoryLabel } from './RoomCategoryLabel'

interface Props {
  options: FurnishingFilterOptions
  skills: SkillSelectOption[]
  value: FurnishingFilterState
  onChange: (next: FurnishingFilterState) => void
}

// Selecting everything is the same as no filter, so normalize back to null —
// otherwise the filter would pin a stale set of ids when the dataset changes.
const normalize = <T,>(next: T[], all: number): T[] | null => (next.length === all ? null : next)

// The three filters above the furnishings table. Each shows a fixed label
// rather than listing its selection: the lists run to 30 entries, so a
// selection summary either truncates uninformatively or resizes the control on
// every change. The Reset button is what signals that a filter is active.
function FurnishingFiltersImpl({ options, skills, value, onChange }: Props) {
  const { t } = useTranslation()

  // Memoized so PrimeReact's MultiSelect sees a stable `value` array and
  // doesn't re-render its whole option list on unrelated parent renders.
  const categoryNames = useMemo(() => options.categories.map((c) => c.name), [options.categories])

  const selectedCategories = value.categories ?? categoryNames
  const selectedTypes = value.types ?? options.types
  const isFiltered = !!(value.categories || value.types || value.skillIds)

  const categoryTemplate = useCallback(
    (opt: RoomCategoryView) =>
      opt ? <RoomCategoryLabel displayName={opt.displayName} color={opt.color} /> : null,
    []
  )

  const onSkillsChange = useCallback(
    (skillIds: string[] | null) => onChange({ ...value, skillIds }),
    [onChange, value]
  )

  return (
    <div className="flex align-items-center gap-2 flex-wrap mb-2">
      <MultiSelect
        value={selectedCategories}
        options={options.categories}
        optionLabel="displayName"
        optionValue="name"
        onChange={(e) =>
          onChange({
            ...value,
            categories: normalize(e.value as string[], options.categories.length),
          })
        }
        itemTemplate={categoryTemplate}
        placeholder={t('housingScore.filters.categoryPlaceholder')}
        aria-label={t('housingScore.filters.category')}
        // 0 means "never list the selection" — always show the fixed label.
        maxSelectedLabels={0}
        selectedItemsLabel={t('housingScore.filters.categoryPlaceholder')}
        style={{ width: '13rem' }}
      />
      <MultiSelect
        value={selectedTypes}
        options={options.types}
        onChange={(e) =>
          onChange({ ...value, types: normalize(e.value as string[], options.types.length) })
        }
        placeholder={t('housingScore.filters.typePlaceholder')}
        aria-label={t('housingScore.filters.type')}
        maxSelectedLabels={0}
        selectedItemsLabel={t('housingScore.filters.typePlaceholder')}
        filter
        style={{ width: '13rem' }}
      />
      <SkillMultiSelect
        options={skills}
        value={value.skillIds}
        onChange={onSkillsChange}
        placeholder={t('housingScore.filters.skillPlaceholder')}
        ariaLabel={t('housingScore.filters.skill')}
        style={{ width: '13rem' }}
      />
      {isFiltered && (
        <Button
          text
          size="small"
          icon="pi pi-filter-slash"
          label={t('housingScore.filters.reset')}
          onClick={() => onChange(ALL_SELECTED)}
        />
      )}
    </div>
  )
}

export const FurnishingFilters = memo(FurnishingFiltersImpl)
