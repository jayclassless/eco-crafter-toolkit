import * as Sentry from '@sentry/react'
import { Button } from 'primereact/button'
import { Menu } from 'primereact/menu'
import type { MenuItem } from 'primereact/menuitem'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { applyDatasetUpdate } from '@/lib/apply-dataset-update'
import { importDatasetFromManifestEntry } from '@/lib/import-dataset-from-manifest'
import { useStores } from '@/stores/providers'

import type { DatasetRow } from './types'

interface Props {
  row: DatasetRow
  onSwitch: (datasetId: string) => void
  onManageCustom: (row: DatasetRow) => void
  onDelete: (row: DatasetRow) => void
  onDownloadError: (name: string, err: unknown) => void
  onUpdateError: (name: string, err: unknown) => void
  onUpdateSuccess: (name: string, revision: number) => void
}

export function DatasetActionsMenu({
  row,
  onSwitch,
  onManageCustom,
  onDelete,
  onDownloadError,
  onUpdateError,
  onUpdateSuccess,
}: Props) {
  const { t } = useTranslation()
  const { gameDataStore, buildStore, uiStore } = useStores()
  const menuRef = useRef<Menu>(null)
  const buttonWrapperRef = useRef<HTMLSpanElement>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  // PrimeReact Menu's built-in outside-click handler doesn't fire when the
  // popup is portaled into `document.body` from inside another modal Dialog —
  // the Dialog's mask traps the bubbling click. Track open state ourselves
  // and dispatch our own document-level mousedown listener that hides the
  // menu when the click is outside both the trigger and the menu element.
  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (buttonWrapperRef.current?.contains(target)) return
      const menuEl = menuRef.current?.getElement()
      if (menuEl?.contains(target)) return
      menuRef.current?.hide(event as unknown as React.SyntheticEvent)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  const runDownload = async () => {
    setBusy(true)
    try {
      await importDatasetFromManifestEntry(row.entry, gameDataStore)
    } catch (err) {
      onDownloadError(row.entry.name, err)
    } finally {
      setBusy(false)
    }
  }

  const runUpdate = async () => {
    setBusy(true)
    try {
      await applyDatasetUpdate(row.entry, gameDataStore, buildStore, uiStore)
      onUpdateSuccess(row.entry.name, row.entry.revision)
    } catch (err) {
      Sentry.captureException(err)
      onUpdateError(row.entry.name, err)
    } finally {
      setBusy(false)
    }
  }

  const items: MenuItem[] = []
  if (row.loadedDatasetId === null) {
    items.push({
      label: t('settings.datasets.download'),
      icon: 'pi pi-download',
      command: () => void runDownload(),
    })
  } else {
    if (!row.isActive) {
      items.push({
        label: t('settings.datasets.switch'),
        icon: 'pi pi-arrow-right',
        command: () => onSwitch(row.loadedDatasetId!),
      })
    }
    if (row.availableRevision !== undefined) {
      items.push({
        label: t('settings.datasets.update'),
        icon: 'pi pi-cloud-download',
        command: () => void runUpdate(),
      })
    }
    items.push({
      label: t('settings.datasets.manageCustom'),
      icon: 'pi pi-wrench',
      command: () => onManageCustom(row),
    })
    items.push({
      label: t('settings.datasets.delete'),
      icon: 'pi pi-trash',
      // PrimeReact's MenuItem doesn't have a `severity` prop; the danger color
      // comes from a class targeting the action's <a> child.
      className: 'p-menuitem-danger',
      command: () => onDelete(row),
    })
  }

  return (
    <>
      <span ref={buttonWrapperRef}>
        <Button
          icon={busy ? 'pi pi-spin pi-spinner' : 'pi pi-ellipsis-v'}
          size="small"
          text
          rounded
          aria-label={t('settings.datasets.actionsMenu')}
          aria-haspopup
          disabled={busy}
          onClick={(e) => menuRef.current?.toggle(e)}
        />
      </span>
      <Menu
        ref={menuRef}
        model={items}
        popup
        appendTo={document.body}
        onShow={() => setOpen(true)}
        onHide={() => setOpen(false)}
      />
    </>
  )
}
