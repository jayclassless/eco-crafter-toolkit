import { useEffect, useCallback, type ReactNode } from 'react'

import { markThemeReady } from '@/lib/app-ready'
import { markLoaderMilestone } from '@/lib/loader-progress'
import { useStores } from '@/stores/providers'

function resolveMode(themeMode: string): 'light' | 'dark' {
  if (themeMode === 'light') return 'light'
  if (themeMode === 'dark') return 'dark'
  // auto: check system preference
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'dark'
}

function getThemeHref(mode: 'light' | 'dark', color: string): string {
  return `/primereact-themes/lara-${mode}-${color}/theme.css`
}

function ensureThemeLink(href: string): void {
  let link = document.getElementById('theme-link') as HTMLLinkElement | null
  const created = !link
  if (!link) {
    link = document.createElement('link')
    link.id = 'theme-link'
    link.rel = 'stylesheet'
    document.head.appendChild(link)
  }
  const absolute = new URL(href, window.location.origin).href
  if (link.href !== absolute) {
    // Only the very first successful load gates the app-ready signal.
    // Subsequent theme swaps (user changing themes) are best-effort.
    if (created) {
      const onload = () => {
        markThemeReady()
        markLoaderMilestone('theme')
      }
      const onerror = () => {
        markThemeReady()
        markLoaderMilestone('theme')
      }
      link.addEventListener('load', onload, { once: true })
      link.addEventListener('error', onerror, { once: true })
    }
    link.href = href
  } else if (created) {
    // Defensive: link already pointed at the right href (shouldn't happen
    // on first mount, but don't hang the loader if it does).
    markThemeReady()
    markLoaderMilestone('theme')
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { uiStore } = useStores()

  const applyTheme = useCallback(() => {
    const themeMode = uiStore.getCell('uiState', 'main', 'themeMode') as string
    const themeColor = uiStore.getCell('uiState', 'main', 'themeColor') as string
    const uiScale = uiStore.getCell('uiState', 'main', 'uiScale') as number

    const mode = resolveMode(themeMode)
    ensureThemeLink(getThemeHref(mode, themeColor))
    document.documentElement.style.fontSize = `${uiScale}px`
  }, [uiStore])

  // Apply theme on mount and whenever uiStore changes
  useEffect(() => {
    applyTheme()
    const listenerId = uiStore.addRowListener('uiState', 'main', () => {
      applyTheme()
    })
    return () => {
      uiStore.delListener(listenerId)
    }
  }, [uiStore, applyTheme])

  // Listen for system color scheme changes when in auto mode
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      const themeMode = uiStore.getCell('uiState', 'main', 'themeMode') as string
      if (themeMode === 'auto') {
        applyTheme()
      }
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [uiStore, applyTheme])

  return <>{children}</>
}
