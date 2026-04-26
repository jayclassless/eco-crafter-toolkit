import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PriceField } from '../PriceField'

describe('PriceField', () => {
  it('renders the value as a numeric input', () => {
    const { container } = render(<PriceField value={3.14} />)
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('3.14')
  })

  it('shows a calculator badge when isCalculated is true', () => {
    const { container } = render(<PriceField value={1} isCalculated />)
    expect(container.querySelector('.pi-calculator')).toBeInTheDocument()
  })

  it('shows an override icon when isOverride is true', () => {
    const { container } = render(<PriceField value={1} isOverride />)
    expect(container.querySelector('.pi-chevron-left')).toBeInTheDocument()
  })

  it('disables editing when readOnly is true', () => {
    const { container } = render(<PriceField value={1} readOnly />)
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  it('forwards changes to onChange', () => {
    const onChange = vi.fn()
    const { container } = render(<PriceField value={null} onChange={onChange} />)
    const input = container.querySelector('input') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith(5)
  })

  it('clamps to a minimum of 0', () => {
    const onChange = vi.fn()
    const { container } = render(<PriceField value={null} onChange={onChange} />)
    const input = container.querySelector('input') as HTMLInputElement
    fireEvent.focus(input)
    // Sign rejection means '-' is filtered out before commit, so '5' lands.
    fireEvent.change(input, { target: { value: '-1' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith(1)
  })
})
