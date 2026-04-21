import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Dialog } from 'primereact/dialog'
import { InputNumber } from 'primereact/inputnumber'
import { TabPanel, TabView } from 'primereact/tabview'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CraftingTableIcon } from '@/components/common/CraftingTableIcon'
import { ItemIcon } from '@/components/common/ItemIcon'
import { SkillIcon } from '@/components/common/SkillIcon'
import { ProductItemName } from '@/components/price-calculator/products/ProductItemName'
import { UsedInRecipesTable } from '@/components/price-calculator/UsedInRecipesTable'
import { useLocalizedName } from '@/hooks/use-localized-name'
import {
  type PriceSignal,
  useRecipeCostCell,
  usePriceSignalRevision,
} from '@/hooks/use-prices-signal'
import { useRecipeManagement } from '@/hooks/use-recipe-management'
import { useStoreRevision } from '@/hooks/use-store-revision'
import { computeUsedInRecipes, type UsedInRecipe } from '@/lib/used-in-recipes'
import { useStores } from '@/stores/providers'

interface Props {
  recipeId: string | null
  buildId: string
  datasetId: string
  priceSignal: PriceSignal
  onHide: () => void
  onOpenMaterial?: (itemOrTagId: string) => void
  onOpenRecipe?: (recipeId: string) => void
}

interface ElementRow {
  itemOrTagId: string
  name: string
  rawName: string
  quantity: number
  unitPrice: number | null
  totalPrice: number | null
}

interface ProductRow extends ElementRow {
  userRecipeId: string
  sharePercent: number
}

interface AdditionalCostRow {
  id: 'craftTime' | 'labor'
  label: string
  quantity: string
  unitPriceLabel: string
  totalPrice: number
}

