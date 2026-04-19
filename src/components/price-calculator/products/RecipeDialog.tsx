import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Dialog } from 'primereact/dialog'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { useLocalizedName } from '@/hooks/use-localized-name'
import type { PriceSignal } from '@/hooks/use-prices-signal'
import { useStores } from '@/stores/providers'

interface Props {
  recipeId: string | null
  buildId: string
  datasetId: string
  priceSignal: PriceSignal
  onHide: () => void
}

interface ElementRow {
  itemOrTagId: string
  name: string
  quantity: number
  unitPrice: number | null
  totalPrice: number | null
}

export function RecipeDialog({ recipeId, buildId, datasetId, priceSignal, onHide }: Props) {
  const { t } = useTranslation()
  const { gameDataStore, buildStore } = useStores()
  const { getName } = useLocalizedName(datasetId)

  const getElements = useCallback(
    (isProduct: boolean): ElementRow[] => {
      if (!recipeId) return []
      const rows: ElementRow[] = []

      for (const reId of gameDataStore.getRowIds('recipeElements')) {
        const re = gameDataStore.getRow('recipeElements', reId)
        if (re.recipeId !== recipeId) continue
        if ((re.isProduct as boolean) !== isProduct) continue

        const itemId = re.itemOrTagId as string
        const name = getName('item', itemId)
        const baseQty = re.baseQuantity as number
        const qty = Math.abs(baseQty)

        let unitPrice: number | null = null
        // For product rows, use this specific recipe's price rather than the
        // aggregated group price — the dialog is a per-recipe view, so its
        // product prices should reflect just this recipe's resolved cost.
        if (isProduct) {
          unitPrice = priceSignal.getRecipe(`${recipeId}::${itemId}`, 'costPrice')
        }
        if (unitPrice === null) {
          for (const upId of buildStore.getRowIds('userPrices')) {
            const up = buildStore.getRow('userPrices', upId)
            if (up.buildId === buildId && up.itemOrTagId === itemId && up.price) {
              unitPrice = up.price as number
              break
            }
          }
        }
        if (unitPrice === null) {
          unitPrice = priceSignal.get(itemId, 'costPrice')
        }

        rows.push({
          itemOrTagId: itemId,
          name,
          quantity: qty,
          unitPrice,
          totalPrice: unitPrice != null ? unitPrice * qty : null,
        })
      }

      return rows
    },
    [recipeId, gameDataStore, buildStore, buildId, getName, priceSignal]
  )

  if (!recipeId) return null

  const recipe = gameDataStore.getRow('recipes', recipeId)
  if (!recipe) return null

  const recipeName = getName('recipe', recipeId)
  const skillName = recipe.skillId ? getName('skill', recipe.skillId as string) : ''
  const tableName = getName('craftingTable', recipe.craftingTableId as string)

  const ingredients = getElements(false)
  const products = getElements(true)

  const priceTemplate = (row: ElementRow) => (
    <span className="text-right block">
      {row.unitPrice != null ? row.unitPrice.toFixed(2) : '-'}
    </span>
  )

  const totalTemplate = (row: ElementRow) => (
    <span className="text-right block font-semibold">
      {row.totalPrice != null ? row.totalPrice.toFixed(2) : '-'}
    </span>
  )

  return (
    <Dialog
      header={recipeName}
      visible={!!recipeId}
      onHide={onHide}
      style={{ width: '50vw' }}
      modal
    >
      <div className="grid">
        <div className="col-6">
          <div className="mb-2 text-sm text-color-secondary">
            <span className="font-semibold">{t('priceCalculator.recipe.craftingTable')}:</span>{' '}
            {tableName}
          </div>
          {skillName && (
            <div className="mb-3 text-sm text-color-secondary">
              <span className="font-semibold">{t('priceCalculator.recipe.skill')}:</span>{' '}
              {skillName}
            </div>
          )}

          <h4 className="mt-0 mb-2">{t('priceCalculator.recipe.ingredients')}</h4>
          <DataTable value={ingredients} size="small">
            <Column
              header={t('priceCalculator.recipe.quantity')}
              field="quantity"
              style={{ width: '4rem' }}
            />
            <Column header={t('priceCalculator.recipe.item')} field="name" />
            <Column
              header={t('priceCalculator.recipe.unitPrice')}
              body={priceTemplate}
              style={{ width: '6rem' }}
            />
            <Column
              header={t('priceCalculator.recipe.totalCost')}
              body={totalTemplate}
              style={{ width: '6rem' }}
            />
          </DataTable>
        </div>

        <div className="col-6">
          <h4 className="mt-0 mb-2">{t('priceCalculator.recipe.products')}</h4>
          <DataTable value={products} size="small">
            <Column
              header={t('priceCalculator.recipe.quantity')}
              field="quantity"
              style={{ width: '4rem' }}
            />
            <Column header={t('priceCalculator.recipe.item')} field="name" />
            <Column
              header={t('priceCalculator.recipe.unitPrice')}
              body={priceTemplate}
              style={{ width: '6rem' }}
            />
            <Column
              header={t('priceCalculator.recipe.totalCost')}
              body={totalTemplate}
              style={{ width: '6rem' }}
            />
          </DataTable>
        </div>
      </div>
    </Dialog>
  )
}
