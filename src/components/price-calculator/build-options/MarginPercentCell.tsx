import { memo } from 'react'
import type { Store } from 'tinybase'

import { NumericField } from '@/components/common/NumericField'
import { useCellValue } from '@/hooks/use-store-revision'

interface Props {
  marginId: string
  buildStore: Store
  onChange: (marginId: string, value: number) => void
}

// Subscribes directly to its own `userMargins.percent` cell so a commit only
// re-renders this one field, not the whole OptionsPanel + margins DataTable.
// Memoized to bail on unrelated panel re-renders.
export const MarginPercentCell = memo(function MarginPercentCell({
  marginId,
  buildStore,
  onChange,
}: Props) {
  const value = useCellValue<number>(buildStore, 'userMargins', marginId, 'percent') ?? 0
  return (
    <NumericField
      value={value}
      onChange={(v) => onChange(marginId, v ?? 0)}
      min={0}
      max={999}
      className="w-full"
    />
  )
})
