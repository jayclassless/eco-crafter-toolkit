import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Dialog } from 'primereact/dialog'
import { ProgressSpinner } from 'primereact/progressspinner'
import { Tag } from 'primereact/tag'
import { Toast } from 'primereact/toast'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocalization } from '@/hooks/use-localization'
import { countCustomEntities } from '@/lib/custom-entities'
import { countBuildsByDataset, getDatasetIdsByBundledId } from '@/lib/dataset-utils'
import { fetchDatasetManifest } from '@/lib/fetch-manifest'
import { isQuotaExceeded } from '@/lib/storage-quota'
import { useStores } from '@/stores/providers'
import type { DatasetManifest } from '@/types/dataset-manifest'

import { CustomEntitiesDialog } from './CustomEntitiesDialog'
import { DatasetActionsMenu } from './DatasetActionsMenu'
import { DeleteDatasetConfirmDialog } from './DeleteDatasetConfirmDialog'
import { StorageUsageRow } from './StorageUsageRow'
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
  const { formatNumber } = useLocalization()
  const { gameDataStore, buildStore } = useStores()

  const [manifest, setManifest] = useState<DatasetManifest | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [storeTick, setStoreTick] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<DatasetRow | null>(null)
  const [manageTarget, setManageTarget] = useState<DatasetRow | null>(null)
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
    const bump = () => setStoreTick((n) => n + 1)
    const dsListener = gameDataStore.addTableListener('datasets', bump)
    const itemsListener = gameDataStore.addTableListener('items', bump)
    const recipesListener = gameDataStore.addTableListener('recipes', bump)
    const buildListener = buildStore.addTableListener('builds', bump)
    return () => {
      gameDataStore.delListener(dsListener)
      gameDataStore.delListener(itemsListener)
      gameDataStore.delListener(recipesListener)
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
      const installedRevision =
        loadedDatasetId !== null
          ? ((gameDataStore.getCell('datasets', loadedDatasetId, 'installedRevision') as number) ??
            0)
          : 0
      const availableRevision =
        loadedDatasetId !== null && entry.revision > installedRevision ? entry.revision : undefined
      // Show the locally-installed name when the dataset is installed; the
      // manifest name reflects the latest revision and may differ (e.g. minor
      // version bump). Fall back to the manifest name for not-yet-installed
      // datasets.
      const localName =
        loadedDatasetId !== null
          ? (gameDataStore.getCell('datasets', loadedDatasetId, 'name') as string) || entry.name
          : entry.name
      const customCounts = loadedDatasetId
        ? countCustomEntities(gameDataStore, loadedDatasetId)
        : { items: 0, recipes: 0 }
      return {
        manifestId: entry.id,
        name: localName,
        updatedAt: entry.updatedAt,
        loadedDatasetId,
        isActive: loadedDatasetId !== null && loadedDatasetId === activeDatasetId,
        buildCount: loadedDatasetId ? (buildsByDataset[loadedDatasetId] ?? 0) : 0,
        customItemCount: customCounts.items,
        customRecipeCount: customCounts.recipes,
        availableRevision,
        entry,
      }
    })
  }, [manifest, storeTick, gameDataStore, buildStore, activeDatasetId])

  const handleDownloadError = useCallback(
    (name: string, err: unknown) => {
      const quota = isQuotaExceeded(err)
      toastRef.current?.show({
        severity: 'error',
        summary: quota
          ? t('settings.datasets.storageFullSummary')
          : t('settings.datasets.downloadErrorSummary'),
        detail: quota
          ? t('settings.datasets.storageFullDetail')
          : t('settings.datasets.downloadErrorDetail', { name }),
        life: 8000,
      })
    },
    [t]
  )

  const handleUpdateError = useCallback(
    (name: string, err: unknown) => {
      const quota = isQuotaExceeded(err)
      toastRef.current?.show({
        severity: 'error',
        summary: quota
          ? t('settings.datasets.storageFullSummary')
          : t('settings.datasets.updateErrorSummary'),
        detail: quota
          ? t('settings.datasets.storageFullDetail')
          : t('settings.datasets.updateErrorDetail', { name }),
        life: 8000,
      })
    },
    [t]
  )

  const handleUpdateSuccess = useCallback(
    (name: string, rev: number) => {
      toastRef.current?.show({
        severity: 'success',
        summary: t('settings.datasets.updateSuccessSummary'),
        detail: t('settings.datasets.updateSuccessDetail', { name, rev }),
        life: 3000,
      })
    },
    [t]
  )

  const buildsTemplate = (row: DatasetRow) =>
    row.loadedDatasetId === null ? t('settings.datasets.noBuilds') : formatNumber(row.buildCount)

  const customItemsTemplate = (row: DatasetRow) =>
    row.loadedDatasetId === null
      ? t('settings.datasets.noBuilds')
      : formatNumber(row.customItemCount)

  const customRecipesTemplate = (row: DatasetRow) =>
    row.loadedDatasetId === null
      ? t('settings.datasets.noBuilds')
      : formatNumber(row.customRecipeCount)

  const nameTemplate = (row: DatasetRow) => (
    <div className="flex align-items-center gap-2">
      <span>{row.name}</span>
      {row.isActive && <Tag value={t('settings.datasets.activeBadge')} severity="success" />}
    </div>
  )

  const actionTemplate = (row: DatasetRow) => (
    <div className="flex justify-content-end">
      <DatasetActionsMenu
        row={row}
        onSwitch={onSwitch}
        onManageCustom={(r) => setManageTarget(r)}
        onDelete={(r) => setDeleteTarget(r)}
        onDownloadError={handleDownloadError}
        onUpdateError={handleUpdateError}
        onUpdateSuccess={handleUpdateSuccess}
      />
    </div>
  )

  return (
    <Dialog
      header={t('settings.datasets.dialogTitle')}
      visible={visible}
      onHide={onHide}
      style={{ width: '50rem' }}
      modal
      dismissableMask
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
        <>
          <DataTable value={rows} dataKey="manifestId" size="small">
            <Column header={t('settings.datasets.columnName')} body={nameTemplate} />
            <Column
              field="updatedAt"
              header={t('settings.datasets.columnUpdated')}
              style={{ width: '8rem' }}
            />
            <Column
              header={t('settings.datasets.columnBuilds')}
              body={buildsTemplate}
              style={{ width: '7rem' }}
            />
            <Column
              header={t('settings.datasets.columnCustomItems')}
              body={customItemsTemplate}
              style={{ width: '7rem' }}
            />
            <Column
              header={t('settings.datasets.columnCustomRecipes')}
              body={customRecipesTemplate}
              style={{ width: '7rem' }}
            />
            <Column body={actionTemplate} style={{ width: '3rem' }} />
          </DataTable>
          <StorageUsageRow refreshKey={storeTick} />
        </>
      )}
      <DeleteDatasetConfirmDialog target={deleteTarget} onHide={() => setDeleteTarget(null)} />
      <CustomEntitiesDialog
        visible={manageTarget !== null}
        onHide={() => setManageTarget(null)}
        datasetId={manageTarget?.loadedDatasetId ?? ''}
      />
    </Dialog>
  )
}
