import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useIsTablet } from '../use-is-tablet'

let mqlEmitter: ((e: MediaQueryListEvent) => void) | null = null
let removeListenerSpy: ReturnType<typeof vi.fn> | null = null

function stubMatchMedia(matches: boolean) {
  removeListenerSpy = vi.fn()
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: (_e: string, listener: (e: MediaQueryListEvent) => void) => {
        mqlEmitter = listener
      },
      removeEventListener: removeListenerSpy,
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }))
  )
}

beforeEach(() => {
  mqlEmitter = null
  removeListenerSpy = null
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useIsTablet', () => {
  it('returns true when the media query matches', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useIsTablet())
    expect(result.current).toBe(true)
  })

  it('returns false when the media query does not match', () => {
    stubMatchMedia(false)
    const { result } = renderHook(() => useIsTablet())
    expect(result.current).toBe(false)
  })

  it('updates when the media query change event fires', () => {
    stubMatchMedia(false)
    const { result } = renderHook(() => useIsTablet())
    expect(result.current).toBe(false)
    act(() => {
      mqlEmitter?.({ matches: true } as MediaQueryListEvent)
    })
    expect(result.current).toBe(true)
  })

  it('removes its listener on unmount', () => {
    stubMatchMedia(false)
    const { unmount } = renderHook(() => useIsTablet())
    unmount()
    expect(removeListenerSpy).toHaveBeenCalledTimes(1)
  })
})
