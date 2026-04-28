import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { Tooltip } from 'primereact/tooltip'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocalizedName } from '@/hooks/use-localized-name'
import { useStoreRevision } from '@/hooks/use-store-revision'
import { defaultLocale } from '@/i18n/config'
import {
  createCustomItem,
  deleteCustomItem,
  isItemReferencedByAnyRecipe,
  renameCustomItem,
} from '@/lib/custom-entities'
import { useStores } from '@/stores/providers'

interface ItemRow {
  id: string
  name: string
  inUse: boolean
}

interface Props {
  datasetId: string
}

const TABLES = ['items', 'recipeElements'] as const

export function CustomItemsTab({ datasetId }: Props) {
  const { t } = useTranslation()
  const { gameDataStore } = useStores()
  const { getName } = useLocalizedName(datasetId)
  const rev = useStoreRevision(gameDataStore, TABLES)

  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')
  const [renameTarget, setRenameTarget] = useState<ItemRow | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ItemRow | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const rows = useMemo<ItemRow[]>(() => {
    const out: ItemRow[] = []
    for (const id of gameDataStore.getRowIds('items')) {
      if (gameDataStore.getCell('items', id, 'datasetId') !== datasetId) continue
      if (!gameDataStore.getCell('items', id, 'isCustom')) continue
      out.push({
        id,
        name: getName('item', id) || (gameDataStore.getCell('items', id, 'name') as string),
        inUse: isItemReferencedByAnyRecipe(gameDataStore, id),
      })
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameDataStore, datasetId, getName, rev])

  // PrimeReact Dialog mounts the body lazily, so the input ref is null on the
  // first render of an open dialog. Focus on the next tick after `visible`
  // flips so the rename input grabs focus reliably.
  useEffect(() => {
    if (renameTarget === null) return
    const id = window.setTimeout(() => renameInputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [renameTarget])

  const handleAdd = async () => {
    setError('')
    const trimmed = newName.trim()
    if (!trimmed) return
    try {
      await createCustomItem(gameDataStore, datasetId, trimmed, defaultLocale)
      setNewName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const openRename = (row: ItemRow) => {
    setRenameTarget(row)
    setRenameValue(row.name)
    setRenameError('')
  }

  const handleRenameSave = async () => {
    if (!renameTarget) return
    setRenameError('')
    try {
      await renameCustomItem(gameDataStore, renameTarget.id, renameValue, defaultLocale)
      setRenameTarget(null)
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setError('')
    try {
      await deleteCustomItem(gameDataStore, deleteTarget.id)
      setDeleteTarget(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const nameTemplate = (row: ItemRow) => <span>{row.name}</span>

  const actionsTemplate = (row: ItemRow) => (
    <div className="flex gap-2 justify-content-end">
      <Button icon="pi pi-pencil" size="small" outlined onClick={() => openRename(row)} />
      <span
        data-pr-tooltip={row.inUse ? t('settings.customEntities.itemInUseTooltip') : undefined}
        className="custom-items-trash-anchor"
      >
        <Button
          icon="pi pi-trash"
          severity="danger"
          size="small"
          outlined
          disabled={row.inUse}
          onClick={() => setDeleteTarget(row)}
        />
      </span>
    </div>
  )

  return (
    <div className="flex flex-column gap-3">
      <div className="flex gap-2 align-items-center">
        <InputText
          className="flex-grow-1"
          placeholder={t('settings.customEntities.addItemPlaceholder')}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleAdd()
          }}
        />
        <Button
          label={t('settings.customEntities.addItem')}
          icon="pi pi-plus"
          onClick={() => void handleAdd()}
          disabled={!newName.trim()}
        />
      </div>
      {error && <small className="text-color-danger">{error}</small>}
      <Tooltip target=".custom-items-trash-anchor[data-pr-tooltip]" />
      <DataTable
        value={rows}
        dataKey="id"
        size="small"
        emptyMessage={t('settings.customEntities.noItems')}
      >
        <Column header={t('settings.customEntities.columnItemName')} body={nameTemplate} />
        <Column body={actionsTemplate} style={{ width: '10rem' }} />
      </DataTable>
      <Dialog
        header={t('settings.customEntities.renameItemTitle')}
        visible={renameTarget !== null}
        onHide={() => setRenameTarget(null)}
        style={{ width: '24rem' }}
        modal
        footer={
          <div className="flex justify-content-end gap-2">
            <Button
              label={t('settings.customEntities.cancel')}
              outlined
              onClick={() => setRenameTarget(null)}
            />
            <Button
              label={t('settings.customEntities.save')}
              onClick={() => void handleRenameSave()}
              disabled={!renameValue.trim()}
            />
          </div>
        }
      >
        <div className="flex flex-column gap-2">
          <InputText
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleRenameSave()
              else if (e.key === 'Escape') setRenameTarget(null)
            }}
          />
          {renameError && <small className="text-color-danger">{renameError}</small>}
        </div>
      </Dialog>
      <Dialog
        header={t('settings.customEntities.deleteItemTitle')}
        visible={deleteTarget !== null}
        onHide={() => setDeleteTarget(null)}
        style={{ width: '24rem' }}
        modal
        footer={
          <div className="flex justify-content-end gap-2">
            <Button
              label={t('settings.customEntities.cancel')}
              outlined
              onClick={() => setDeleteTarget(null)}
            />
            <Button
              label={t('settings.customEntities.delete')}
              severity="danger"
              onClick={() => void handleDelete()}
            />
          </div>
        }
      >
        <span>
          {t('settings.customEntities.deleteItemBody', { name: deleteTarget?.name ?? '' })}
        </span>
      </Dialog>
    </div>
  )
}
