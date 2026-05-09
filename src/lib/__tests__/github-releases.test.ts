import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  _resetGitHubReleasesCacheForTests,
  fetchGitHubReleases,
  GITHUB_RELEASES_REPO,
} from '../github-releases'

const SAMPLE_RESPONSE = [
  {
    id: 1,
    tag_name: 'v0.2.0',
    name: 'Release 0.2.0',
    published_at: '2026-04-01T12:00:00Z',
    body: '## Highlights\n- Did a thing',
    html_url: 'https://github.com/example/repo/releases/tag/v0.2.0',
    draft: false,
    prerelease: false,
  },
  {
    id: 2,
    tag_name: 'v0.3.0-beta',
    name: 'Beta',
    published_at: '2026-04-15T12:00:00Z',
    body: 'beta notes',
    html_url: 'https://github.com/example/repo/releases/tag/v0.3.0-beta',
    draft: false,
    prerelease: true,
  },
  {
    id: 3,
    tag_name: 'v0.4.0',
    name: null,
    published_at: '2026-05-01T12:00:00Z',
    body: null,
    html_url: 'https://github.com/example/repo/releases/tag/v0.4.0',
    draft: true,
    prerelease: false,
  },
]

describe('fetchGitHubReleases', () => {
  beforeEach(() => {
    _resetGitHubReleasesCacheForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('targets the eco-crafter-toolkit repo', () => {
    expect(GITHUB_RELEASES_REPO).toBe('jayclassless/eco-crafter-toolkit')
  })

  it('fetches and normalizes releases, filtering drafts and pre-releases', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const releases = await fetchGitHubReleases()
    expect(releases).toHaveLength(1)
    expect(releases[0]).toEqual({
      id: 1,
      tag_name: 'v0.2.0',
      name: 'Release 0.2.0',
      published_at: '2026-04-01T12:00:00Z',
      body: '## Highlights\n- Did a thing',
      html_url: 'https://github.com/example/repo/releases/tag/v0.2.0',
    })
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('serves the cached array on subsequent calls without refetching', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () => new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 })
      )

    const first = await fetchGitHubReleases()
    const second = await fetchGitHubReleases()
    expect(second).toBe(first)
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('shares one in-flight request across concurrent callers', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () => new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 })
      )

    const [a, b] = await Promise.all([fetchGitHubReleases(), fetchGitHubReleases()])
    expect(a).toBe(b)
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('does not cache failures — a retry refetches', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('boom', { status: 500, statusText: 'Server Error' }))
      .mockResolvedValueOnce(new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }))

    await expect(fetchGitHubReleases()).rejects.toThrow(/500/)
    const releases = await fetchGitHubReleases()
    expect(releases).toHaveLength(1)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('coerces null body to empty string', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 10,
            tag_name: 'v0.1.0',
            name: null,
            published_at: '2026-01-01T00:00:00Z',
            body: null,
            html_url: 'https://example.com/v0.1.0',
            draft: false,
            prerelease: false,
          },
        ]),
        { status: 200 }
      )
    )

    const releases = await fetchGitHubReleases()
    expect(releases[0]?.body).toBe('')
    expect(releases[0]?.name).toBeNull()
  })
})
