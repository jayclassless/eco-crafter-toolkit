import {
  AutoComplete,
  type AutoCompleteChangeEvent,
  type AutoCompleteCompleteEvent,
} from 'primereact/autocomplete'
import { useState } from 'react'

import { ItemIcon } from '@/components/common/ItemIcon'
import { useResetOnChange } from '@/hooks/use-reset-on-change'

interface TypeAheadPickerItem {
  id: string
  name: string
  rawName: string
  isCustom?: boolean
}

interface Props<T extends TypeAheadPickerItem> {
  placeholder: string
  value: T | null
  /** All candidates. The picker filters them locally by `name` substring. */
  candidates: T[]
  onChange: (value: T | null) => void
  /** Minimum query length before showing suggestions. Default 1. */
  minQueryLength?: number
  className?: string
}

/**
 * Flat single-select picker that requires the user to type before showing
 * suggestions. Suited to tables like `items` where the candidate list is
 * large enough that an unfiltered dropdown is unhelpful.
 *
 * Difference from `GroupedSinglePicker`: no groups, no eager dropdown, and
 * matches are scored by case-insensitive substring on `name`.
 */
export function TypeAheadPicker<T extends TypeAheadPickerItem>({
  placeholder,
  value,
  candidates,
  onChange,
  minQueryLength = 1,
  className,
}: Props<T>) {
  const [suggestions, setSuggestions] = useState<T[]>([])
  // PrimeReact AutoComplete drives its visible input from the `value` prop. As
  // the user types, onChange fires with `e.value` set to the current input
  // string (`'i'`, then `'ir'`, ...), and only fires with an object when an
  // option is picked. If we forwarded each keystroke to the parent (which
  // only models a selected item), `value` would reset to `null` on every
  // keystroke, wiping the input and losing all but the last typed character.
  //
  // So we keep an internal value that holds either the parent's selected
  // object OR the in-progress typed string, and only call the parent's
  // `onChange` once an actual item is picked. `forceSelection` ensures the
  // input reverts to the previously-committed value on blur if the user types
  // without selecting.
  const [internal, setInternal] = useState<T | string | null>(value)
  useResetOnChange(value, () => setInternal(value))

  const completeMethod = (event: AutoCompleteCompleteEvent) => {
    const query = event.query.trim().toLowerCase()
    if (query.length < minQueryLength) {
      setSuggestions([])
      return
    }
    const matches = candidates.filter((c) => c.name.toLowerCase().includes(query))
    setSuggestions(matches)
  }

  // Show the selected entity's icon as a prefix when one is picked. We rely
  // on the parent-prop `value` (not the in-progress `internal` string) so the
  // icon doesn't disappear while the user is typing a replacement query.
  const selectedIcon =
    value && (value.rawName || value.isCustom) ? (
      <ItemIcon item={{ name: value.rawName, isCustom: value.isCustom }} />
    ) : null

  return (
    <div className={`flex align-items-center gap-2 ${className ?? ''}`}>
      {selectedIcon && <span className="flex-shrink-0">{selectedIcon}</span>}
      <AutoComplete
        value={internal}
        suggestions={suggestions as never[]}
        completeMethod={completeMethod}
        field="name"
        forceSelection
        placeholder={placeholder}
        scrollHeight="300px"
        onChange={(e: AutoCompleteChangeEvent) => {
          const v = e.value as T | string | null | undefined
          setInternal(v ?? null)
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
            <div className="flex align-items-center gap-2">
              {(opt.rawName || opt.isCustom) && (
                <ItemIcon item={{ name: opt.rawName, isCustom: opt.isCustom }} />
              )}
              <span>{opt.name}</span>
            </div>
          )
        }}
        className="flex-grow-1"
        inputClassName="w-full"
      />
    </div>
  )
}
