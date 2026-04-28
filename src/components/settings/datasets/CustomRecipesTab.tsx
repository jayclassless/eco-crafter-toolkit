import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Dialog } from 'primereact/dialog'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { RecipeIcon } from '@/components/common/RecipeIcon'
import { SkillIcon } from '@/components/common/SkillIcon'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { buildRecipeProductItemIds } from '@/hooks/use-products'
import { useStoreRevision } from '@/hooks/use-store-revision'
import { deleteCustomRecipe } from '@/lib/custom-entities'
import { useStores } from '@/stores/providers'

import { CustomRecipeFormDialog } from './CustomRecipeFormDialog'

interface RecipeRow {
  id: string
  name: string
  skillId: string
  skillName: string
  skillRawName: string
  productName: string
  productRawName: string
}

interface Props {
  datasetId: string
}

const TABLES = ['recipes', 'recipeElements', 'modifiers'] as const

export function CustomRecipesTab({ datasetId }: Props) {
  const { t } = useTranslation()
  const { gameDataStore } = useStores()
  const { getName } = useLocalizedName(datasetId)
  const rev = useStoreRevision(gameDataStore, TABLES)

  const [formVisible, setFormVisible] = useState(false)
  const [editTarget, setEditTarget] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RecipeRow | null>(null)
  const [error, setError] = useState('')

  const rows = useMemo<RecipeRow[]>(() => {
    const productsByRecipeId = buildRecipeProductItemIds(gameDataStore)
    const out: RecipeRow[] = []
    for (const id of gameDataStore.getRowIds('recipes')) {
      if (gameDataStore.getCell('recipes', id, 'datasetId') !== datasetId) continue
      if (!gameDataStore.getCell('recipes', id, 'isCustom')) continue
      const recipeName =
        getName('recipe', id) || (gameDataStore.getCell('recipes', id, 'name') as string)
      const skillId = (gameDataStore.getCell('recipes', id, 'skillId') as string) ?? ''
      const skillRow = skillId ? gameDataStore.getRow('skills', skillId) : null
      const skillRawName = skillRow ? (skillRow.name as string) : ''
      const skillName = skillId ? getName('skill', skillId) || skillRawName : ''
      const productIds = productsByRecipeId.get(id) ?? []
      const primaryProductId = productIds[0] ?? ''
      const productRow = primaryProductId ? gameDataStore.getRow('items', primaryProductId) : null
      const productRawName = productRow ? (productRow.name as string) : ''
      const productName = primaryProductId
        ? getName('item', primaryProductId) || productRawName
        : ''
      out.push({
        id,
        name: recipeName,
        skillId,
        skillName,
        skillRawName,
        productName,
        productRawName,
      })
    }
    out.sort(
      (a, b) =>
        a.skillName.localeCompare(b.skillName) ||
        a.name.localeCompare(b.name) ||
        a.productName.localeCompare(b.productName)
    )
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameDataStore, datasetId, getName, rev])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setError('')
    try {
      await deleteCustomRecipe(gameDataStore, deleteTarget.id)
      setDeleteTarget(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const skillTemplate = (row: RecipeRow) => (
    <div className="flex align-items-center gap-2">
      {row.skillRawName && <SkillIcon skill={{ name: row.skillRawName }} />}
      <span>{row.skillName}</span>
    </div>
  )

  const productTemplate = (row: RecipeRow) => (
    <div className="flex align-items-center gap-2">
      {/* The recipe is always custom in this tab, so render the row's icon
          as the pi-book placeholder regardless of the product's customness. */}
      <RecipeIcon primaryProduct={{ name: row.productRawName, isCustom: true }} />
      <span>{row.productName}</span>
    </div>
  )

  const actionsTemplate = (row: RecipeRow) => (
    <div className="flex gap-2 justify-content-end">
      <Button
        icon="pi pi-pencil"
        size="small"
        outlined
        onClick={() => {
          setEditTarget(row.id)
          setFormVisible(true)
        }}
      />
      <Button
        icon="pi pi-trash"
        severity="danger"
        size="small"
        outlined
        onClick={() => setDeleteTarget(row)}
      />
    </div>
  )

  return (
    <div className="flex flex-column gap-3">
      <div className="flex justify-content-end">
        <Button
          label={t('settings.customEntities.addRecipe')}
          icon="pi pi-plus"
          onClick={() => {
            setEditTarget(null)
            setFormVisible(true)
          }}
        />
      </div>
      {error && <small className="text-color-danger">{error}</small>}
      <DataTable
        value={rows}
        dataKey="id"
        size="small"
        emptyMessage={t('settings.customEntities.noRecipes')}
      >
        <Column
          header={t('settings.customEntities.columnRecipeSkill')}
          body={skillTemplate}
          style={{ width: '14rem' }}
        />
        <Column header={t('settings.customEntities.columnRecipeName')} field="name" />
        <Column header={t('settings.customEntities.columnRecipeProduct')} body={productTemplate} />
        <Column body={actionsTemplate} style={{ width: '8rem' }} />
      </DataTable>
      <CustomRecipeFormDialog
        visible={formVisible}
        onHide={() => {
          setFormVisible(false)
          setEditTarget(null)
        }}
        datasetId={datasetId}
        recipeId={editTarget ?? undefined}
      />
      <Dialog
        header={t('settings.customEntities.deleteRecipeTitle')}
        visible={deleteTarget !== null}
        onHide={() => setDeleteTarget(null)}
        style={{ width: '26rem' }}
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
          {t('settings.customEntities.deleteRecipeBody', { name: deleteTarget?.name ?? '' })}
        </span>
      </Dialog>
    </div>
  )
}
