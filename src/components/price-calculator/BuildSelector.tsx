import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { TabMenu, type TabMenuTabChangeEvent } from 'primereact/tabmenu'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useBuild } from '@/hooks/use-build'
import { useStores } from '@/stores/providers'

interface Props {
  datasetId: string
  activeBuildId: string
  onSelect: (buildId: string) => void
}

export function BuildSelector({ datasetId, activeBuildId, onSelect }: Props) {
  const { t } = useTranslation()
  const { getBuilds, createBuild } = useBuild()
  const { buildStore } = useStores()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
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

  const items = builds.map((b) => ({
    label: b.name as string,
    id: b.id as string,
    template: () => {
      const id = b.id as string
      const name = b.name as string

      if (editingId === id) {
        return (
          <span
            className="p-menuitem-link flex align-items-center"
            style={{ paddingTop: 0, paddingBottom: 0 }}
          >
            <InputText
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                // TabMenu swallows Space/Enter for menu activation; stop
                // propagation so the input can receive them normally.
                e.stopPropagation()
                if (e.key === 'Enter') commitEdit()
                if (e.key === 'Escape') setEditingId(null)
              }}
              className="p-inputtext-sm"
              style={{
                width: `${Math.max(editValue.length, 4) + 2}ch`,
                padding: '0.25rem 0.5rem',
              }}
            />
          </span>
        )
      }

      return (
        <a
          className="p-menuitem-link flex align-items-center gap-1"
          onClick={() => onSelect(id)}
          role="menuitem"
        >
          <span className="p-menuitem-text">{name}</span>
          <button
            type="button"
            className="p-link text-xs ml-1"
            style={{ opacity: 0.5, padding: 0, border: 'none', background: 'none' }}
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              startEditing(id)
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <i className="pi pi-pencil" />
          </button>
        </a>
      )
    },
  }))

  const activeIndex = items.findIndex((i) => i.id === activeBuildId)

  const handleNew = () => {
    const buildId = createBuild(
      datasetId,
      t('build.selector.defaultName', { number: builds.length + 1 })
    )
    onSelect(buildId)
  }

  const handleChange = (e: TabMenuTabChangeEvent) => {
    const item = items[e.index]
    if (item) onSelect(item.id)
  }

  return (
    <div className="flex align-items-center gap-2">
      {items.length > 0 && (
        <TabMenu
          model={items}
          activeIndex={activeIndex >= 0 ? activeIndex : 0}
          onTabChange={handleChange}
        />
      )}
      <Button
        icon="pi pi-plus"
        label={t('build.selector.newBuild')}
        size="small"
        text
        onClick={handleNew}
      />
    </div>
  )
}
