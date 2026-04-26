import { Button } from 'primereact/button'
import { Toast, type ToastMessage } from 'primereact/toast'
import { type RefObject, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Store } from 'tinybase'

import { applyDatasetUpdate } from '@/lib/apply-dataset-update'
import type { AvailableUpdate } from '@/lib/find-available-updates'

interface Stores {
  gameDataStore: Store
  buildStore: Store
  uiStore: Store
}

interface ContentProps {
  update: AvailableUpdate
  localName: string
  stores: Stores
  onSuccess: () => void
  onError: () => void
}

function UpdateToastContent({ update, localName, stores, onSuccess, onError }: ContentProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    try {
      await applyDatasetUpdate(
        update.entry,
        stores.gameDataStore,
        stores.buildStore,
        stores.uiStore
      )
      onSuccess()
    } catch (err) {
      console.error('Dataset update failed', err)
      onError()
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-column gap-2 p-2" style={{ width: '100%' }}>
      <div className="flex align-items-start gap-2">
        <i className="pi pi-info-circle text-xl" style={{ marginTop: '0.15rem' }} />
        <div className="flex flex-column gap-1">
          <strong>{t('settings.datasets.updateToastSummary')}</strong>
          <small>{t('settings.datasets.updateToastDetail', { name: localName })}</small>
        </div>
      </div>
      <div className="flex justify-content-end">
        <Button
          label={t('settings.datasets.update')}
          icon="pi pi-cloud-download"
          size="small"
          loading={loading}
          onClick={handleClick}
        />
      </div>
    </div>
  )
}

export function showUpdateToast(
  toastRef: RefObject<Toast | null>,
  update: AvailableUpdate,
  stores: Stores,
  t: (key: string, values?: Record<string, unknown>) => string
): void {
  // Use the locally-installed dataset's name in the prompt — that's what the
  // user recognizes. The manifest entry's name reflects the *new* revision and
  // can drift (e.g. "Eco v13.0.1" → "Eco v13.0.2") when the bundle is bumped.
  const localName =
    (stores.gameDataStore.getCell('datasets', update.datasetId, 'name') as string) ||
    update.entry.name

  const message: ToastMessage = {
    severity: 'info',
    sticky: true,
    closable: true,
  }
  message.content = (
    <UpdateToastContent
      update={update}
      localName={localName}
      stores={stores}
      onSuccess={() => {
        toastRef.current?.remove(message)
        toastRef.current?.show({
          severity: 'success',
          summary: t('settings.datasets.updateSuccessSummary'),
          detail: t('settings.datasets.updateSuccessDetail', {
            name: update.entry.name,
            rev: update.availableRevision,
          }),
          life: 3000,
        })
      }}
      onError={() => {
        toastRef.current?.show({
          severity: 'error',
          summary: t('settings.datasets.updateErrorSummary'),
          detail: t('settings.datasets.updateErrorDetail', { name: localName }),
          life: 5000,
        })
      }}
    />
  )
  toastRef.current?.show(message)
}
