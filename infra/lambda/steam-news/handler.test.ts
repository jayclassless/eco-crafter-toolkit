// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { handleSteamNews } from './handler'

const STEAM_PREFIX = 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/'
const SAMPLE_BODY = '{"appnews":{"newsitems":[]}}'

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
}

function captureFetch(response: Response = jsonResponse(SAMPLE_BODY)) {
  return vi.fn<typeof fetch>(async () => response.clone())
}

function firstCallUrl(fetchMock: ReturnType<typeof captureFetch>): string {
  const arg = fetchMock.mock.calls[0][0]
  return typeof arg === 'string' ? arg : arg.toString()
}

describe('handleSteamNews', () => {
  it('forces appid=382310 on the upstream URL', async () => {
    const fetchMock = captureFetch()
    await handleSteamNews({ count: '5' }, fetchMock)
    const calledUrl = firstCallUrl(fetchMock)
    expect(calledUrl.startsWith(STEAM_PREFIX)).toBe(true)
    const params = new URL(calledUrl).searchParams
    expect(params.get('appid')).toBe('382310')
    expect(params.get('count')).toBe('5')
  })

  it.each([
    { input: '0', expected: '1' },
    { input: '1', expected: '1' },
    { input: '5', expected: '5' },
    { input: '20', expected: '20' },
    { input: '99', expected: '20' },
    { input: null, expected: '5' },
    { input: 'abc', expected: '5' },
  ])('clamps count input %j to %j', async ({ input, expected }) => {
    const fetchMock = captureFetch()
    await handleSteamNews({ count: input }, fetchMock)
    expect(new URL(firstCallUrl(fetchMock)).searchParams.get('count')).toBe(expected)
  })

  it('returns 200 with JSON content-type and 60s cache on upstream success', async () => {
    const fetchMock = captureFetch(jsonResponse(SAMPLE_BODY, 200))
    const result = await handleSteamNews({ count: '5' }, fetchMock)
    expect(result.status).toBe(200)
    expect(result.body).toBe(SAMPLE_BODY)
    expect(result.headers['Content-Type']).toBe('application/json; charset=UTF-8')
    expect(result.headers['Cache-Control']).toBe('public, max-age=60')
  })

  it('passes through non-2xx upstream status and body', async () => {
    const fetchMock = captureFetch(jsonResponse('upstream boom', 503))
    const result = await handleSteamNews({ count: '5' }, fetchMock)
    expect(result.status).toBe(503)
    expect(result.body).toBe('upstream boom')
  })
})
