import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import type { MenuItem } from 'primereact/menuitem'
import { SplitButton } from 'primereact/splitbutton'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useBuild } from '@/hooks/use-build'
import { useStores } from '@/stores/providers'

interface Props {
  datasetId: string
  activeBuildId: string
  onSelect: (buildId: string) => void
  onDeleted?: (deletedBuildId: string) => void
}

export function BuildSelector({ datasetId, activeBuildId, onSelect, onDeleted }: Props) {
  const { t } = useTranslation()
  const { getBuilds, createBuild, cloneBuild, deleteBuild } = useBuild()
  const { buildStore } = useStores()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const builds = getBuilds(datasetId)

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  const startEditing = useCallback(
    (buildId: string) => {
      const build = buildStore.getRow('builds', buildId)
      setEditValue((build?.name as string) ?? '')
      setEditingId(buildId)
    },
    [buildStore]
  )

  const commitEdit = useCallback(() => {
    if (editingId && editValue.trim()) {
      buildStore.setCell('builds', editingId, 'name', editValue.trim())
    }
    setEditingId(null)
  }, [editingId, editValue, buildStore])

  const handleClone = useCallback(
    (buildId: string) => {
      const newId = cloneBuild(buildId)
      if (newId) onSelect(newId)
    },
    [cloneBuild, onSelect]
  )

  const handleConfirmDelete = useCallback(() => {
    if (!pendingDeleteId) return
    const id = pendingDeleteId
    setPendingDeleteId(null)
    deleteBuild(id)
    onDeleted?.(id)
  }, [pendingDeleteId, deleteBuild, onDeleted])

  const handleNew = () => {
    const buildId = createBuild(
      datasetId,
      t('build.selector.defaultName', { number: builds.length + 1 })
    )
    onSelect(buildId)
  }

  const pendingDeleteName = pendingDeleteId
    ? ((buildStore.getCell('builds', pendingDeleteId, 'name') as string) ?? '')
    : ''

  return (
    <div className="flex align-items-center gap-2 flex-wrap">
      {builds.map((b) => {
        const id = b.id as string
        const name = b.name as string

        if (editingId === id) {
          return (
            <InputText
              key={id}
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit()
                if (e.key === 'Escape') setEditingId(null)
              }}
              className="p-inputtext-sm"
              style={{
                width: `${Math.max(editValue.length, 4) + 2}ch`,
                padding: '0.25rem 0.5rem',
              }}
            />
          )
        }

        const menuModel: MenuItem[] = [
          {
            label: t('build.selector.rename'),
            icon: 'pi pi-pencil',
            command: () => startEditing(id),
          },
          {
            label: t('build.selector.clone'),
            icon: 'pi pi-copy',
            command: () => handleClone(id),
          },
          {
            label: t('build.selector.delete'),
            icon: 'pi pi-trash',
            className: 'text-red-500',
            command: () => setPendingDeleteId(id),
          },
        ]

        return (
          <SplitButton
            key={id}
            label={name}
            size="small"
            outlined={id !== activeBuildId}
            onClick={() => onSelect(id)}
            model={menuModel}
            className="build-selector-split"
          />
        )
      })}
      <Button
        icon="pi pi-plus"
        label={t('build.selector.newBuild')}
        size="small"
        text
        onClick={handleNew}
      />
      <Dialog
        header={t('priceCalculator.config.deleteBuildConfirmTitle')}
        visible={pendingDeleteId !== null}
        onHide={() => setPendingDeleteId(null)}
        footer={
          <div className="flex justify-content-end gap-2">
            <Button
              label={t('priceCalculator.config.cancel')}
              text
              onClick={() => setPendingDeleteId(null)}
            />
            <Button
              label={t('build.selector.delete')}
              severity="danger"
              icon="pi pi-trash"
              onClick={handleConfirmDelete}
            />
          </div>
        }
      >
        <p>{t('priceCalculator.config.deleteBuildConfirmMessage', { name: pendingDeleteName })}</p>
      </Dialog>
    </div>
  )
}
