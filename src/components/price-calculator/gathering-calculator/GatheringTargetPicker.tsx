import { Dropdown, type DropdownChangeEvent } from 'primereact/dropdown'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  GroupedSinglePicker,
  type GroupedSinglePickerGroup,
} from '@/components/common/GroupedSinglePicker'
import type { GatheringKind } from '@/lib/gathering-calc'

import type { GatheringOption, GatheringSpeciesOption } from './gathering-data'

interface PickerItem {
  id: string
  name: string
  rawName: string
}

interface Props {
  options: GatheringOption[]
  selected: GatheringOption | null
  onSelect: (itemId: string) => void
  speciesId: string
  onSelectSpecies: (speciesId: string) => void
}

const KIND_ORDER: GatheringKind[] = ['rock', 'excavatable', 'log', 'carcass']

export function GatheringTargetPicker({
  options,
  selected,
  onSelect,
  speciesId,
  onSelectSpecies,
}: Props) {
  const { t } = useTranslation()
  const [suggestions, setSuggestions] = useState<GroupedSinglePickerGroup<PickerItem>[]>([])

  // ~65 candidates across four kinds, so grouping beats a type-ahead: the user
  // can browse what is gatherable rather than having to know the name already.
  const complete = (event: { query: string }) => {
    const q = event.query.toLowerCase()
    const byKind = new Map<GatheringKind, PickerItem[]>()
    for (const o of options) {
      if (q && !o.name.toLowerCase().includes(q)) continue
      const list = byKind.get(o.kind) ?? []
      list.push({ id: o.itemId, name: o.name, rawName: o.rawName })
      byKind.set(o.kind, list)
    }
    setSuggestions(
      KIND_ORDER.filter((k) => byKind.has(k)).map((kind) => ({
        groupLabel: t(`settings.gatheringCalculator.kinds.${kind}`),
        groupRawName: '',
        items: byKind.get(kind)!,
      }))
    )
  }

  const value = selected
    ? { id: selected.itemId, name: selected.name, rawName: selected.rawName }
    : null
  const speciesOptions: GatheringSpeciesOption[] = selected?.species ?? []

  return (
    <div className="flex flex-wrap align-items-center gap-3">
      <div style={{ minWidth: '22rem', flex: '1 1 22rem' }}>
        <GroupedSinglePicker<PickerItem>
          placeholder={t('settings.gatheringCalculator.pickTarget')}
          value={value}
          suggestions={suggestions}
          completeMethod={complete}
          onChange={(v) => onSelect(v?.id ?? '')}
        />
      </div>

      {/* Only worth a control when a log item genuinely has more than one
          species behind it (Redwood vs Old-Growth Redwood). */}
      {speciesOptions.length > 1 && (
        <Dropdown
          value={speciesId}
          options={speciesOptions}
          optionLabel="name"
          optionValue="id"
          onChange={(e: DropdownChangeEvent) => onSelectSpecies(e.value ?? '')}
          aria-label={t('settings.gatheringCalculator.species')}
          style={{ minWidth: '14rem' }}
        />
      )}
    </div>
  )
}
