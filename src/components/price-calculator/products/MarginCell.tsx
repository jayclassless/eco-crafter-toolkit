import { memo } from 'react'

import type { MarginOption } from './types'

interface Props {
  value: string
  rowId: string
  options: MarginOption[]
  onChange: (rowId: string, marginId: string) => void
}

// Native <select> is ~100× cheaper to mount/unmount than PrimeReact Dropdown.
export const MarginCell = memo(function MarginCell({ value, rowId, options, onChange }: Props) {
  return (
    <select
      className="p-inputtext p-inputtext-sm w-full"
      value={value || ''}
      onChange={(e) => onChange(rowId, e.target.value)}
    >
      <option value=""></option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  )
})
