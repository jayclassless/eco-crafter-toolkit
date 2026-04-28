import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { Toast } from 'primereact/toast'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { purgeData } from '@/lib/purge-data'
import { useStores } from '@/stores/providers'

import type { DatasetRow } from './types'

interface Props {
  target: DatasetRow | null
  onHide: () => void
}

export function DeleteDatasetConfirmDialog({ target, onHide }: Props) {
  const { t } = useTranslation()
  const { gameDataStore, buildStore, uiStore, gameDataPersister, buildPersister, uiPersister } =
    useStores()
  const [isDeleting, setIsDeleting] = useState(false)
  const toastRef = useRef<Toast>(null)

  const handleDelete = async () => {
    if (!target?.loadedDatasetId) return
    setIsDeleting(true)
    try {
      await purgeData(
        { datasetIds: [target.loadedDatasetId], purgeAllBuilds: false },
        { gameDataStore, buildStore, uiStore },
        { gameData: gameDataPersister, build: buildPersister, ui: uiPersister }
      )
    } catch (err) {
      console.error('Failed to delete dataset', err)
      toastRef.current?.show({
        severity: 'error',
        summary: t('settings.deleteDataset.errorSummary'),
        detail: t('settings.deleteDataset.errorDetail'),
        life: 5000,
      })
      setIsDeleting(false)
      return
    }
    // App uses HashRouter, so setting href to '/' is just a hashchange (no
    // reload). Clear the hash so on reload the URL is the bare root, then
    // force a full page reload to re-initialize the app from clean stores.
    window.location.hash = ''
    window.location.reload()
  }

  const visible = target !== null
  const buildCount = target?.buildCount ?? 0
  const customItemCount = target?.customItemCount ?? 0
  const customRecipeCount = target?.customRecipeCount ?? 0
  const hasCustom = customItemCount > 0 || customRecipeCount > 0

  const footer = (
    <div className="flex justify-content-end gap-2">
      <Button
        label={t('settings.deleteDataset.cancel')}
        outlined
        disabled={isDeleting}
        onClick={onHide}
      />
      <Button
        label={t('settings.deleteDataset.delete')}
        severity="danger"
        loading={isDeleting}
        onClick={handleDelete}
      />
    </div>
  )

  return (
    <Dialog
      header={t('settings.deleteDataset.title')}
      visible={visible}
      onHide={isDeleting ? () => {} : onHide}
      closable={!isDeleting}
      closeOnEscape={!isDeleting}
      style={{ width: '28rem' }}
      modal
      footer={footer}
    >
      <Toast ref={toastRef} />
      <div className="flex flex-column gap-3">
        <div className="flex align-items-start gap-2">
          <i className="pi pi-exclamation-triangle text-xl" style={{ color: 'var(--red-500)' }} />
          <div className="flex flex-column gap-1">
            <strong>{t('settings.deleteDataset.confirmBody', { name: target?.name ?? '' })}</strong>
            <span>{t('settings.deleteDataset.cannotBeUndone')}</span>
          </div>
        </div>
        {buildCount > 0 && (
          <small className="text-color-secondary">
            {buildCount === 1
              ? t('settings.deleteDataset.tiedBuildsWarningOne')
              : t('settings.deleteDataset.tiedBuildsWarningMany', { count: buildCount })}
          </small>
        )}
        {hasCustom && (
          <small className="text-color-secondary">
            {t('settings.deleteDataset.customCountsWarning', {
              items: customItemCount,
              recipes: customRecipeCount,
            })}
          </small>
        )}
      </div>
    </Dialog>
  )
}
