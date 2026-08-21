import { Button } from 'primereact/button'
import { Message } from 'primereact/message'
import { ProgressSpinner } from 'primereact/progressspinner'
import { memo, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchGitHubReleases, type GitHubRelease } from '@/lib/github-releases'
import { useStores } from '@/stores/providers'

import { AboutDialogReleasePanel } from './AboutDialogReleasePanel'

import './AboutDialogUpdateHistoryTab.css'

function AboutDialogUpdateHistoryTabImpl() {
  const { t } = useTranslation()
  const { uiStore } = useStores()

  const [items, setItems] = useState<GitHubRelease[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  // `loading` / `error` start in their pending state and are reset by the
  // retry click that bumps `reloadKey`, so this effect only has to fetch.
  useEffect(() => {
    const controller = new AbortController()
    fetchGitHubReleases()
      .then((fetched) => {
        if (controller.signal.aborted) return
        setItems(fetched)
        setLoading(false)
        if (fetched.length > 0) {
          const latest = fetched.reduce((max, r) => {
            const t = Date.parse(r.published_at)
            return Number.isFinite(t) && t > max ? t : max
          }, 0)
          if (latest > 0) {
            uiStore.setCell('uiState', 'main', 'lastReleasesViewedAt', latest)
          }
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
    return () => {
      controller.abort()
    }
  }, [uiStore, reloadKey])

  const handleRetry = useCallback(() => {
    setLoading(true)
    setError(null)
    setReloadKey((k) => k + 1)
  }, [])

  if (loading) {
    return (
      <div className="flex justify-content-center p-5">
        <ProgressSpinner aria-label={t('settings.about.loadingHistory')} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-column align-items-center gap-3 p-4">
        <Message severity="error" text={t('settings.about.historyErrorTitle')} className="w-full" />
        <Message severity="error" text={error} className="w-full" />
        <Button
          label={t('settings.about.historyRetry')}
          icon="pi pi-refresh"
          onClick={handleRetry}
        />
      </div>
    )
  }

  if (!items || items.length === 0) {
    return (
      <div className="p-3">
        <Message severity="info" text={t('settings.about.historyEmpty')} className="w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-column gap-4">
      {items.map((release) => (
        <AboutDialogReleasePanel key={release.id} release={release} />
      ))}
    </div>
  )
}

export const AboutDialogUpdateHistoryTab = memo(AboutDialogUpdateHistoryTabImpl)
