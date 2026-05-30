import { useEffect, useState } from 'react'

import { fetchGitHubReleases, type GitHubRelease } from '@/lib/github-releases'
import { useStores } from '@/stores/providers'

import { useCellValue } from './use-store-revision'

export function useReleasesBadgeCount(): number {
  const { uiStore } = useStores()
  const [items, setItems] = useState<GitHubRelease[] | null>(null)
  const lastViewedAt = useCellValue<number>(uiStore, 'uiState', 'main', 'lastReleasesViewedAt') ?? 0

  useEffect(() => {
    const controller = new AbortController()
    fetchGitHubReleases()
      .then((fetched) => {
        if (!controller.signal.aborted) setItems(fetched)
      })
      .catch(() => {
        // Swallow for the badge UI (it stays at 0). A failed background fetch
        // (offline, rate limit, transient API/network error) is routine and
        // not worth reporting.
      })
    return () => {
      controller.abort()
    }
  }, [])

  if (!items) return 0
  let count = 0
  for (const release of items) {
    const ts = Date.parse(release.published_at)
    if (Number.isFinite(ts) && ts > lastViewedAt) count++
  }
  return count
}