export function RecipeDialog({
  recipeId,
  buildId,
  datasetId,
  priceSignal,
  onHide,
  onOpenMaterial,
  onOpenRecipe,
}: Props) {
  const { t } = useTranslation()
  const { gameDataStore, buildStore } = useStores()
  const { getName } = useLocalizedName(datasetId)
  const { setProductShare } = useRecipeManagement(buildId)

  const findUserRecipeId = useCallback((): string => {
    if (!recipeId) return ''
    for (const urId of buildStore.getRowIds('userRecipes')) {
      const ur = buildStore.getRow('userRecipes', urId)
      if (ur.buildId === buildId && ur.recipeId === recipeId) return urId
    }
    return ''
  }, [buildStore, buildId, recipeId])

  const findManualPrice = useCallback(
    (itemId: string): number | null => {
      for (const upId of buildStore.getRowIds('userPrices')) {
        const up = buildStore.getRow('userPrices', upId)
        if (up.buildId === buildId && up.itemOrTagId === itemId && up.price) {
          return up.price as number
        }
      }
      return null
    },
    [buildStore, buildId]
  )

  const resolveUnitPrice = useCallback(
    (itemId: string, isProduct: boolean): number | null => {
      // For product rows, prefer this specific recipe's resolved price; the
      // dialog is a per-recipe view so its product prices should reflect
      // just this recipe's cost, not the aggregated group price.
      let unitPrice: number | null = null
      if (isProduct && recipeId) {
        unitPrice = priceSignal.getRecipe(`${recipeId}::${itemId}`, 'costPrice')
      }
      if (unitPrice === null) unitPrice = findManualPrice(itemId)
      if (unitPrice === null) unitPrice = priceSignal.get(itemId, 'costPrice')
      return unitPrice
    },
    [recipeId, priceSignal, findManualPrice]
  )

  const getItemRawName = useCallback(
    (itemId: string): string => {
      const row = gameDataStore.getRow('items', itemId)
      return row ? ((row.name as string) ?? '') : ''
    },
    [gameDataStore]
  )

  const getElements = useCallback(() => {
    const ingredients: ElementRow[] = []
    const returnedIngredients: ElementRow[] = []
    const products: ProductRow[] = []

    if (!recipeId) return { ingredients, returnedIngredients, products }

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

    const userRecipeId = findUserRecipeId()
    const userSharesByProduct = new Map<string, number>()
    for (const upsId of buildStore.getRowIds('userProductShares')) {
      const ups = buildStore.getRow('userProductShares', upsId)
      if (ups.buildId !== buildId) continue
      if (ups.userRecipeId !== userRecipeId) continue
      userSharesByProduct.set(ups.productItemOrTagId as string, ups.sharePercent as number)
    }
    const hasUserShares = userSharesByProduct.size > 0

    const productRaws = rawRows.filter((r) => r.isProduct).sort((a, b) => a.index - b.index)
    let primaryAssigned = false

    for (const r of rawRows) {
      if (!r.isProduct) {
        ingredients.push({
          itemOrTagId: r.itemOrTagId,
          name: getName('item', r.itemOrTagId),
          rawName: getItemRawName(r.itemOrTagId),
          quantity: Math.abs(r.baseQuantity),
          unitPrice: resolveUnitPrice(r.itemOrTagId, false),
          totalPrice: null,
        })
      }
    }
    for (const ing of ingredients) {
      ing.totalPrice = ing.unitPrice != null ? ing.unitPrice * ing.quantity : null
    }

    for (const r of productRaws) {
      const name = getName('item', r.itemOrTagId)
      const rawName = getItemRawName(r.itemOrTagId)
      const quantity = Math.abs(r.baseQuantity)
      const unitPrice = resolveUnitPrice(r.itemOrTagId, true)
      const totalPrice = unitPrice != null ? unitPrice * quantity : null

      if (ingredientItemIds.has(r.itemOrTagId)) {
        returnedIngredients.push({
          itemOrTagId: r.itemOrTagId,
          name,
          rawName,
          quantity,
          unitPrice,
          totalPrice,
        })
      } else {
        let sharePercent: number
        if (hasUserShares) {
          sharePercent = userSharesByProduct.get(r.itemOrTagId) ?? 0
        } else if (!primaryAssigned) {
          sharePercent = 100
          primaryAssigned = true
        } else {
          sharePercent = 0
        }
        products.push({
          itemOrTagId: r.itemOrTagId,
          name,
          rawName,
          quantity,
          unitPrice,
          totalPrice,
          userRecipeId,
          sharePercent,
        })
      }
    }

    return { ingredients, returnedIngredients, products }
  }, [
    recipeId,
    gameDataStore,
    buildStore,
    buildId,
    findUserRecipeId,
    resolveUnitPrice,
    getName,
    getItemRawName,
  ])

  const [activeTabIndex, setActiveTabIndex] = useState(0)
  // Reset to the first tab (Cost Components) whenever the dialog switches to
  // a new recipe — e.g. clicking a recipe in the Used-in-Recipes list.
  useEffect(() => {
    setActiveTabIndex(0)
  }, [recipeId])

  useStoreRevision(buildStore, ['userProductShares'])
  const buildRecipesRev = useStoreRevision(buildStore, ['userRecipes', 'userPrices'])
  // Re-render whenever the solver pushes a new result, so the inline reads
  // via `priceSignal.get(...)` / `priceSignal.getRecipe(...)` above reflect
  // the new numbers (e.g. when the user edits a share %).
  usePriceSignalRevision(priceSignal)
  const recipeCost = useRecipeCostCell(priceSignal, recipeId)

  // Items that are primary products of any user-selected recipe in this build.
  // Clicking an ingredient that is one of these opens its winning recipe (via
  // `ProductItemName`) instead of the generic `MaterialDialog`.
  const { productItemIds, userPriceIdByItem } = useMemo(() => {
    const products = new Set<string>()
    const priceIds = new Map<string, string>()
    for (const urId of buildStore.getRowIds('userRecipes')) {
      const ur = buildStore.getRow('userRecipes', urId)
      if (ur.buildId !== buildId) continue
      const rId = ur.recipeId as string
      let firstProductId: string | null = null
      let firstIndex = Number.POSITIVE_INFINITY
      for (const reId of gameDataStore.getRowIds('recipeElements')) {
        const re = gameDataStore.getRow('recipeElements', reId)
        if (re.recipeId !== rId || !re.isProduct) continue
        const idx = (re.index as number) ?? 0
        if (idx < firstIndex) {
          firstIndex = idx
          firstProductId = re.itemOrTagId as string
        }
      }
      if (firstProductId) products.add(firstProductId)
    }
    for (const upId of buildStore.getRowIds('userPrices')) {
      const up = buildStore.getRow('userPrices', upId)
      if (up.buildId !== buildId) continue
      priceIds.set(up.itemOrTagId as string, upId)
    }
    return { productItemIds: products, userPriceIdByItem: priceIds }
    // buildRecipesRev is the invalidation signal for this memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildStore, gameDataStore, buildId, buildRecipesRev])

  const gameRev = useStoreRevision(gameDataStore, [
    'recipeElements',
    'recipes',
    'tagItems',
    'items',
  ])

  // Recipes in this build that consume the primary product of the current
  // recipe. The primary product is the first product (by `index`) that isn't
  // also an ingredient of this recipe (i.e. not reintegrated). Delegates the
  // ingredient scan + tag-expansion to the shared helper.
  const usedInRows = useMemo<UsedInRecipe[]>(
    () => {
      if (!recipeId) return []

      const ownProducts: Array<{ itemId: string; index: number }> = []
      const ownIngredientItemIds = new Set<string>()
      for (const reId of gameDataStore.getRowIds('recipeElements')) {
        const re = gameDataStore.getRow('recipeElements', reId)
        if (re.recipeId !== recipeId) continue
        const itemId = re.itemOrTagId as string
        if (re.isProduct) {
          ownProducts.push({ itemId, index: (re.index as number) ?? 0 })
        } else {
          ownIngredientItemIds.add(itemId)
        }
      }
      if (ownProducts.length === 0) return []
      ownProducts.sort((a, b) => a.index - b.index)
      const primary = ownProducts.find((p) => !ownIngredientItemIds.has(p.itemId)) ?? ownProducts[0]

      return computeUsedInRecipes(gameDataStore, buildStore, {
        itemId: primary.itemId,
        buildId,
        datasetId,
        excludeRecipeId: recipeId,
        getName,
      })
    },
    // gameRev / buildRecipesRev are the invalidation signals for this memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipeId, buildId, datasetId, gameDataStore, buildStore, getName, gameRev, buildRecipesRev]
  )

  if (!recipeId) return null

  const recipe = gameDataStore.getRow('recipes', recipeId)
  if (!recipe) return null

  const recipeName = getName('recipe', recipeId)
  const skillName = recipe.skillId ? getName('skill', recipe.skillId as string) : ''
  const tableName = getName('craftingTable', recipe.craftingTableId as string)
  const skillRawName = recipe.skillId
    ? ((gameDataStore.getRow('skills', recipe.skillId as string)?.name as string) ?? '')
    : ''
  const tableRawName =
    (gameDataStore.getRow('craftingTables', recipe.craftingTableId as string)?.name as string) ?? ''

  const { ingredients, returnedIngredients, products } = getElements()
  const showShareColumn = products.length > 1

  // Recipe header icon: first non-reintegrated product's raw name, falling
  // back to the first product if all products are reintegrated.
  const headerRawName = products[0]?.rawName || returnedIngredients[0]?.rawName || ''

  const sumTotals = (rows: Array<{ totalPrice: number | null }>): number | null => {
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

  const additionalCosts: AdditionalCostRow[] = recipeCost
    ? [
        {
          id: 'craftTime',
          label: t('priceCalculator.recipe.craftTime'),
          quantity: `${recipeCost.craftTime.toFixed(2)} min`,
          unitPriceLabel: `${recipeCost.costPerMinute.toFixed(2)} $/min`,
          totalPrice: recipeCost.craftTimeCost,
        },
        {
          id: 'labor',
          label: t('priceCalculator.recipe.labor'),
          quantity: `${recipeCost.laborAmount.toFixed(0)} cal`,
          unitPriceLabel: `${recipeCost.calorieCost.toFixed(2)} $/1k cal`,
          totalPrice: recipeCost.laborCost,
        },
      ]
    : []

  const ingredientsSubtotal = sumTotals(ingredients)
  const returnedSubtotal = sumTotals(returnedIngredients)
  const additionalCostsSubtotal = recipeCost
    ? recipeCost.craftTimeCost + recipeCost.laborCost
    : null
  const leftTotal =
    ingredientsSubtotal == null && returnedSubtotal == null && additionalCostsSubtotal == null
      ? null
      : (ingredientsSubtotal ?? 0) + (additionalCostsSubtotal ?? 0) - (returnedSubtotal ?? 0)
  const productsTotal = sumTotals(products)

  const nameTemplate = (row: ElementRow) => (
    <div className="flex align-items-center gap-2">
      {row.rawName && <ItemIcon item={{ name: row.rawName }} />}
      <span>{row.name}</span>
    </div>
  )

  const materialOnlyNameTemplate = (row: ElementRow) =>
    onOpenMaterial ? (
      <div className="flex align-items-center gap-2">
        {row.rawName && <ItemIcon item={{ name: row.rawName }} />}
        <Button
          label={row.name}
          link
          className="p-0"
          pt={{ label: { style: { textAlign: 'left' } } }}
          onClick={() => onOpenMaterial(row.itemOrTagId)}
        />
      </div>
    ) : (
      nameTemplate(row)
    )

  const ingredientNameTemplate = (row: ElementRow) => {
    if (onOpenRecipe && productItemIds.has(row.itemOrTagId)) {
      return (
        <ProductItemName
          itemId={row.itemOrTagId}
          displayName={row.name}
          rawName={row.rawName}
          userPriceId={userPriceIdByItem.get(row.itemOrTagId) ?? ''}
          buildStore={buildStore}
          signal={priceSignal}
          onOpenRecipe={onOpenRecipe}
        />
      )
    }
    return materialOnlyNameTemplate(row)
  }

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

  const deductedTotalTemplate = (row: ElementRow) => (
    <span className="text-right block font-semibold text-color-secondary">
      {row.totalPrice != null ? `−${row.totalPrice.toFixed(2)}` : '-'}
    </span>
  )

  const shareTemplate = (row: ProductRow) => (
    <InputNumber
      value={row.sharePercent}
      onValueChange={(e) => {
        const next = e.value ?? 0
        if (next === row.sharePercent) return
        if (!row.userRecipeId) return
        setProductShare(row.userRecipeId, row.itemOrTagId, next)
      }}
      min={0}
      max={100}
      suffix="%"
      showButtons={false}
      inputStyle={{ width: '4rem', textAlign: 'right' }}
    />
  )

  const totalFooter = (value: number | null) => (
    <div className="flex align-items-center justify-content-between px-2 py-2 font-semibold surface-100 border-round">
      <span>{t('priceCalculator.recipe.totalCost')}</span>
      <span>{value != null ? value.toFixed(2) : '-'}</span>
    </div>
  )

  const subtotalValueFooter = (value: number | null, deducted = false) => (
    <span className={`text-right block font-semibold${deducted ? ' text-color-secondary' : ''}`}>
      {value != null ? (deducted ? `−${value.toFixed(2)}` : value.toFixed(2)) : '-'}
    </span>
  )
  const subtotalLabelFooter = (
    <span className="font-semibold">{t('priceCalculator.recipe.subtotal')}</span>
  )

  const additionalCostTotalTemplate = (row: AdditionalCostRow) => (
    <span className="text-right block font-semibold">{row.totalPrice.toFixed(2)}</span>
  )

  const additionalCostUnitTemplate = (row: AdditionalCostRow) => (
    <span className="text-right block text-color-secondary">{row.unitPriceLabel}</span>
  )

  const additionalCostNameTemplate = (row: AdditionalCostRow) => <span>{row.label}</span>

  const headerNode = (
    <div className="flex align-items-center gap-2">
      {headerRawName && <ItemIcon item={{ name: headerRawName }} size={48} />}
      <span className="mr-3">{recipeName}</span>
      {skillRawName && (
        <span className="flex align-items-center" title={`${t('priceCalculator.recipe.skill')}: ${skillName}`}>
          <SkillIcon skill={{ name: skillRawName }} />
        </span>
      )}
      {tableRawName && (
        <span className="flex align-items-center" title={`${t('priceCalculator.recipe.craftingTable')}: ${tableName}`}>
          <CraftingTableIcon table={{ name: tableRawName }} />
        </span>
      )}
    </div>
  )

  return (
    <Dialog
      header={headerNode}
      visible={!!recipeId}
      onHide={onHide}
      style={{ width: '50vw' }}
      modal
      dismissableMask
    >
      <TabView activeIndex={activeTabIndex} onTabChange={(e) => setActiveTabIndex(e.index)}>
        <TabPanel header={t('priceCalculator.recipe.tabCostComponents')}>
          <div className="grid">
            <div className="col-6 flex flex-column">
              <h4 className="mt-0 mb-2">{t('priceCalculator.recipe.ingredients')}</h4>
              <DataTable value={ingredients} size="small">
                <Column
                  header={t('priceCalculator.recipe.quantity')}
                  field="quantity"
                  style={{ width: '4rem' }}
                />
                <Column
                  header={t('priceCalculator.recipe.item')}
                  body={ingredientNameTemplate}
                  footer={subtotalLabelFooter}
                />
                <Column
                  header={t('priceCalculator.recipe.unitPrice')}
                  body={priceTemplate}
                  style={{ width: '6rem' }}
                  headerClassName="p-align-right"
                />
                <Column
                  header={t('priceCalculator.recipe.totalCost')}
                  body={totalTemplate}
                  footer={subtotalValueFooter(ingredientsSubtotal)}
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
                      field="quantity"
                      style={{ width: '4rem' }}
                    />
                    <Column
                      header={t('priceCalculator.recipe.item')}
                      body={materialOnlyNameTemplate}
                      footer={subtotalLabelFooter}
                    />
                    <Column
                      header={t('priceCalculator.recipe.unitPrice')}
                      body={priceTemplate}
                      style={{ width: '6rem' }}
                      headerClassName="p-align-right"
                    />
                    <Column
                      header={t('priceCalculator.recipe.totalCost')}
                      body={deductedTotalTemplate}
                      footer={subtotalValueFooter(returnedSubtotal, true)}
                      style={{ width: '6rem' }}
                      headerClassName="p-align-right"
                    />
                  </DataTable>
                </>
              )}

              {additionalCosts.length > 0 && (
                <>
                  <h4 className="mt-4 mb-2">{t('priceCalculator.recipe.additionalCosts')}</h4>
                  <DataTable value={additionalCosts} size="small">
                    <Column
                      header={t('priceCalculator.recipe.quantity')}
                      body={(row: AdditionalCostRow) => row.quantity}
                      style={{ width: '6rem' }}
                    />
                    <Column
                      header={t('priceCalculator.recipe.item')}
                      body={additionalCostNameTemplate}
                      footer={subtotalLabelFooter}
                    />
                    <Column
                      header={t('priceCalculator.recipe.unitPrice')}
                      body={additionalCostUnitTemplate}
                      style={{ width: '7rem' }}
                      headerClassName="p-align-right"
                    />
                    <Column
                      header={t('priceCalculator.recipe.totalCost')}
                      body={additionalCostTotalTemplate}
                      footer={subtotalValueFooter(additionalCostsSubtotal)}
                      style={{ width: '6rem' }}
                      headerClassName="p-align-right"
                    />
                  </DataTable>
                </>
              )}

              <div className="mt-auto pt-3">{totalFooter(leftTotal)}</div>
            </div>

            <div className="col-6 flex flex-column">
              <h4 className="mt-0 mb-2">{t('priceCalculator.recipe.products')}</h4>
              <DataTable value={products} size="small">
                <Column
                  header={t('priceCalculator.recipe.quantity')}
                  field="quantity"
                  style={{ width: '4rem' }}
                />
                <Column header={t('priceCalculator.recipe.item')} body={nameTemplate} />
                {showShareColumn && (
                  <Column
                    header={t('priceCalculator.recipe.share')}
                    body={shareTemplate}
                    style={{ width: '6rem' }}
                  />
                )}
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

              <div className="mt-auto pt-3">{totalFooter(productsTotal)}</div>
            </div>
          </div>
        </TabPanel>
        <TabPanel header={t('priceCalculator.recipe.tabUsedIn')}>
          <UsedInRecipesTable
            rows={usedInRows}
            emptyMessage={t('priceCalculator.recipe.usedInEmpty')}
            onOpenRecipe={onOpenRecipe ?? (() => {})}
          />
        </TabPanel>
      </TabView>
    </Dialog>
  )
}
