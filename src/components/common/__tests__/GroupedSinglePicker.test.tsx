import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { GroupedSinglePicker, type GroupedSinglePickerGroup } from '../GroupedSinglePicker'

interface Opt {
  id: string
  name: string
  rawName: string
}

function Wrapper({
  initial = null,
  onChange,
  groups,
}: {
  initial?: Opt | null
  onChange?: (v: Opt | null) => void
  groups: GroupedSinglePickerGroup<Opt>[]
}) {
  const [value, setValue] = useState<Opt | null>(initial)
  const [suggestions, setSuggestions] = useState<GroupedSinglePickerGroup<Opt>[]>([])

  return (
    <GroupedSinglePicker
      placeholder="Pick something"
      value={value}
      suggestions={suggestions}
      completeMethod={() => setSuggestions(groups)}
      onChange={(v) => {
        setValue(v)
        onChange?.(v)
      }}
    />
  )
}

const sampleGroups: GroupedSinglePickerGroup<Opt>[] = [
  {
    groupLabel: 'Mining',
    groupRawName: 'MiningSkill',
    items: [
      { id: '1', name: 'Iron Ore', rawName: 'IronOre' },
      { id: '2', name: 'Copper Ore', rawName: 'CopperOre' },
    ],
  },
  {
    groupLabel: 'Other',
    groupRawName: '',
    items: [{ id: '3', name: 'Stone', rawName: 'Stone' }],
  },
]

describe('GroupedSinglePicker', () => {
  it('renders the placeholder with no selection', () => {
    render(<Wrapper groups={sampleGroups} />)
    expect(screen.getByPlaceholderText('Pick something')).toBeInTheDocument()
  })

  it('shows the selected entity icon as a prefix', () => {
    const initial: Opt = { id: '1', name: 'Iron Ore', rawName: 'IronOre' }
    const { container } = render(<Wrapper initial={initial} groups={sampleGroups} />)
    // Icon is an EcoIcon img sourced from the rawName.
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toContain('IronOre')
  })

  it('emits onChange(null) when the input is cleared', () => {
    const onChange = vi.fn()
    const initial: Opt = { id: '1', name: 'Iron Ore', rawName: 'IronOre' }
    render(<Wrapper initial={initial} onChange={onChange} groups={sampleGroups} />)
    const input = screen.getByDisplayValue('Iron Ore') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
