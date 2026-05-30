import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetGitHubReleasesCacheForTests } from '@/lib/github-releases'

import { useReleasesBadgeCount } from '../use-releases-badge'
import { createTestStores, makeWrapper, type TestStores } from './store-wrapper'

const SAMPLE_RELEASES = [
  {
    id: 1,
    tag_name: 'v0.3.0',
    name: 'Release 0.3.0',
    published_at: '2026-05-01T12:00:00Z',
    body: '',
    html_url: 'https://example.com/r/v0.3.0',
    draft: false,
    prerelease: false,
  },
  {
    id: 2,
    tag_name: 'v0.2.0',
    name: 'Release 0.2.0',
    published_at: '2026-04-01T12:00:00Z',
    body: '',
    html_url: 'https://example.com/r/v0.2.0',
    draft: false,
    prerelease: false,
  },
  {
    id: 3,
    tag_name: 'v0.1.0',
    name: 'Release 0.1.0',
    published_at: '2026-01-15T12:00:00Z',
    body: '',
    html_url: 'https://example.com/r/v0.1.0',
    draft: false,
    prerelease: false,
  },
]

let stores: TestStores

beforeEach(() => {
  _resetGitHubReleasesCacheForTests()
  stores = createTestStores()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useReleasesBadgeCount', () => {
  it('returns 0 while releases are loading', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useReleasesBadgeCount(), {
      wrapper: makeWrapper(stores),
    })
    expect(result.current).toBe(0)
  })

  it('counts releases newer than lastReleasesViewedAt', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_RELEASES), { status: 200 })
    )
    // Mark the oldest release as viewed → two newer releases remain unread.
    stores.uiStore.setCell(
      'uiState',
      'main',
      'lastReleasesViewedAt',
      Date.parse('2026-01-15T12:00:00Z')
    )

    const { result } = renderHook(() => useReleasesBadgeCount(), {
      wrapper: makeWrapper(stores),
    })

    await waitFor(() => expect(result.current).toBe(2))
  })

  it('returns 0 once lastReleasesViewedAt is past every release', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_RELEASES), { status: 200 })
    )
    stores.uiStore.setCell(
      'uiState',
      'main',
      'lastReleasesViewedAt',
      Date.parse('2026-05-01T12:00:00Z')
    )

    const { result } = renderHook(() => useReleasesBadgeCount(), {
      wrapper: makeWrapper(stores),
    })

    // Wait for the fetch to resolve, then assert no unread.
    await waitFor(() =>
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0)
    )
    await waitFor(() => expect(result.current).toBe(0))
  })

  it('reacts to lastReleasesViewedAt updates', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_RELEASES), { status: 200 })
    )

    const { result } = renderHook(() => useReleasesBadgeCount(), {
      wrapper: makeWrapper(stores),
    })

    await waitFor(() => expect(result.current).toBe(3))

    act(() => {
      stores.uiStore.setCell(
        'uiState',
        'main',
        'lastReleasesViewedAt',
        Date.parse('2026-05-01T12:00:00Z')
      )
    })
    expect(result.current).toBe(0)
  })

  it('returns 0 and swallows the error when the fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('boom', { status: 500, statusText: 'Server Error' })
    )

    const { result } = renderHook(() => useReleasesBadgeCount(), {
      wrapper: makeWrapper(stores),
    })

    // The badge stays at 0; a failed background fetch is not surfaced anywhere.
    await waitFor(() => expect(result.current).toBe(0))
  })
})
