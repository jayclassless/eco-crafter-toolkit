const STEAM_API = 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/'
const APPID = '382310'
const DEFAULT_COUNT = 5
const MIN_COUNT = 1
const MAX_COUNT = 20

export interface SteamNewsRequest {
  count?: string | null
}

export interface SteamNewsResult {
  status: number
  body: string
  headers: Record<string, string>
}

function clampCount(raw: string | null | undefined): number {
  if (raw == null) return DEFAULT_COUNT
  const parsed = parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return DEFAULT_COUNT
  return Math.min(Math.max(parsed, MIN_COUNT), MAX_COUNT)
}

export async function handleSteamNews(
  req: SteamNewsRequest,
  fetchImpl: typeof fetch = fetch
): Promise<SteamNewsResult> {
  const count = clampCount(req.count)

  const upstream = new URL(STEAM_API)
  upstream.searchParams.set('appid', APPID)
  upstream.searchParams.set('count', String(count))

  const res = await fetchImpl(upstream.toString())
  const body = await res.text()

  return {
    status: res.status,
    body,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'public, max-age=60',
    },
  }
}
