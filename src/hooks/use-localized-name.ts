import { useCallback, useEffect, useState } from 'react'

import { loadIndex, peekIndex, type LocalizedNameIndex } from '@/stores/localized-name-store'

const EMPTY: LocalizedNameIndex = new Map()

export interface LocalizedNameLookup {
  getName: (entityType: string, entityId: string) => string
  /** True once the primary locale's index has loaded. */
  ready: boolean
}

function peekState(datasetId: string, locale: string) {
  if (!datasetId) return { primary: EMPTY, fallback: EMPTY, ready: false }
  const p = peekIndex(datasetId, locale)
  const f = locale === 'en-US' ? p : peekIndex(datasetId, 'en-US')
  if (p && f) return { primary: p, fallback: f, ready: true }
  return { primary: p ?? EMPTY, fallback: f ?? EMPTY, ready: false }
}

/**
 * Sync name lookup scoped to a dataset. Initializes from the module-level
 * cache — `StoreProvider` prefetches the active dataset's index at startup,
 * so the common case renders names on the first paint with no re-render.
 * On a cache miss, falls back to an async load and re-renders when it lands.
 * Before the indexes are ready `getName()` returns '' — consumers handle
 * that the same way they handle genuinely-missing names.
 */
export function useLocalizedName(datasetId: string, locale: string = 'en-US'): LocalizedNameLookup {
  const [primary, setPrimary] = useState<LocalizedNameIndex>(
    () => peekState(datasetId, locale).primary
  )
  const [fallback, setFallback] = useState<LocalizedNameIndex>(
    () => peekState(datasetId, locale).fallback
  )
  const [ready, setReady] = useState<boolean>(() => peekState(datasetId, locale).ready)

  useEffect(() => {
    if (!datasetId) {
      setPrimary(EMPTY)
      setFallback(EMPTY)
      setReady(false)
      return
    }
    // Sync cache hit: update state directly (React bails on Object.is-equal
    // values, so a hit-on-first-mount is a no-op) and skip the async path.
    const cachedPrimary = peekIndex(datasetId, locale)
    const cachedFallback = locale === 'en-US' ? cachedPrimary : peekIndex(datasetId, 'en-US')
    if (cachedPrimary && cachedFallback) {
      setPrimary(cachedPrimary)
      setFallback(cachedFallback)
      setReady(true)
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
