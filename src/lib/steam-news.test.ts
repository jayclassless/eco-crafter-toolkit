import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetSteamNewsCacheForTests, ECO_STEAM_APPID, fetchSteamNews } from './steam-news'

const SAMPLE_RESPONSE = {
  appnews: {
    appid: ECO_STEAM_APPID,
    newsitems: [
      {
        gid: '1830163047255899',
        title: 'Hotfix 13.0.2 released!',
        url: 'https://example.com/news/1',
        is_external_url: true,
        author: 'SLG-Dennis',
        contents: '[h3]Hey![/h3]',
        feedlabel: 'Community Announcements',
        date: 1776283033,
        feedname: 'steam_community_announcements',
        feed_type: 1,
      },
    ],
  },
}

describe('fetchSteamNews', () => {
  beforeEach(() => {
    _resetSteamNewsCacheForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches and normalizes news items', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const items = await fetchSteamNews(5)
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({
      gid: '1830163047255899',
      title: 'Hotfix 13.0.2 released!',
      url: 'https://example.com/news/1',
      author: 'SLG-Dennis',
      contents: '[h3]Hey![/h3]',
      feedlabel: 'Community Announcements',
      date: 1776283033,
    })
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('serves the cached array on subsequent calls without refetching', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () => new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 })
      )

    const first = await fetchSteamNews(5)
    const second = await fetchSteamNews(5)
    expect(second).toBe(first)
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('shares one in-flight request across concurrent callers', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () => new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 })
      )

    const [a, b] = await Promise.all([fetchSteamNews(5), fetchSteamNews(5)])
    expect(a).toBe(b)
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('does not cache failures — a retry refetches', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('boom', { status: 500, statusText: 'Server Error' }))
      .mockResolvedValueOnce(new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }))

    await expect(fetchSteamNews(5)).rejects.toThrow(/500/)
    const items = await fetchSteamNews(5)
    expect(items).toHaveLength(1)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
