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
import { TagLabel } from '@/components/common/TagLabel'
import { UsedInRecipesTable } from '@/components/price-calculator/UsedInRecipesTable'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { useStoreRevision } from '@/hooks/use-store-revision'
import { getGameDataIndexes } from '@/lib/game-data-indexes'
import { computeUsedInRecipes } from '@/lib/used-in-recipes'
import { useStores } from '@/stores/providers'

interface Props {
  itemId: string | null
  buildId: string
  datasetId: string
  onHide: () => void
  onOpenRecipe: (recipeId: string) => void
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

  const usedInRows = useMemo(
    () => {
      if (!itemId || !itemRow) return []
      return computeUsedInRecipes(gameDataStore, buildStore, {
        itemId,
        buildId,
        datasetId,
        isTag,
        getName,
      })
    },
    // Revision counters drive recomputation when the underlying tables change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      itemId,
      itemRow,
      isTag,
      buildId,
      datasetId,
      gameDataStore,
      buildStore,
      getName,
      gameRev,
      buildRev,
    ]
  )

  const producedByRows = useMemo<ProducedByRow[]>(
    () => {
      if (!itemId || !itemRow || isTag) return []

      // Whole-game scan: for every recipe that produces this item (and
      // doesn't also consume it — i.e. not reintegrated), record a row.
      const recipeIndex = new Map<string, RecipeIndexEntry>()
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
        }
      }

      const primaryProductRawNameOf = (recipeId: string): string => {
        const entry = recipeIndex.get(recipeId)
        if (!entry || entry.products.length === 0) return ''
        const sorted = [...entry.products].sort((a, b) => a.index - b.index)
        const primary = sorted.find((p) => !entry.ingredientItemSet.has(p.itemOrTagId)) ?? sorted[0]
        return (gameDataStore.getRow('items', primary.itemOrTagId)?.name as string) ?? ''
      }

      const rows: ProducedByRow[] = []
      for (const [recipeId, entry] of recipeIndex) {
        if (entry.ingredientItemSet.has(itemId)) continue
        for (const p of entry.products) {
          if (p.itemOrTagId !== itemId) continue
          const recipeRow = gameDataStore.getRow('recipes', recipeId)
          if (!recipeRow) continue
          const skillId = (recipeRow.skillId as string) ?? ''
          const skillRow = skillId ? gameDataStore.getRow('skills', skillId) : null
          rows.push({
            rowKey: p.reId,
            recipeId,
            recipeName: getName('recipe', recipeId),
            recipePrimaryProductRawName: primaryProductRawNameOf(recipeId),
            skillId,
            skillName: skillId ? getName('skill', skillId) : '',
            skillRawName: skillRow ? ((skillRow.name as string) ?? '') : '',
          })
        }
      }
      rows.sort((a, b) => {
        const s = a.skillName.localeCompare(b.skillName)
        if (s !== 0) return s
        return a.recipeName.localeCompare(b.recipeName)
      })
      return rows
    },
    // Revision counter drives recomputation when the game data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemId, itemRow, isTag, datasetId, gameDataStore, getName, gameRev]
  )

  if (!itemId || !itemRow) return null

  const itemTagIds = isTag
    ? []
    : (getGameDataIndexes(gameDataStore).tagIdsByItemId.get(itemId) ?? [])

  const headerNode = (
    <div className="flex align-items-center gap-2">
      {itemRawName && <ItemIcon item={{ name: itemRawName }} size={48} />}
      <span className="mr-2">{itemName}</span>
      {isTag && <i className="pi pi-tag text-sm" />}
      {itemTagIds.length > 0 && (
        <div className="flex align-items-center gap-3 ml-3">
          {itemTagIds.map((tagId) => {
            const tagName = getName('item', tagId)
            return tagName ? <TagLabel key={tagId} tagName={tagName} /> : null
          })}
        </div>
      )}
    </div>
  )

  const producedBySkillTemplate = (row: ProducedByRow) => {
    if (!row.skillId) return <span className="text-color-secondary">—</span>
    return (
      <div className="flex align-items-center gap-2">
        {row.skillRawName && <SkillIcon skill={{ name: row.skillRawName }} />}
        <span>{row.skillName}</span>
      </div>
    )
  }

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
          <UsedInRecipesTable
            rows={usedInRows}
            emptyMessage={t('priceCalculator.material.usedInEmpty')}
            onOpenRecipe={onOpenRecipe}
          />
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
                header={t('priceCalculator.usedInRecipes.skill')}
                body={producedBySkillTemplate}
                style={{ width: '15rem' }}
              />
              <Column
                header={t('priceCalculator.usedInRecipes.recipe')}
                body={producedByRecipeTemplate}
              />
            </DataTable>
          </TabPanel>
        )}
      </TabView>
    </Dialog>
  )
}
