import { Button } from 'primereact/button'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { applyDatasetUpdate } from '@/lib/apply-dataset-update'
import { useStores } from '@/stores/providers'
import type { ManifestEntry } from '@/types/dataset-manifest'

interface Props {
  entry: ManifestEntry
  onError: (name: string) => void
  onSuccess: (name: string, revision: number) => void
}

export function UpdateDatasetButton({ entry, onError, onSuccess }: Props) {
  const { t } = useTranslation()
  const { gameDataStore, buildStore, uiStore } = useStores()
  const [updating, setUpdating] = useState(false)

  const handleClick = async () => {
    setUpdating(true)
    try {
      await applyDatasetUpdate(entry, gameDataStore, buildStore, uiStore)
      onSuccess(entry.name, entry.revision)
    } catch (err) {
      console.error('Dataset update failed', err)
      onError(entry.name)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <Button
      label={t('settings.datasets.update')}
      icon="pi pi-cloud-download"
      size="small"
      loading={updating}
      onClick={handleClick}
    />
  )
}
