export const ECO_STEAM_APPID = 382310

const PROXY_URL = '/api/game-news'

export interface SteamNewsItem {
  gid: string
  title: string
  url: string
  author: string
  contents: string
  feedlabel: string
  date: number
}

interface SteamNewsApiResponse {
  appnews?: {
    newsitems?: Array<Partial<SteamNewsItem> & { gid?: string | number }>
  }
}

let cachedItems: SteamNewsItem[] | null = null
let inFlight: Promise<SteamNewsItem[]> | null = null

function buildUrl(count: number): string {
  return `${PROXY_URL}?count=${count}`
}

function normalizeItem(raw: Partial<SteamNewsItem> & { gid?: string | number }): SteamNewsItem {
  return {
    gid: String(raw.gid ?? ''),
    title: raw.title ?? '',
    url: raw.url ?? '',
    author: raw.author ?? '',
    contents: raw.contents ?? '',
    feedlabel: raw.feedlabel ?? '',
    date: typeof raw.date === 'number' ? raw.date : 0,
  }
}

// Multiple callers (the badge hook and the GameNews page) share one in-flight
// promise via the cache below, so this fetch deliberately accepts no AbortSignal
// — honouring any one caller's signal would cancel the request for everyone
// else. Callers can still gate state updates on their own AbortSignal.aborted
// after awaiting.
export async function fetchSteamNews(count = 5): Promise<SteamNewsItem[]> {
  if (cachedItems) return cachedItems
  if (inFlight) return inFlight

  inFlight = (async () => {
    const res = await fetch(buildUrl(count))
    if (!res.ok) {
      throw new Error(`Steam News request failed: ${res.status} ${res.statusText}`)
    }
    const json = (await res.json()) as SteamNewsApiResponse
    const items = (json.appnews?.newsitems ?? []).map(normalizeItem)
    cachedItems = items
    return items
  })()

  try {
    return await inFlight
  } finally {
    inFlight = null
  }
}

export function _resetSteamNewsCacheForTests(): void {
  cachedItems = null
  inFlight = null
}
