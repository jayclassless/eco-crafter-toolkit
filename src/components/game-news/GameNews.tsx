import { Button } from 'primereact/button'
import { Message } from 'primereact/message'
import { ProgressSpinner } from 'primereact/progressspinner'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { fetchSteamNews, type SteamNewsItem } from '@/lib/steam-news'
import { useStores } from '@/stores/providers'

import { NewsItemCard } from './NewsItemCard'

export function GameNews() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { uiStore } = useStores()

  const [items, setItems] = useState<SteamNewsItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetchSteamNews(5)
      .then((fetched) => {
        if (controller.signal.aborted) return
        setItems(fetched)
        setLoading(false)
        if (fetched.length > 0) {
          const latest = fetched.reduce((max, i) => (i.date > max ? i.date : max), 0)
          uiStore.setCell('uiState', 'main', 'lastNewsViewedAt', latest)
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

  const handleBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }, [navigate])

  const handleRetry = useCallback(() => {
    setReloadKey((k) => k + 1)
  }, [])

  return (
    <div className="flex flex-column h-screen">
      <div className="flex align-items-center gap-3 p-2 pb-0">
        <Button
          icon="pi pi-arrow-left"
          text
          tooltip={t('gameNews.back')}
          tooltipOptions={{ position: 'bottom' }}
          aria-label={t('gameNews.back')}
          onClick={handleBack}
        />
        <h2 className="m-0 text-xl">{t('gameNews.title')}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <div className="flex justify-content-center p-5">
            <ProgressSpinner aria-label={t('gameNews.loading')} />
          </div>
        )}

        {!loading && error && (
          <div
            className="flex flex-column align-items-center gap-3 p-4"
            style={{ maxWidth: '600px', margin: '0 auto' }}
          >
            <Message severity="error" text={t('gameNews.errorTitle')} className="w-full" />
            <Message severity="error" text={error} className="w-full" />
            <Button label={t('gameNews.retry')} icon="pi pi-refresh" onClick={handleRetry} />
          </div>
        )}

        {!loading && !error && items && (
          <div className="flex flex-column gap-6" style={{ maxWidth: '900px', margin: '0 auto' }}>
            {items.map((item) => (
              <NewsItemCard key={item.gid} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
