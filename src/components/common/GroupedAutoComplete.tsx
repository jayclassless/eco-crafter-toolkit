import { AutoComplete, type AutoCompleteCompleteEvent } from 'primereact/autocomplete'
import { useRef, useState } from 'react'

import { EcoIcon } from '@/components/common/EcoIcon'

export interface GroupedAutoCompleteItem {
  id: string
  name: string
  rawName: string
}

export interface GroupedAutoCompleteGroup<
  T extends GroupedAutoCompleteItem = GroupedAutoCompleteItem,
> {
  profession: string
  professionRawName: string
  items: T[]
}

interface Props<T extends GroupedAutoCompleteItem> {
  placeholder: string
  suggestions: GroupedAutoCompleteGroup<T>[]
  completeMethod: (event: AutoCompleteCompleteEvent) => void
  onSelect: (item: T) => void
}

export function GroupedAutoComplete<T extends GroupedAutoCompleteItem>({
  placeholder,
  suggestions,
  completeMethod,
  onSelect,
}: Props<T>) {
  const [searchValue, setSearchValue] = useState<string>('')
  const ref = useRef<AutoComplete>(null)
  const wasVisibleRef = useRef(false)

  return (
    <AutoComplete
      ref={ref}
      value={searchValue}
      onChange={(e) => setSearchValue(e.value as string)}
      placeholder={placeholder}
      suggestions={suggestions as never[]}
      completeMethod={completeMethod}
      field="name"
      optionGroupLabel="profession"
      optionGroupChildren="items"
      dropdown
      onDropdownClick={() => {
        if (wasVisibleRef.current) {
          ref.current?.hide()
        }
      }}
      onShow={() => {
        wasVisibleRef.current = true
      }}
      onHide={() => {
        wasVisibleRef.current = false
      }}
      onSelect={(e) => {
        onSelect(e.value as T)
        setSearchValue('')
      }}
      itemTemplate={(item: unknown) => {
        const opt = item as T
        return (
          <div className="flex align-items-center gap-2 ml-3">
            <EcoIcon name={opt.rawName} size={20} />
            <span>{opt.name}</span>
          </div>
        )
      }}
      optionGroupTemplate={(group: unknown) => {
        const g = group as GroupedAutoCompleteGroup<T>
        return (
          <div className="flex align-items-center gap-2">
            <EcoIcon name={g.professionRawName} size={20} />
            <span className="font-bold">{g.profession}</span>
          </div>
        )
      }}
      className="w-full mb-2"
    />
  )
}
