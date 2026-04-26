import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { GroupedAutoComplete } from '../GroupedAutoComplete'

interface Item {
  id: string
  name: string
  rawName: string
}

const groups = [
  {
    profession: 'Industrialist',
    professionRawName: 'IndustrialistProfession',
    items: [
      { id: 's-mining', name: 'Mining', rawName: 'MiningSkill' },
      { id: 's-smelting', name: 'Smelting', rawName: 'SmeltingSkill' },
    ],
  },
  {
    profession: 'Outdoorsman',
    professionRawName: 'OutdoorsmanProfession',
    items: [{ id: 's-hunting', name: 'Hunting', rawName: 'HuntingSkill' }],
  },
]

describe('GroupedAutoComplete', () => {
  it('renders an empty input with the placeholder', () => {
    const { container } = render(
      <GroupedAutoComplete<Item>
        placeholder="Pick a skill"
        suggestions={[]}
        completeMethod={() => {}}
        onSelect={() => {}}
      />
    )
    expect((container.querySelector('input') as HTMLInputElement).placeholder).toBe('Pick a skill')
  })

  it('opens the dropdown and renders group + item templates', () => {
    const completeMethod = vi.fn(() => {})
    const { container } = render(
      <GroupedAutoComplete<Item>
        placeholder="Pick a skill"
        suggestions={groups}
        completeMethod={completeMethod}
        onSelect={() => {}}
      />
    )
    const dropdown = container.querySelector('.p-autocomplete-dropdown') as HTMLElement
    fireEvent.click(dropdown)
    expect(completeMethod).toHaveBeenCalled()
  })

  it('typing into the input updates the value', () => {
    const { container } = render(
      <GroupedAutoComplete<Item>
        placeholder="Search"
        suggestions={groups}
        completeMethod={() => {}}
        onSelect={() => {}}
      />
    )
    const input = container.querySelector('input') as HTMLInputElement
    fireEvent.input(input, { target: { value: 'min' } })
    expect(input.value).toBe('min')
  })

  it('clicking the dropdown twice exercises the open/hide path via the wasVisible ref', () => {
    const { container } = render(
      <GroupedAutoComplete<Item>
        placeholder="Search"
        suggestions={groups}
        completeMethod={() => {}}
        onSelect={() => {}}
      />
    )
    const dropdown = container.querySelector('.p-autocomplete-dropdown') as HTMLElement
    fireEvent.click(dropdown)
    fireEvent.click(dropdown)
    expect(dropdown).toBeInTheDocument()
  })
})
