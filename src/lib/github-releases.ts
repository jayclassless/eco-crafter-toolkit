export const GITHUB_RELEASES_REPO = 'jayclassless/eco-crafter-toolkit'

const RELEASES_URL = `https://api.github.com/repos/${GITHUB_RELEASES_REPO}/releases`

export interface GitHubRelease {
  id: number
  tag_name: string
  name: string | null
  published_at: string
  body: string
  html_url: string
}

interface GitHubReleaseApiItem {
  id?: number
  tag_name?: string
  name?: string | null
  published_at?: string | null
  body?: string | null
  html_url?: string
  draft?: boolean
  prerelease?: boolean
}

let cachedReleases: GitHubRelease[] | null = null
let inFlight: Promise<GitHubRelease[]> | null = null

function normalizeItem(raw: GitHubReleaseApiItem): GitHubRelease {
  return {
    id: typeof raw.id === 'number' ? raw.id : 0,
    tag_name: raw.tag_name ?? '',
    name: raw.name ?? null,
    published_at: raw.published_at ?? '',
    body: raw.body ?? '',
    html_url: raw.html_url ?? '',
  }
}

// Multiple callers could share one in-flight promise via the cache below, so
// this fetch deliberately accepts no AbortSignal — honouring any one caller's
// signal would cancel the request for everyone else. Callers can still gate
// state updates on their own AbortSignal.aborted after awaiting.
export async function fetchGitHubReleases(): Promise<GitHubRelease[]> {
  if (cachedReleases) return cachedReleases
  if (inFlight) return inFlight

  inFlight = (async () => {
    const res = await fetch(RELEASES_URL)
    if (!res.ok) {
      throw new Error(`GitHub Releases request failed: ${res.status} ${res.statusText}`)
    }
    const json = (await res.json()) as GitHubReleaseApiItem[]
    const releases = json.filter((r) => !r.draft && !r.prerelease).map(normalizeItem)
    cachedReleases = releases
    return releases
  })()

  try {
    return await inFlight
  } finally {
    inFlight = null
  }
}

export function _resetGitHubReleasesCacheForTests(): void {
  cachedReleases = null
  inFlight = null
}
