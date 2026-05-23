import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Message } from 'primereact/message'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Store } from 'tinybase'

import { ItemIcon } from '@/components/common/ItemIcon'
import { PriceField } from '@/components/common/PriceField'
import { AppliedBonuses } from '@/components/price-calculator/products/AppliedBonuses'
import { useLocalization } from '@/hooks/use-localization'
import type { GetNameFn } from '@/lib/recipe-modifiers'

import type { AdHocResult } from './adhoc-recipe-calc'

interface ElementRow {
  recipeElementId: string
  itemOrTagId: string
  name: string
  rawName: string
  isCustom: boolean
  modifiedQuantity: number
  unitPrice: number | null
  totalPrice: number | null
}

interface Props {
  gameDataStore: Store
  recipeId: string
  result: AdHocResult
  ingredientPrices: Record<string, number>
  onPriceChange: (itemOrTagId: string, value: number | null) => void
  getName: GetNameFn
}

export function AdHocCostBreakdown({
  gameDataStore,
  recipeId,
  result,
  ingredientPrices,
  onPriceChange,
  getName,
}: Props) {
  const { t } = useTranslation()
  const { formatPrice, formatNumber } = useLocalization()
  const { mods, output } = result

  const { ingredients, returnedIngredients, products } = useMemo(() => {
    const ingredients: ElementRow[] = []
    const returnedIngredients: ElementRow[] = []
    const products: ElementRow[] = []

    const ingredientItemIds = new Set<string>()
    interface RawRow {
      id: string
      itemOrTagId: string
      baseQuantity: number
      isProduct: boolean
      index: number
    }
    const rawRows: RawRow[] = []
    for (const reId of gameDataStore.getRowIds('recipeElements')) {
      const re = gameDataStore.getRow('recipeElements', reId)
      if (re.recipeId !== recipeId) continue
      const row: RawRow = {
        id: reId,
        itemOrTagId: re.itemOrTagId as string,
        baseQuantity: re.baseQuantity as number,
        isProduct: re.isProduct as boolean,
        index: (re.index as number) ?? 0,
      }
      rawRows.push(row)
      if (!row.isProduct) ingredientItemIds.add(row.itemOrTagId)
    }

    const modifiedQty = (reId: string, base: number): number => {
      const m = mods.elementModifiedQuantities.get(reId)
      return m != null ? Math.abs(m) : Math.abs(base)
    }

    const itemMeta = (itemId: string) => {
      const row = gameDataStore.getRow('items', itemId)
      return {
        name: getName('item', itemId) || (row?.name as string) || '',
        rawName: (row?.name as string) ?? '',
        isCustom: !!row?.isCustom,
      }
    }

    for (const r of rawRows.filter((x) => !x.isProduct)) {
      const meta = itemMeta(r.itemOrTagId)
      const qty = modifiedQty(r.id, r.baseQuantity)
      const unitPrice = ingredientPrices[r.itemOrTagId] ?? null
      ingredients.push({
        recipeElementId: r.id,
        itemOrTagId: r.itemOrTagId,
        ...meta,
        modifiedQuantity: qty,
        unitPrice,
        totalPrice: unitPrice != null ? unitPrice * qty : null,
      })
    }

    const productRaws = rawRows.filter((x) => x.isProduct).sort((a, b) => a.index - b.index)
    for (const r of productRaws) {
      const meta = itemMeta(r.itemOrTagId)
      const qty = modifiedQty(r.id, r.baseQuantity)
      if (ingredientItemIds.has(r.itemOrTagId)) {
        // Reintegrated: priced from the same editable ingredient price, deducted.
        const unitPrice = ingredientPrices[r.itemOrTagId] ?? null
        returnedIngredients.push({
          recipeElementId: r.id,
          itemOrTagId: r.itemOrTagId,
          ...meta,
          modifiedQuantity: qty,
          unitPrice,
          totalPrice: unitPrice != null ? unitPrice * qty : null,
        })
      } else {
        const recipePrice = output.recipePrices[`${recipeId}::${r.itemOrTagId}`]
        const unitPrice = recipePrice
          ? recipePrice.costPrice
          : (output.prices[r.itemOrTagId]?.costPrice ?? null)
        products.push({
          recipeElementId: r.id,
          itemOrTagId: r.itemOrTagId,
          ...meta,
          modifiedQuantity: qty,
          unitPrice,
          totalPrice: unitPrice != null ? unitPrice * qty : null,
        })
      }
    }

    return { ingredients, returnedIngredients, products }
  }, [gameDataStore, recipeId, mods, output, ingredientPrices, getName])

  const sumTotals = (rows: ElementRow[]): number | null => {
    let sum = 0
    let any = false
    for (const r of rows) {
      if (r.totalPrice != null) {
        sum += r.totalPrice
        any = true
      }
    }
    return any ? sum : null
  }

  const recipeCost = output.recipeCosts[recipeId]
  const laborCost = recipeCost ? recipeCost.laborCost : 0
  const ingredientsSubtotal = sumTotals(ingredients)
  const returnedSubtotal = sumTotals(returnedIngredients)
  const leftTotal = (ingredientsSubtotal ?? 0) + laborCost - (returnedSubtotal ?? 0)
  const productsTotal = sumTotals(products)

  const quantityTemplate = (row: ElementRow) => (
    <span>{formatNumber(row.modifiedQuantity, { maximumFractionDigits: 2 })}</span>
  )

  const nameTemplate = (row: ElementRow) => (
    <div className="flex align-items-center gap-2">
      {(row.rawName || row.isCustom) && (
        <ItemIcon item={{ name: row.rawName, isCustom: row.isCustom }} />
      )}
      <span>{row.name}</span>
    </div>
  )

  const editablePriceTemplate = (row: ElementRow) => (
    <PriceField value={row.unitPrice} onChange={(v) => onPriceChange(row.itemOrTagId, v)} />
  )

  const priceTemplate = (row: ElementRow) => (
    <span className="text-right block">
      {row.unitPrice != null ? formatPrice(row.unitPrice) : '-'}
    </span>
  )

  const totalTemplate = (row: ElementRow) => (
    <span className="text-right block font-semibold">
      {row.totalPrice != null ? formatPrice(row.totalPrice) : '-'}
    </span>
  )

  const deductedTotalTemplate = (row: ElementRow) => (
    <span className="text-right block font-semibold text-color-secondary">
      {row.totalPrice != null ? `−${formatPrice(row.totalPrice)}` : '-'}
    </span>
  )

  const totalFooter = (label: string, value: number | null) => (
    <div className="flex align-items-center justify-content-between px-2 py-2 font-semibold surface-100 border-round">
      <span>{label}</span>
      <span>{value != null ? formatPrice(value) : '-'}</span>
    </div>
  )

  return (
    <div className="grid">
      <div className="col-12 md:col-6 flex flex-column">
        <h4 className="mt-0 mb-2">{t('priceCalculator.recipe.ingredients')}</h4>
        <DataTable value={ingredients} size="small" emptyMessage="—">
          <Column
            header={t('priceCalculator.recipe.quantity')}
            body={quantityTemplate}
            style={{ width: '5rem' }}
          />
          <Column header={t('priceCalculator.recipe.item')} body={nameTemplate} />
          <Column
            header={t('priceCalculator.recipe.unitPrice')}
            body={editablePriceTemplate}
            style={{ width: '8rem' }}
            headerClassName="p-align-right"
          />
          <Column
            header={t('priceCalculator.recipe.totalCost')}
            body={totalTemplate}
            style={{ width: '6rem' }}
            headerClassName="p-align-right"
          />
        </DataTable>

        {returnedIngredients.length > 0 && (
          <>
            <h4 className="mt-4 mb-2">{t('priceCalculator.recipe.returnedIngredients')}</h4>
            <DataTable value={returnedIngredients} size="small">
              <Column
                header={t('priceCalculator.recipe.quantity')}
                body={quantityTemplate}
                style={{ width: '5rem' }}
              />
              <Column header={t('priceCalculator.recipe.item')} body={nameTemplate} />
              <Column
                header={t('priceCalculator.recipe.unitPrice')}
                body={priceTemplate}
                style={{ width: '6rem' }}
                headerClassName="p-align-right"
              />
              <Column
                header={t('priceCalculator.recipe.totalCost')}
                body={deductedTotalTemplate}
                style={{ width: '6rem' }}
                headerClassName="p-align-right"
              />
            </DataTable>
          </>
        )}

        <h4 className="mt-4 mb-2">{t('priceCalculator.recipe.additionalCosts')}</h4>
        <div className="flex align-items-center justify-content-between px-2 py-2 surface-50 border-round">
          <span>{t('priceCalculator.recipe.labor')}</span>
          <span className="font-semibold">{formatPrice(laborCost)}</span>
        </div>

        <div className="mt-auto pt-3">
          {totalFooter(t('settings.adHocRecipeCalculator.costTotal'), leftTotal)}
        </div>
      </div>

      <div className="col-12 md:col-6 flex flex-column">
        <h4 className="mt-0 mb-2">{t('priceCalculator.recipe.products')}</h4>
        <DataTable value={products} size="small" emptyMessage="—">
          <Column
            header={t('priceCalculator.recipe.quantity')}
            body={quantityTemplate}
            style={{ width: '5rem' }}
          />
          <Column header={t('priceCalculator.recipe.item')} body={nameTemplate} />
          <Column
            header={t('priceCalculator.recipe.unitPrice')}
            body={priceTemplate}
            style={{ width: '6rem' }}
            headerClassName="p-align-right"
          />
          <Column
            header={t('priceCalculator.recipe.totalCost')}
            body={totalTemplate}
            style={{ width: '6rem' }}
            headerClassName="p-align-right"
          />
        </DataTable>

        {mods.bonuses.length > 0 && <AppliedBonuses bonuses={mods.bonuses} />}

        <div className="mt-auto pt-3">
          {totalFooter(t('settings.adHocRecipeCalculator.productsTotal'), productsTotal)}
        </div>
      </div>

      {output.errors.length > 0 && (
        <div className="col-12">
          <Message severity="warn" text={t('settings.adHocRecipeCalculator.unresolved')} />
        </div>
      )}
    </div>
  )
}
