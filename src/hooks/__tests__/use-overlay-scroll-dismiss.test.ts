import { act, renderHook } from '@testing-library/react'
import type { OverlayPanel } from 'primereact/overlaypanel'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { useOverlayScrollDismiss } from '../use-overlay-scroll-dismiss'

interface OpMock {
  hide: ReturnType<typeof vi.fn>
}

const makeOpRef = (): { ref: { current: OverlayPanel | null }; op: OpMock } => {
  const op: OpMock = { hide: vi.fn() }
  return { ref: { current: op as unknown as OverlayPanel }, op }
}

let addSpy: ReturnType<typeof vi.spyOn>
let removeSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  addSpy = vi.spyOn(window, 'addEventListener')
  removeSpy = vi.spyOn(window, 'removeEventListener')
})

afterEach(() => {
  addSpy.mockRestore()
  removeSpy.mockRestore()
})

// Fire a scroll event from a child element. scroll events don't bubble, but
// capture-phase listeners on `window` still see them — that's the property
// the hook depends on, so the test goes through the same path.
const fireScrollFromChild = () => {
  const el = document.createElement('div')
  document.body.appendChild(el)
  el.dispatchEvent(new Event('scroll'))
  document.body.removeChild(el)
}

describe('useOverlayScrollDismiss', () => {
  it('returns stable onShow/onHide across re-renders', () => {
    const { ref } = makeOpRef()
    const { result, rerender } = renderHook(() => useOverlayScrollDismiss(ref))
    const first = result.current
    rerender()
    expect(result.current.onShow).toBe(first.onShow)
    expect(result.current.onHide).toBe(first.onHide)
  })

  it('does not install a window listener until onShow runs', () => {
    const { ref } = makeOpRef()
    renderHook(() => useOverlayScrollDismiss(ref))
    const scrollAdds = addSpy.mock.calls.filter((c: unknown[]) => c[0] === 'scroll')
    expect(scrollAdds).toHaveLength(0)
  })

  it('onShow installs a capture-phase scroll listener that calls op.hide()', () => {
    const { ref, op } = makeOpRef()
    const { result } = renderHook(() => useOverlayScrollDismiss(ref))

    act(() => result.current.onShow())

    const scrollAdds = addSpy.mock.calls.filter((c: unknown[]) => c[0] === 'scroll')
    expect(scrollAdds).toHaveLength(1)
    // Third arg is the capture flag — must be `true` so scrolls anywhere in
    // the page (scroll doesn't bubble) reach the listener.
    expect(scrollAdds[0][2]).toBe(true)

    fireScrollFromChild()
    expect(op.hide).toHaveBeenCalledTimes(1)
  })

  it('onHide removes the listener so subsequent scrolls are ignored', () => {
    const { ref, op } = makeOpRef()
    const { result } = renderHook(() => useOverlayScrollDismiss(ref))

    act(() => result.current.onShow())
    fireScrollFromChild()
    expect(op.hide).toHaveBeenCalledTimes(1)

    act(() => result.current.onHide())
    const scrollRemoves = removeSpy.mock.calls.filter((c: unknown[]) => c[0] === 'scroll')
    expect(scrollRemoves).toHaveLength(1)
    expect(scrollRemoves[0][2]).toBe(true)

    fireScrollFromChild()
    // Still 1 — the post-hide scroll did not call hide() again.
    expect(op.hide).toHaveBeenCalledTimes(1)
  })

  it('onHide is a no-op when called without a prior onShow', () => {
    const { ref } = makeOpRef()
    const { result } = renderHook(() => useOverlayScrollDismiss(ref))

    act(() => result.current.onHide())
    const scrollRemoves = removeSpy.mock.calls.filter((c: unknown[]) => c[0] === 'scroll')
    expect(scrollRemoves).toHaveLength(0)
  })

  it('does not throw when scrolling after the OverlayPanel ref has been cleared', () => {
    const { ref } = makeOpRef()
    const { result } = renderHook(() => useOverlayScrollDismiss(ref))

    act(() => result.current.onShow())
    ref.current = null

    expect(() => fireScrollFromChild()).not.toThrow()
  })

  it('removes the listener on unmount even if onHide was not called', () => {
    const { ref, op } = makeOpRef()
    const { result, unmount } = renderHook(() => useOverlayScrollDismiss(ref))

    act(() => result.current.onShow())
    unmount()

    const scrollRemoves = removeSpy.mock.calls.filter((c: unknown[]) => c[0] === 'scroll')
    expect(scrollRemoves).toHaveLength(1)
    expect(scrollRemoves[0][2]).toBe(true)

    // Confirm the listener really is gone — a post-unmount scroll must not
    // reach op.hide() (which would also be a stale-ref bug).
    op.hide.mockClear()
    fireScrollFromChild()
    expect(op.hide).not.toHaveBeenCalled()
  })
})
