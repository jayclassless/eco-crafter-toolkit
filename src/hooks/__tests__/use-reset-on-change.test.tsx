import { act, render, renderHook, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useResetOnChange } from '../use-reset-on-change'

describe('useResetOnChange', () => {
  it('does not run on the first render', () => {
    const onChange = vi.fn()
    renderHook(({ dep }) => useResetOnChange(dep, onChange), {
      initialProps: { dep: 'a' },
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('runs once when the dep changes, with the new and previous values', () => {
    const onChange = vi.fn()
    const { rerender } = renderHook(({ dep }) => useResetOnChange(dep, onChange), {
      initialProps: { dep: 'a' },
    })
    rerender({ dep: 'b' })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('b', 'a')
  })

  it('does not run when the dep is re-rendered unchanged', () => {
    const onChange = vi.fn()
    const { rerender } = renderHook(({ dep }) => useResetOnChange(dep, onChange), {
      initialProps: { dep: 'a' },
    })
    rerender({ dep: 'a' })
    rerender({ dep: 'a' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('treats NaN as unchanged (Object.is semantics)', () => {
    const onChange = vi.fn()
    const { rerender } = renderHook(({ dep }) => useResetOnChange(dep, onChange), {
      initialProps: { dep: Number.NaN },
    })
    rerender({ dep: Number.NaN })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('applies the reset before anything is committed to the DOM', () => {
    const painted: string[] = []

    function Probe({ token }: { token: string }) {
      const [draft, setDraft] = useState(token)
      useResetOnChange(token, () => setDraft(token))
      painted.push(draft)
      return <span data-testid="draft">{draft}</span>
    }

    const { rerender } = render(<Probe token="one" />)
    painted.length = 0

    act(() => {
      rerender(<Probe token="two" />)
    })

    // The stale 'one' is rendered but discarded; only 'two' reaches the DOM.
    expect(painted.at(-1)).toBe('two')
    expect(screen.getByTestId('draft').textContent).toBe('two')
  })
})
