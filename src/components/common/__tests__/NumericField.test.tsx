import { act, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NumericField } from '../NumericField'

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * Renders a NumericField inside a stateful parent that mirrors the commit
 * back into the `value` prop — same as a real consumer would.
 */
function renderField(initial: {
  value: number | null
  onChange?: (v: number | null) => void
  min?: number
  max?: number
  maxFractionDigits?: number
  debounceMs?: number
  suffix?: string
}) {
  const spy = initial.onChange ?? vi.fn()
  function Host() {
    const [v, setV] = useState<number | null>(initial.value)
    return (
      <NumericField
        value={v}
        onChange={(nv) => {
          spy(nv)
          setV(nv)
        }}
        min={initial.min}
        max={initial.max}
        maxFractionDigits={initial.maxFractionDigits}
        debounceMs={initial.debounceMs ?? 250}
        suffix={initial.suffix}
      />
    )
  }
  const utils = render(<Host />)
  const input = utils.container.querySelector('input') as HTMLInputElement
  return { ...utils, input, onChange: spy }
}

describe('NumericField', () => {
  it('renders the initial value', () => {
    const { input } = renderField({ value: 1.5 })
    expect(input.value).toBe('1.5')
  })

  it('renders empty for null', () => {
    const { input } = renderField({ value: null })
    expect(input.value).toBe('')
  })

  it('lets the user type a leading decimal like ".3" and commits 0.3', () => {
    const onChange = vi.fn()
    const { input } = renderField({ value: null, onChange })

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '.' } })
    // "." alone is intermediate — no commit after the debounce.
    advance(300)
    expect(onChange).not.toHaveBeenCalled()
    expect(input.value).toBe('.')

    fireEvent.change(input, { target: { value: '.3' } })
    advance(300)
    expect(onChange).toHaveBeenCalledWith(0.3)
    // Local text must still show ".3" — the commit does not reformat while
    // the user is still typing.
    expect(input.value).toBe('.3')
  })

  it('reformats to canonical form on blur', () => {
    const onChange = vi.fn()
    const { input } = renderField({ value: null, onChange })

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '.3' } })
    advance(300)
    fireEvent.blur(input)
    expect(input.value).toBe('0.3')
  })

  it('commits immediately on blur without waiting for debounce', () => {
    const onChange = vi.fn()
    const { input } = renderField({ value: 0, onChange, debounceMs: 5000 })

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '7' } })
    fireEvent.blur(input)
    // No time advanced — blur commits synchronously.
    expect(onChange).toHaveBeenCalledWith(7)
  })

  it('debounces rapid keystrokes into a single commit with the final value', () => {
    const onChange = vi.fn()
    const { input } = renderField({ value: 0, onChange, debounceMs: 200 })

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '1' } })
    advance(100)
    fireEvent.change(input, { target: { value: '12' } })
    advance(100)
    fireEvent.change(input, { target: { value: '123' } })
    advance(100)
    // Still within debounce window from the last keystroke.
    expect(onChange).not.toHaveBeenCalled()
    advance(100)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(123)
  })

  it('strips invalid characters while typing', () => {
    const { input } = renderField({ value: null })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'abc1.2x' } })
    expect(input.value).toBe('1.2')
  })

  it('allows only one decimal point', () => {
    const { input } = renderField({ value: null })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '1.2.3' } })
    expect(input.value).toBe('1.23')
  })

  it('rejects a minus sign when min is non-negative', () => {
    const { input } = renderField({ value: null, min: 0 })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '-5' } })
    expect(input.value).toBe('5')
  })

  it('clamps to min on commit', () => {
    const onChange = vi.fn()
    const { input } = renderField({ value: 0, onChange, min: 0 })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '5' } })
    advance(300)
    fireEvent.change(input, { target: { value: '0' } })
    advance(300)
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('clamps to max on commit', () => {
    const onChange = vi.fn()
    const { input } = renderField({ value: 0, onChange, max: 100 })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '500' } })
    advance(300)
    expect(onChange).toHaveBeenCalledWith(100)
  })

  it('commits null when cleared', () => {
    const onChange = vi.fn()
    const { input } = renderField({ value: 5, onChange })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    advance(300)
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('syncs external value changes when not focused', () => {
    const root = render(<NumericField value={1} onChange={() => {}} />)
    const input = root.container.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('1')
    root.rerender(<NumericField value={42} onChange={() => {}} />)
    expect(input.value).toBe('42')
  })

  it('does NOT overwrite local text while the user is focused and editing', () => {
    // Uses the stateful renderField so the commit really does flow back
    // into the `value` prop, closely mirroring a real consumer.
    const { input } = renderField({ value: null, debounceMs: 200 })

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '.3' } })
    advance(200)
    // Debounced commit has fired; parent re-rendered with value=0.3.
    // User is still focused — their typed-in ".3" must not be
    // reformatted to "0.3" underneath them.
    expect(input.value).toBe('.3')
  })

  it('renders a suffix addon when provided', () => {
    const { container } = render(<NumericField value={25} onChange={() => {}} suffix="%" />)
    expect(container.textContent).toContain('%')
  })

  // Virtualized tables unmount rows that scroll out of the render window, so
  // an in-progress edit must commit on unmount instead of being dropped with
  // the pending debounce timer.
  describe('commit on unmount', () => {
    it('commits a focused, uncommitted edit when the field unmounts', () => {
      const onChange = vi.fn()
      const { input, unmount } = renderField({ value: null, onChange, debounceMs: 5000 })

      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: '7.77' } })
      // No blur, debounce still pending — simulate the row scrolling away.
      unmount()
      expect(onChange).toHaveBeenCalledWith(7.77)
    })

    it('does not commit on unmount when the field was never focused', () => {
      const onChange = vi.fn()
      const { unmount } = renderField({ value: 5, onChange })
      unmount()
      expect(onChange).not.toHaveBeenCalled()
    })

    it('does not commit intermediate text like "." on unmount', () => {
      const onChange = vi.fn()
      const { input, unmount } = renderField({ value: null, onChange, debounceMs: 5000 })

      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: '.' } })
      unmount()
      expect(onChange).not.toHaveBeenCalled()
    })

    it('does not re-commit an already-committed value on unmount', () => {
      const onChange = vi.fn()
      const { input, unmount } = renderField({ value: null, onChange, debounceMs: 200 })

      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: '3' } })
      advance(250)
      expect(onChange).toHaveBeenCalledTimes(1)
      unmount()
      expect(onChange).toHaveBeenCalledTimes(1)
    })
  })
})
