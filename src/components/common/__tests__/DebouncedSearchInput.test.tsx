import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DebouncedSearchInput } from '../DebouncedSearchInput'

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('DebouncedSearchInput', () => {
  it('renders an empty input with the placeholder', () => {
    const { container } = render(
      <DebouncedSearchInput placeholder="Find" onDebouncedChange={() => {}} />
    )
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.placeholder).toBe('Find')
  })

  it('debounces and emits the latest value once', () => {
    const onChange = vi.fn()
    const { container } = render(
      <DebouncedSearchInput onDebouncedChange={onChange} debounceMs={200} />
    )
    const input = container.querySelector('input') as HTMLInputElement
    // Initial mount fires once with ''
    advance(200)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith('')

    fireEvent.change(input, { target: { value: 'a' } })
    advance(50)
    fireEvent.change(input, { target: { value: 'ab' } })
    advance(50)
    fireEvent.change(input, { target: { value: 'abc' } })
    // Still pending — only the initial '' commit so far.
    expect(onChange).toHaveBeenCalledTimes(1)
    advance(200)
    expect(onChange).toHaveBeenCalledWith('abc')
  })

  it('shows the clear icon only when the input has a value', () => {
    const { container } = render(<DebouncedSearchInput onDebouncedChange={() => {}} />)
    const input = container.querySelector('input') as HTMLInputElement
    const clear = container.querySelector('.pi-times') as HTMLElement
    expect(clear.style.visibility).toBe('hidden')
    fireEvent.change(input, { target: { value: 'x' } })
    expect(clear.style.visibility).toBe('visible')
  })

  it('clearing the value resets the input and fires onDebouncedChange("")', () => {
    const onChange = vi.fn()
    const { container } = render(
      <DebouncedSearchInput onDebouncedChange={onChange} debounceMs={100} />
    )
    const input = container.querySelector('input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'wood' } })
    advance(100)
    expect(onChange).toHaveBeenLastCalledWith('wood')

    const clear = container.querySelector('.pi-times') as HTMLElement
    fireEvent.click(clear)
    expect(input.value).toBe('')
    advance(100)
    expect(onChange).toHaveBeenLastCalledWith('')
  })
})
