import { useCallback, useEffect, useState } from 'react'

import { defaultLocale } from '@/i18n/config'
import {
  loadIndex,
  type LocalizedNameIndex,
  peekIndex,
  subscribeLocalizedNames,
} from '@/stores/localized-name-store'

const EMPTY: LocalizedNameIndex = new Map()

interface LocalizedNameLookup {
  getName: (entityType: string, entityId: string) => string
  /** True once the primary locale's index has loaded. */
  ready: boolean
}

function peekState(datasetId: string, locale: string) {
  if (!datasetId) return { primary: EMPTY, fallback: EMPTY, ready: false }
  const p = peekIndex(datasetId, locale)
  const f = locale === defaultLocale ? p : peekIndex(datasetId, defaultLocale)
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
export function useLocalizedName(
  datasetId: string,
  locale: string = defaultLocale
): LocalizedNameLookup {
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

    let cancelled = false

    const reload = async () => {
      const primaryIdx = await loadIndex(datasetId, locale)
      if (cancelled) return
      setPrimary(primaryIdx)
      if (locale === defaultLocale) {
        setFallback(primaryIdx)
      } else {
        const fallbackIdx = await loadIndex(datasetId, defaultLocale)
        if (cancelled) return
        setFallback(fallbackIdx)
      }
      setReady(true)
    }

    // Sync cache hit: update state directly (React bails on Object.is-equal
    // values, so a hit-on-first-mount is a no-op) and skip the async path.
    const cachedPrimary = peekIndex(datasetId, locale)
    const cachedFallback =
      locale === defaultLocale ? cachedPrimary : peekIndex(datasetId, defaultLocale)
    if (cachedPrimary && cachedFallback) {
      setPrimary(cachedPrimary)
      setFallback(cachedFallback)
      setReady(true)
    } else {
      void reload()
    }

    // Re-load when names are written for this dataset (e.g. a custom item
    // gets renamed). Without this the hook holds a stale snapshot until the
    // component remounts, and renames silently revert in the UI.
    const unsubscribe = subscribeLocalizedNames((changedId) => {
      if (changedId !== datasetId) return
      void reload()
    })

    return () => {
      cancelled = true
      unsubscribe()
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
