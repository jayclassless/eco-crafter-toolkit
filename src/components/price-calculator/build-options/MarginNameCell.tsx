import { InputText } from 'primereact/inputtext'
import { memo } from 'react'
import type { Store } from 'tinybase'

import { useCellValue } from '@/hooks/use-store-revision'

interface Props {
  marginId: string
  buildStore: Store
  onChange: (marginId: string, value: string) => void
}

// Subscribes directly to its own `userMargins.name` cell, so a keystroke only
// re-renders this one InputText. Previously OptionsPanel listened to all
// `userMargins` changes, so every character round-tripped through the store and
// rebuilt the whole margins DataTable. Memoized so unchanged name cells also
// bail when the panel re-renders for unrelated reasons (add/remove/default).
export const MarginNameCell = memo(function MarginNameCell({
  marginId,
  buildStore,
  onChange,
}: Props) {
  const value = useCellValue<string>(buildStore, 'userMargins', marginId, 'name') ?? ''
  return (
    <InputText
      value={value}
      onChange={(e) => onChange(marginId, e.target.value)}
      className="w-full"
    />
  )
})
