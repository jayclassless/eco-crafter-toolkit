import {
  AutoComplete,
  type AutoCompleteChangeEvent,
  type AutoCompleteCompleteEvent,
} from 'primereact/autocomplete'
import { useEffect, useState } from 'react'

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
  disabled?: boolean
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
  disabled,
}: Props<T>) {
  // PrimeReact AutoComplete drives its visible input from the `value` prop. As
  // the user types, onChange fires with `e.value` set to the in-progress input
  // string and only fires with an object once a suggestion is picked. If we
  // forwarded each keystroke to the parent (which only models a selected item),
  // `value` would reset to null on every keystroke, wiping the typed text. So
  // we keep an internal value holding either the parent's selected object OR
  // the in-progress typed string, and only forward an actual selection (or a
  // blur-driven clear) to the parent. `forceSelection` reverts the input to the
  // committed value on blur if the user typed without selecting.
  const [internal, setInternal] = useState<T | string | null>(value)
  useEffect(() => {
    setInternal(value)
  }, [value])

  return (
    <div className={`flex align-items-center gap-2 ${className ?? ''}`}>
      {value?.rawName && <EcoIcon name={value.rawName} size={24} className="flex-shrink-0" />}
      <AutoComplete
        value={internal}
        suggestions={suggestions as never[]}
        completeMethod={completeMethod}
        field="name"
        optionGroupLabel="groupLabel"
        optionGroupChildren="items"
        dropdown
        disabled={disabled}
        forceSelection
        placeholder={placeholder}
        scrollHeight="300px"
        onChange={(e: AutoCompleteChangeEvent) => {
          const v = e.value as T | string | null | undefined
          setInternal(v ?? null)
          // A null/undefined value is a clear (e.g. forceSelection's blur after
          // an unmatched query); forward it. A string is in-progress typing —
          // keep it visible locally without disturbing the parent selection.
          if (v === null || v === undefined) {
            onChange(null)
            return
          }
          if (typeof v === 'string') return
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
