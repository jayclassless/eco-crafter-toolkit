import { ProgressBar } from 'primereact/progressbar'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocalization } from '@/hooks/use-localization'
import { estimateStorage, type StorageEstimate } from '@/lib/storage-quota'

interface Props {
  /**
   * Bumping this value re-runs the estimate. Use it from the parent so a
   * dataset import or delete refreshes the displayed usage without a remount.
   */
  refreshKey: number
}

const ONE_MB = 1024 * 1024

function formatMB(
  bytes: number,
  formatNumber: (n: number, opts?: Intl.NumberFormatOptions) => string
): string {
  return formatNumber(bytes / ONE_MB, { maximumFractionDigits: 1 })
}

/**
 * Advisory display of `navigator.storage.estimate()`. Browsers deliberately
 * fuzz the reported numbers (Firefox rounds to the nearest 5 MB; Chrome groups
 * by origin), so the value is a hint rather than a guarantee.
 */
export function StorageUsageRow({ refreshKey }: Props) {
  const { t } = useTranslation()
  const { formatNumber, formatPercent } = useLocalization()
  const [estimate, setEstimate] = useState<StorageEstimate | null | 'pending'>('pending')

  useEffect(() => {
    let cancelled = false
    setEstimate('pending')
    void estimateStorage().then((est) => {
      if (!cancelled) setEstimate(est)
    })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  if (estimate === 'pending' || estimate === null) return null

  const { usage, quota } = estimate
  const percent = quota > 0 ? Math.min(100, Math.round((usage / quota) * 100)) : 0
  const usageMB = formatMB(usage, formatNumber)
  const quotaMB = formatMB(quota, formatNumber)

  return (
    <div className="flex flex-column gap-1 mt-3 px-2">
      <div className="flex justify-content-between align-items-center">
        <small className="text-color-secondary">{t('settings.datasets.storageLabel')}</small>
        <small className="text-color-secondary">
          {t('settings.datasets.storageUsageDetail', {
            used: usageMB,
            total: quotaMB,
            percent: formatPercent(percent / 100),
          })}
        </small>
      </div>
      <ProgressBar value={percent} showValue={false} style={{ height: '0.5rem' }} />
      <small className="text-color-secondary" style={{ fontSize: '0.7rem' }}>
        {t('settings.datasets.storageAdvisory')}
      </small>
    </div>
  )
}
