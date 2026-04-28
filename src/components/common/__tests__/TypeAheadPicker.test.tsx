import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { TypeAheadPicker } from '../TypeAheadPicker'

interface Opt {
  id: string
  name: string
  rawName: string
  isCustom?: boolean
}

const candidates: Opt[] = [
  { id: '1', name: 'Iron Bar', rawName: 'IronBar' },
  { id: '2', name: 'Iron Ore', rawName: 'IronOre' },
  { id: '3', name: 'Wood Plank', rawName: 'WoodPlank' },
  { id: '4', name: 'Custom Thing', rawName: 'Custom Thing', isCustom: true },
]

function Wrapper({
  initial = null,
  onChange,
}: {
  initial?: Opt | null
  onChange?: (v: Opt | null) => void
}) {
  const [value, setValue] = useState<Opt | null>(initial)
  return (
    <TypeAheadPicker
      placeholder="Type to search"
      value={value}
      candidates={candidates}
      onChange={(v) => {
        setValue(v)
        onChange?.(v)
      }}
    />
  )
}

describe('TypeAheadPicker', () => {
  it('renders an empty input with the placeholder when nothing selected', () => {
    render(<Wrapper />)
    expect(screen.getByPlaceholderText('Type to search')).toBeInTheDocument()
  })

  it('shows the selected item name in the input and an icon prefix', () => {
    const initial = candidates[0]
    const { container } = render(<Wrapper initial={initial} />)
    expect(screen.getByDisplayValue('Iron Bar')).toBeInTheDocument()
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
  })

  it('renders a pi-book prefix when the selected item is custom', () => {
    const initial = candidates[3]
    const { container } = render(<Wrapper initial={initial} />)
    // The pi-book placeholder is rendered as an <i> with the pi-book class.
    expect(container.querySelector('i.pi.pi-book')).not.toBeNull()
  })

  it('shows suggestions only after the user types something', async () => {
    render(<Wrapper />)
    const input = screen.getByPlaceholderText('Type to search') as HTMLInputElement

    // Empty query — completeMethod is called, returns no suggestions.
    fireEvent.input(input, { target: { value: '' } })
    // A short wait for any async update.
    await new Promise((r) => setTimeout(r, 0))

    // Type "iron" — both Iron Bar and Iron Ore should appear in the list.
    fireEvent.change(input, { target: { value: 'iron' } })
    fireEvent.input(input, { target: { value: 'iron' } })

    await waitFor(() => {
      const items = Array.from(document.querySelectorAll('.p-autocomplete-item'))
      const texts = items.map((el) => el.textContent ?? '')
      expect(texts.some((t) => /Iron Bar/.test(t))).toBe(true)
      expect(texts.some((t) => /Iron Ore/.test(t))).toBe(true)
      // Wood Plank is not a match.
      expect(texts.some((t) => /Wood Plank/.test(t))).toBe(false)
    })
  })

  it('keeps typed text visible as the user types', () => {
    render(<Wrapper />)
    const input = screen.getByPlaceholderText('Type to search') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'iron' } })
    expect(input.value).toBe('iron')
    fireEvent.change(input, { target: { value: 'iron o' } })
    expect(input.value).toBe('iron o')
  })

  it('emits onChange(null) when the input is cleared', () => {
    const onChange = vi.fn()
    const initial = candidates[0]
    render(<Wrapper initial={initial} onChange={onChange} />)
    const input = screen.getByDisplayValue('Iron Bar') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
