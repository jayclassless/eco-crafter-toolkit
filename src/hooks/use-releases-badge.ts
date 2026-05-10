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
      .catch((err) => {
        if (controller.signal.aborted) return
        // Swallow for the badge UI (it stays at 0), but surface in the console
        // so a network/API outage isn't invisible.
        console.warn('[releases] failed to fetch GitHub releases for badge:', err)
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
