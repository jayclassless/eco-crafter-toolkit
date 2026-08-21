import { useCallback, useEffect, useState } from 'react'

import { useResetOnChange } from '@/hooks/use-reset-on-change'
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

  // The lazy initializers above only cover the first render. On a dataset or
  // locale switch, re-peek during render so a warm cache paints the new names
  // in the same commit — and a cold one blanks them rather than leaving the
  // previous dataset's names on screen.
  useResetOnChange(`${datasetId}\u0000${locale}`, () => {
    const next = peekState(datasetId, locale)
    setPrimary(next.primary)
    setFallback(next.fallback)
    setReady(next.ready)
  })

  useEffect(() => {
    // Without a dataset there is nothing to load; `getName` short-circuits on
    // the same condition rather than us clearing the indexes into state.
    if (!datasetId) return

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

    // A cache hit has already been applied during render (state initializer on
    // mount, `useResetOnChange` on a switch), so only a miss needs the async
    // path.
    const cachedPrimary = peekIndex(datasetId, locale)
    const cachedFallback =
      locale === defaultLocale ? cachedPrimary : peekIndex(datasetId, defaultLocale)
    if (!cachedPrimary || !cachedFallback) void reload()

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
      if (!datasetId) return ''
      const key = `${entityType}:${entityId}`
      return primary.get(key) ?? fallback.get(key) ?? ''
    },
    [datasetId, primary, fallback]
  )

  return { getName, ready: !!datasetId && ready }
}
