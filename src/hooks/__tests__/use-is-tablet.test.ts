import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useIsTablet } from '../use-is-tablet'

let mqlEmitter: ((e: MediaQueryListEvent) => void) | null = null
let removeListenerSpy: ReturnType<typeof vi.fn> | null = null

type StubMql = MediaQueryList & { matches: boolean }

/**
 * Browsers hand back a live MediaQueryList whose `matches` is already updated
 * by the time a `change` listener runs, so the stub keeps one object per query
 * and mutates it — see `emitChange`.
 */
function stubMatchMedia(matches: boolean) {
  removeListenerSpy = vi.fn()
  const byQuery = new Map<string, StubMql>()
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      const existing = byQuery.get(query)
      if (existing) return existing
      const mql = {
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
      } as unknown as StubMql
      byQuery.set(query, mql)
      return mql
    })
  )
  return byQuery
}

function emitChange(byQuery: Map<string, StubMql>, matches: boolean) {
  for (const mql of byQuery.values()) mql.matches = matches
  mqlEmitter?.({ matches } as MediaQueryListEvent)
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
    const byQuery = stubMatchMedia(false)
    const { result } = renderHook(() => useIsTablet())
    expect(result.current).toBe(false)
    act(() => {
      emitChange(byQuery, true)
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
