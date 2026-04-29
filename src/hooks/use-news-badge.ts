import { useEffect, useState } from 'react'

import { fetchSteamNews, type SteamNewsItem } from '@/lib/steam-news'
import { useStores } from '@/stores/providers'

import { useCellValue } from './use-store-revision'

export function useNewsBadgeCount(): number {
  const { uiStore } = useStores()
  const [items, setItems] = useState<SteamNewsItem[] | null>(null)
  const lastViewedAt = useCellValue<number>(uiStore, 'uiState', 'main', 'lastNewsViewedAt') ?? 0

  useEffect(() => {
    const controller = new AbortController()
    fetchSteamNews(5)
      .then((fetched) => {
        if (!controller.signal.aborted) setItems(fetched)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        // Swallow for the badge UI (it stays at 0), but surface in the console
        // so a misconfigured CORS proxy / network outage isn't invisible.
        console.warn('[gameNews] failed to fetch Steam news for badge:', err)
      })
    return () => {
      controller.abort()
    }
  }, [])

  if (!items) return 0
  let count = 0
  for (const item of items) {
    if (item.date > lastViewedAt) count++
  }
  return count
}
