import { createContext, memo, useContext } from 'react'

import type { MarginOption } from './types'

interface MarginOptionsContextValue {
  options: MarginOption[]
  defaultMarginId: string
}

export const MarginOptionsContext = createContext<MarginOptionsContextValue>({
  options: [],
  defaultMarginId: '',
})

interface Props {
  value: string
  rowId: string
  onChange: (rowId: string, marginId: string) => void
}

// Native <select> is ~100× cheaper to mount/unmount than PrimeReact Dropdown.
// Options are sourced from context (not props) so a margin-name edit reaches
// us via context propagation even when PrimeReact DataTable's BodyCell memo
// skips re-rendering the enclosing Cell.
export const MarginCell = memo(function MarginCell({ value, rowId, onChange }: Props) {
  const { options, defaultMarginId } = useContext(MarginOptionsContext)
  const effective = value || defaultMarginId
  return (
    <select
      className="p-inputtext p-inputtext-sm w-full"
      value={effective || ''}
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
