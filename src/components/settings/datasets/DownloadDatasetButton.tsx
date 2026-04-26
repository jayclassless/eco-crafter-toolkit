import { Button } from 'primereact/button'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { importDatasetFromManifestEntry } from '@/lib/import-dataset-from-manifest'
import { useStores } from '@/stores/providers'
import type { ManifestEntry } from '@/types/dataset-manifest'

interface Props {
  entry: ManifestEntry
  onError: (name: string) => void
}

export function DownloadDatasetButton({ entry, onError }: Props) {
  const { t } = useTranslation()
  const { gameDataStore } = useStores()
  const [downloading, setDownloading] = useState(false)

  const handleClick = async () => {
    setDownloading(true)
    try {
      await importDatasetFromManifestEntry(entry, gameDataStore)
    } catch {
      onError(entry.name)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Button
      label={t('settings.datasets.download')}
      icon="pi pi-download"
      size="small"
      loading={downloading}
      onClick={handleClick}
    />
  )
}
