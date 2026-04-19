import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Dialog } from 'primereact/dialog'
import { TabPanel, TabView } from 'primereact/tabview'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { ItemIcon } from '@/components/common/ItemIcon'
import { RecipeIcon } from '@/components/common/RecipeIcon'
import { SkillIcon } from '@/components/common/SkillIcon'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { useStoreRevision } from '@/hooks/use-store-revision'
import { useStores } from '@/stores/providers'

interface Props {
  itemId: string | null
  buildId: string
  datasetId: string
  onHide: () => void
  onOpenRecipe: (recipeId: string) => void
}

interface RecipeUsage {
  rowKey: string
  recipeId: string
  recipeName: string
  recipePrimaryProductRawName: string
  skillId: string
  skillName: string
  skillRawName: string
  quantity: number
  viaTag: { tagId: string; tagName: string; tagRawName: string } | null
}

interface ProducedByRow {
  rowKey: string
  recipeId: string
  recipeName: string
  recipePrimaryProductRawName: string
  skillId: string
  skillName: string
  skillRawName: string
}

interface RecipeIndexEntry {
  ingredientItemSet: Set<string>
  products: Array<{ reId: string; itemOrTagId: string; index: number }>
}

const GAME_TABLES = ['recipeElements', 'recipes', 'tagItems', 'items'] as const
const BUILD_TABLES = ['userRecipes'] as const

