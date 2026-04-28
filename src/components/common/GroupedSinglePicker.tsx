import {
  AutoComplete,
  type AutoCompleteChangeEvent,
  type AutoCompleteCompleteEvent,
} from 'primereact/autocomplete'

import { EcoIcon } from '@/components/common/EcoIcon'

interface GroupedSinglePickerItem {
  id: string
  name: string
  rawName: string
}

export interface GroupedSinglePickerGroup<
  T extends GroupedSinglePickerItem = GroupedSinglePickerItem,
> {
  groupLabel: string
  groupRawName: string
  items: T[]
}

interface Props<T extends GroupedSinglePickerItem> {
  placeholder: string
  value: T | null
  suggestions: GroupedSinglePickerGroup<T>[]
  completeMethod: (event: AutoCompleteCompleteEvent) => void
  onChange: (value: T | null) => void
  className?: string
}

/**
 * Single-select counterpart to `GroupedAutoComplete`. Same icon + grouping UX,
 * but the input shows the currently picked item's name and the dropdown is for
 * REPLACING that selection rather than appending to a list. Suitable for form
 * fields where only one value is allowed (recipe skill, crafting table, an
 * ingredient slot, etc.).
 */
export function GroupedSinglePicker<T extends GroupedSinglePickerItem>({
  placeholder,
  value,
  suggestions,
  completeMethod,
  onChange,
  className,
}: Props<T>) {
  return (
    <div className={`flex align-items-center gap-2 ${className ?? ''}`}>
      {value?.rawName && <EcoIcon name={value.rawName} size={24} className="flex-shrink-0" />}
      <AutoComplete
        value={value}
        suggestions={suggestions as never[]}
        completeMethod={completeMethod}
        field="name"
        optionGroupLabel="groupLabel"
        optionGroupChildren="items"
        dropdown
        forceSelection
        placeholder={placeholder}
        scrollHeight="300px"
        onChange={(e: AutoCompleteChangeEvent) => {
          const v = e.value as T | string | null | undefined
          // forceSelection lets the user clear by deleting the text (becomes ''),
          // and types the value as the input string until a suggestion is chosen.
          // Map both intermediate states to null so callers get a clean signal.
          if (v === null || v === undefined || typeof v === 'string') {
            onChange(null)
            return
          }
          onChange(v)
        }}
        itemTemplate={(item: unknown) => {
          const opt = item as T
          return (
            <div className="flex align-items-center gap-2 ml-3">
              {opt.rawName && <EcoIcon name={opt.rawName} size={24} />}
              <span>{opt.name}</span>
            </div>
          )
        }}
        optionGroupTemplate={(group: unknown) => {
          const g = group as GroupedSinglePickerGroup<T>
          return (
            <div className="flex align-items-center gap-2">
              {g.groupRawName && <EcoIcon name={g.groupRawName} size={24} />}
              <span className="font-bold">{g.groupLabel}</span>
            </div>
          )
        }}
        className="flex-grow-1"
        inputClassName="w-full"
      />
    </div>
  )
}
