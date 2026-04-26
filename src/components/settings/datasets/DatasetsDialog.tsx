import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Dialog } from 'primereact/dialog'
import { ProgressSpinner } from 'primereact/progressspinner'
import { Tag } from 'primereact/tag'
import { Toast } from 'primereact/toast'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { countBuildsByDataset, getDatasetIdsByBundledId } from '@/lib/dataset-utils'
import { fetchDatasetManifest } from '@/lib/fetch-manifest'
import { useStores } from '@/stores/providers'
import type { DatasetManifest } from '@/types/dataset-manifest'

import { DeleteDatasetConfirmDialog } from './DeleteDatasetConfirmDialog'
import { DownloadDatasetButton } from './DownloadDatasetButton'
import type { DatasetRow } from './types'

interface Props {
  visible: boolean
  onHide: () => void
  activeDatasetId: string
  onSwitch: (datasetId: string) => void
}

type LoadState = 'idle' | 'loading' | 'error'

export function DatasetsDialog({ visible, onHide, activeDatasetId, onSwitch }: Props) {
  const { t } = useTranslation()
  const { gameDataStore, buildStore } = useStores()

  const [manifest, setManifest] = useState<DatasetManifest | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [storeTick, setStoreTick] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<DatasetRow | null>(null)
  const toastRef = useRef<Toast>(null)

  const loadManifest = useCallback(() => {
    setLoadState('loading')
    fetchDatasetManifest()
      .then((m) => {
        setManifest(m)
        setLoadState('idle')
      })
      .catch(() => setLoadState('error'))
  }, [])

  useEffect(() => {
    if (!visible) return
    loadManifest()
    const dsListener = gameDataStore.addTableListener('datasets', () => setStoreTick((n) => n + 1))
    const buildListener = buildStore.addTableListener('builds', () => setStoreTick((n) => n + 1))
    return () => {
      gameDataStore.delListener(dsListener)
      buildStore.delListener(buildListener)
    }
  }, [visible, gameDataStore, buildStore, loadManifest])

  const rows: DatasetRow[] = useMemo(() => {
    if (!manifest) return []
    // storeTick is read here so changes to the underlying stores
    // re-derive rows even though the listener doesn't pass new data.
    void storeTick
    const idsByBundled = getDatasetIdsByBundledId(gameDataStore)
    const buildsByDataset = countBuildsByDataset(buildStore)
    return manifest.datasets.map((entry) => {
      const loadedDatasetId = idsByBundled.get(entry.id) ?? null
      return {
        manifestId: entry.id,
        name: entry.name,
        updatedAt: entry.updatedAt,
        loadedDatasetId,
        isActive: loadedDatasetId !== null && loadedDatasetId === activeDatasetId,
        buildCount: loadedDatasetId ? (buildsByDataset[loadedDatasetId] ?? 0) : 0,
        entry,
      }
    })
  }, [manifest, storeTick, gameDataStore, buildStore, activeDatasetId])

  const handleDownloadError = useCallback(
    (name: string) => {
      toastRef.current?.show({
        severity: 'error',
        summary: t('settings.datasets.downloadErrorSummary'),
        detail: t('settings.datasets.downloadErrorDetail', { name }),
        life: 5000,
      })
    },
    [t]
  )

  const buildsTemplate = (row: DatasetRow) =>
    row.loadedDatasetId === null ? t('settings.datasets.noBuilds') : String(row.buildCount)

  const nameTemplate = (row: DatasetRow) => (
    <div className="flex align-items-center gap-2">
      <span>{row.name}</span>
      {row.isActive && <Tag value={t('settings.datasets.activeBadge')} severity="success" />}
    </div>
  )

  const actionTemplate = (row: DatasetRow) => {
    const content =
      row.loadedDatasetId === null ? (
        <DownloadDatasetButton entry={row.entry} onError={handleDownloadError} />
      ) : (
        <>
          {!row.isActive && (
            <Button
              label={t('settings.datasets.switch')}
              icon="pi pi-arrow-right"
              size="small"
              onClick={() => onSwitch(row.loadedDatasetId!)}
            />
          )}
          <Button
            label={t('settings.datasets.delete')}
            icon="pi pi-trash"
            severity="danger"
            outlined
            size="small"
            onClick={() => setDeleteTarget(row)}
          />
        </>
      )
    return <div className="flex gap-2 justify-content-center">{content}</div>
  }

  return (
    <Dialog
      header={t('settings.datasets.dialogTitle')}
      visible={visible}
      onHide={onHide}
      style={{ width: '48rem' }}
      modal
    >
      <Toast ref={toastRef} />
      {loadState === 'loading' && (
        <div className="flex justify-content-center p-4">
          <ProgressSpinner />
        </div>
      )}
      {loadState === 'error' && (
        <div className="flex flex-column align-items-center gap-3 p-4">
          <span>{t('settings.datasets.loadFailed')}</span>
          <Button
            label={t('settings.datasets.retry')}
            icon="pi pi-refresh"
            onClick={loadManifest}
          />
        </div>
      )}
      {loadState === 'idle' && manifest !== null && (
        <DataTable value={rows} dataKey="manifestId" size="small">
          <Column header={t('settings.datasets.columnName')} body={nameTemplate} />
          <Column
            field="updatedAt"
            header={t('settings.datasets.columnUpdated')}
            style={{ width: '10rem' }}
          />
          <Column
            header={t('settings.datasets.columnBuilds')}
            body={buildsTemplate}
            style={{ width: '7rem' }}
          />
          <Column body={actionTemplate} style={{ width: '15rem' }} />
        </DataTable>
      )}
      <DeleteDatasetConfirmDialog target={deleteTarget} onHide={() => setDeleteTarget(null)} />
    </Dialog>
  )
}