export function MaterialDialog({ itemId, buildId, datasetId, onHide, onOpenRecipe }: Props) {
  const { t } = useTranslation()
  const { gameDataStore, buildStore } = useStores()
  const { getName } = useLocalizedName(datasetId)

  const gameRev = useStoreRevision(gameDataStore, GAME_TABLES)
  const buildRev = useStoreRevision(buildStore, BUILD_TABLES)

  const itemRow = itemId ? gameDataStore.getRow('items', itemId) : null
  const isTag = itemRow ? (itemRow.isTag as boolean) : false
  const itemRawName = itemRow ? ((itemRow.name as string) ?? '') : ''
  const itemName = itemId ? getName('item', itemId) : ''

  const { usedInRows, producedByRows } = useMemo<{
    usedInRows: RecipeUsage[]
    producedByRows: ProducedByRow[]
  }>(
    () => {
      if (!itemId || !itemRow) return { usedInRows: [], producedByRows: [] }

      // One pass over recipeElements: build a per-recipe index scoped to
      // this dataset. Both tabs read from this index, so we only walk the
      // ~60k-row table once per memo.
      const recipeIndex = new Map<string, RecipeIndexEntry>()
      // Capture ingredient elements for the matchSet lookup separately
      // (needs baseQuantity, which we don't store in the per-recipe index).
      const ingredientElements: Array<{
        reId: string
        recipeId: string
        itemOrTagId: string
        baseQuantity: number
      }> = []

      for (const reId of gameDataStore.getRowIds('recipeElements')) {
        const re = gameDataStore.getRow('recipeElements', reId)
        if (re.datasetId !== datasetId) continue
        const recipeId = re.recipeId as string
        let entry = recipeIndex.get(recipeId)
        if (!entry) {
          entry = { ingredientItemSet: new Set(), products: [] }
          recipeIndex.set(recipeId, entry)
        }
        if (re.isProduct) {
          entry.products.push({
            reId,
            itemOrTagId: re.itemOrTagId as string,
            index: (re.index as number) ?? 0,
          })
        } else {
          entry.ingredientItemSet.add(re.itemOrTagId as string)
          ingredientElements.push({
            reId,
            recipeId,
            itemOrTagId: re.itemOrTagId as string,
            baseQuantity: re.baseQuantity as number,
          })
        }
      }

      const primaryProductRawNameOf = (recipeId: string): string => {
        const entry = recipeIndex.get(recipeId)
        if (!entry || entry.products.length === 0) return ''
        const sorted = [...entry.products].sort((a, b) => a.index - b.index)
        const primary = sorted.find((p) => !entry.ingredientItemSet.has(p.itemOrTagId)) ?? sorted[0]
        return (gameDataStore.getRow('items', primary.itemOrTagId)?.name as string) ?? ''
      }

      const skillInfoOf = (recipeId: string) => {
        const recipeRow = gameDataStore.getRow('recipes', recipeId)
        if (!recipeRow) return null
        const skillId = (recipeRow.skillId as string) ?? ''
        const skillRow = skillId ? gameDataStore.getRow('skills', skillId) : null
        return {
          recipeName: getName('recipe', recipeId),
          skillId,
          skillName: skillId ? getName('skill', skillId) : '',
          skillRawName: skillRow ? ((skillRow.name as string) ?? '') : '',
        }
      }

      // ── Used in Recipes (build-scoped, item + tag matches for items) ──
      const buildRecipeIds = new Set<string>()
      for (const urId of buildStore.getRowIds('userRecipes')) {
        const ur = buildStore.getRow('userRecipes', urId)
        if (ur.buildId !== buildId) continue
        buildRecipeIds.add(ur.recipeId as string)
      }

      const matchSet = new Set<string>([itemId])
      const tagInfoById = new Map<string, { tagId: string; tagName: string; tagRawName: string }>()
      if (!isTag) {
        for (const tiId of gameDataStore.getRowIds('tagItems')) {
          const ti = gameDataStore.getRow('tagItems', tiId)
          if (ti.datasetId !== datasetId) continue
          if (ti.itemId !== itemId) continue
          const tagId = ti.tagId as string
          matchSet.add(tagId)
          if (!tagInfoById.has(tagId)) {
            const tagItemRow = gameDataStore.getRow('items', tagId)
            tagInfoById.set(tagId, {
              tagId,
              tagName: getName('item', tagId),
              tagRawName: tagItemRow ? ((tagItemRow.name as string) ?? '') : '',
            })
          }
        }
      }

      const usedInRows: RecipeUsage[] = []
      if (buildRecipeIds.size > 0) {
        for (const ie of ingredientElements) {
          if (!matchSet.has(ie.itemOrTagId)) continue
          if (!buildRecipeIds.has(ie.recipeId)) continue
          const info = skillInfoOf(ie.recipeId)
          if (!info) continue
          const viaTag =
            ie.itemOrTagId !== itemId ? (tagInfoById.get(ie.itemOrTagId) ?? null) : null
          usedInRows.push({
            rowKey: ie.reId,
            recipeId: ie.recipeId,
            recipeName: info.recipeName,
            recipePrimaryProductRawName: primaryProductRawNameOf(ie.recipeId),
            skillId: info.skillId,
            skillName: info.skillName,
            skillRawName: info.skillRawName,
            quantity: Math.abs(ie.baseQuantity),
            viaTag,
          })
        }
        usedInRows.sort((a, b) => {
          const s = a.skillName.localeCompare(b.skillName)
          if (s !== 0) return s
          return a.recipeName.localeCompare(b.recipeName)
        })
      }

      // ── Produced by Recipes (whole game, exclude reintegrated) ──
      const producedByRows: ProducedByRow[] = []
      if (!isTag) {
        for (const [recipeId, entry] of recipeIndex) {
          // Skip recipes that also consume this item — those would be
          // reintegrated, which the user explicitly excluded.
          if (entry.ingredientItemSet.has(itemId)) continue
          for (const p of entry.products) {
            if (p.itemOrTagId !== itemId) continue
            const info = skillInfoOf(recipeId)
            if (!info) continue
            producedByRows.push({
              rowKey: p.reId,
              recipeId,
              recipeName: info.recipeName,
              recipePrimaryProductRawName: primaryProductRawNameOf(recipeId),
              skillId: info.skillId,
              skillName: info.skillName,
              skillRawName: info.skillRawName,
            })
          }
        }
        producedByRows.sort((a, b) => {
          const s = a.skillName.localeCompare(b.skillName)
          if (s !== 0) return s
          return a.recipeName.localeCompare(b.recipeName)
        })
      }

      return { usedInRows, producedByRows }
    },
    // Revision counters drive recomputation when the underlying tables change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemId, isTag, buildId, datasetId, gameDataStore, buildStore, getName, gameRev, buildRev]
  )

  if (!itemId || !itemRow) return null

  const headerNode = (
    <div className="flex align-items-center gap-2">
      {itemRawName && <ItemIcon item={{ name: itemRawName }} size={48} />}
      <span className="mr-2">{itemName}</span>
      {isTag && <i className="pi pi-tag text-sm" />}
    </div>
  )

  const skillTemplate = (row: { skillId: string; skillName: string; skillRawName: string }) => {
    if (!row.skillId) return <span className="text-color-secondary">—</span>
    return (
      <div className="flex align-items-center gap-2">
        {row.skillRawName && <SkillIcon skill={{ name: row.skillRawName }} />}
        <span>{row.skillName}</span>
      </div>
    )
  }

  const usedInRecipeTemplate = (row: RecipeUsage) => (
    <div className="flex align-items-center gap-2">
      {row.recipePrimaryProductRawName && (
        <RecipeIcon primaryProduct={{ name: row.recipePrimaryProductRawName }} />
      )}
      <Button
        label={row.recipeName}
        link
        className="p-0"
        pt={{ label: { style: { textAlign: 'left' } } }}
        onClick={() => onOpenRecipe(row.recipeId)}
      />
      {row.viaTag && (
        <span
          className="ml-2 text-color-secondary text-sm flex align-items-center gap-1"
          title={t('priceCalculator.material.viaTag', { tag: row.viaTag.tagName })}
        >
          <i className="pi pi-tag text-xs" />
          {row.viaTag.tagName}
        </span>
      )}
    </div>
  )

  const producedByRecipeTemplate = (row: ProducedByRow) => (
    <div className="flex align-items-center gap-2">
      {row.recipePrimaryProductRawName && (
        <RecipeIcon primaryProduct={{ name: row.recipePrimaryProductRawName }} />
      )}
      <Button
        label={row.recipeName}
        link
        className="p-0"
        pt={{ label: { style: { textAlign: 'left' } } }}
        onClick={() => onOpenRecipe(row.recipeId)}
      />
    </div>
  )

  const quantityTemplate = (row: RecipeUsage) => (
    <span className="text-right block">{row.quantity}</span>
  )

  return (
    <Dialog
      header={headerNode}
      visible={!!itemId}
      onHide={onHide}
      style={{ width: '40vw' }}
      modal
      dismissableMask
    >
      <TabView>
        <TabPanel header={t('priceCalculator.material.tabUsedIn')}>
          <DataTable
            value={usedInRows}
            dataKey="rowKey"
            size="small"
            emptyMessage={t('priceCalculator.material.usedInEmpty')}
          >
            <Column
              header={t('priceCalculator.material.skill')}
              body={skillTemplate}
              style={{ width: '15rem' }}
            />
            <Column header={t('priceCalculator.material.recipe')} body={usedInRecipeTemplate} />
            <Column
              header={t('priceCalculator.material.quantity')}
              body={quantityTemplate}
              style={{ width: '5rem' }}
              headerClassName="p-align-right"
            />
          </DataTable>
        </TabPanel>
        {!isTag && (
          <TabPanel header={t('priceCalculator.material.tabProducedBy')}>
            <DataTable
              value={producedByRows}
              dataKey="rowKey"
              size="small"
              emptyMessage={t('priceCalculator.material.producedByEmpty')}
            >
              <Column
                header={t('priceCalculator.material.skill')}
                body={skillTemplate}
                style={{ width: '15rem' }}
              />
              <Column
                header={t('priceCalculator.material.recipe')}
                body={producedByRecipeTemplate}
              />
            </DataTable>
          </TabPanel>
        )}
      </TabView>
    </Dialog>
  )
}
