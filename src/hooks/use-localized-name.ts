import { useCallback, useEffect, useState } from 'react'

import { loadIndex, type LocalizedNameIndex } from '@/stores/localized-name-store'

const EMPTY: LocalizedNameIndex = new Map()

export interface LocalizedNameLookup {
  getName: (entityType: string, entityId: string) => string
  /** True once the primary locale's index has loaded. */
  ready: boolean
}

/**
 * Sync name lookup scoped to a dataset. Async-loads the active locale and
 * the en-US fallback on mount; re-renders when they land. Before the indexes
 * are ready `getName()` returns '' — consumers already handle that the same
 * way they handle genuinely-missing names.
 */
export function useLocalizedName(datasetId: string, locale: string = 'en-US'): LocalizedNameLookup {
  const [primary, setPrimary] = useState<LocalizedNameIndex>(EMPTY)
  const [fallback, setFallback] = useState<LocalizedNameIndex>(EMPTY)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!datasetId) {
      setPrimary(EMPTY)
      setFallback(EMPTY)
      setReady(false)
      return
    }
    let cancelled = false
    void (async () => {
      const primaryIdx = await loadIndex(datasetId, locale)
      if (cancelled) return
      setPrimary(primaryIdx)
      if (locale === 'en-US') {
        setFallback(primaryIdx)
      } else {
        const fallbackIdx = await loadIndex(datasetId, 'en-US')
        if (cancelled) return
        setFallback(fallbackIdx)
      }
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [datasetId, locale])

  const getName = useCallback(
    (entityType: string, entityId: string): string => {
      const key = `${entityType}:${entityId}`
      return primary.get(key) ?? fallback.get(key) ?? ''
    },
    [primary, fallback]
  )

  return { getName, ready }
}
