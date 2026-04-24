import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Dialog } from 'primereact/dialog'
import { InputNumber } from 'primereact/inputnumber'
import { TabPanel, TabView } from 'primereact/tabview'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CraftingTableIcon } from '@/components/common/CraftingTableIcon'
import { ItemIcon } from '@/components/common/ItemIcon'
import { PartLabel } from '@/components/common/PartLabel'
import { SkillIcon } from '@/components/common/SkillIcon'
import { TagLabel } from '@/components/common/TagLabel'
import { AppliedBonuses } from '@/components/price-calculator/products/AppliedBonuses'
import { IngredientPriceCell } from '@/components/price-calculator/products/IngredientPriceCell'
import { ProductItemName } from '@/components/price-calculator/products/ProductItemName'
import { UsedInRecipesTable } from '@/components/price-calculator/UsedInRecipesTable'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { usePriceManagement } from '@/hooks/use-price-management'
import {
  type PriceSignal,
  useRecipeCostCell,
  usePriceSignalRevision,
} from '@/hooks/use-prices-signal'
import { useRecipeManagement } from '@/hooks/use-recipe-management'
import { buildRecipeBuildState, buildRecipeIndexes } from '@/hooks/use-solver-snapshot'
import {
  useCellInTableRevision,
  useStoreRevision,
  useTableRowIdsRevision,
} from '@/hooks/use-store-revision'
import { getGameDataIndexes } from '@/lib/game-data-indexes'
import { formatQty, resolveRecipeModifiers } from '@/lib/recipe-modifiers'
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
  recipeElementId: string
  itemOrTagId: string
  name: string
  rawName: string
  baseQuantity: number
  modifiedQuantity: number
  hasModifiers: boolean
  unitPrice: number | null
  totalPrice: number | null
  isTag: boolean
  isProduced: boolean
  userPriceId: string
}

interface ProductRow extends ElementRow {
  userRecipeId: string
  sharePercent: number
}

interface AdditionalCostRow {
  id: 'craftTime' | 'labor'
  label: string
  baseQuantity: string
  modifiedQuantity: string
  unitSuffix: string
  hasModifiers: boolean
  unitPriceLabel: string
  totalPrice: number
}

function formatCraftTime(minutes: number): string {
  const totalSeconds = Math.round(minutes * 60)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  if (m === 0) return `${s}sec`
  if (s === 0) return `${m}min`
  return `${m}min ${s}sec`
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
  const { setPrice } = usePriceManagement(buildId)

  // Resolved modifier context for the current recipe. Rebuilt only when the
  // game-data or build-options tables it reads actually change — not on every
  // solver push. Shape mirrors the per-recipe slice of buildSolverSnapshot.
  const gameRevForMods = useStoreRevision(gameDataStore, [
    'modifiers',
    'talents',
    'talentBonuses',
    'pluginModules',
    'skills',
    'recipes',
    'recipeElements',
  ])
  const buildRevForMods = useStoreRevision(buildStore, [
    'userSkills',
    'userTalents',
    'userCraftingTables',
    'userRecipes',
  ])
  const resolvedMods = useMemo(
    () => {
      if (!recipeId) return null
      let userRecipeId = ''
      let roundFactor = 0
      for (const urId of buildStore.getRowIds('userRecipes')) {
        const ur = buildStore.getRow('userRecipes', urId)
        if (ur.buildId === buildId && ur.recipeId === recipeId) {
          userRecipeId = urId
          roundFactor = (ur.roundFactor as number) ?? 0
          break
        }
      }
      const indexes = buildRecipeIndexes(gameDataStore)
      const buildState = buildRecipeBuildState(buildStore, buildId)
      return resolveRecipeModifiers(
        gameDataStore,
        recipeId,
        userRecipeId,
        roundFactor,
        datasetId,
        indexes,
        buildState,
        getName
      )
    },
    // gameRevForMods / buildRevForMods are the invalidation signals; getName
    // changes identity when the localized-name index reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      gameDataStore,
      buildStore,
      recipeId,
      buildId,
      datasetId,
      getName,
      gameRevForMods,
      buildRevForMods,
    ]
  )

  const onPriceChange = useCallback(
    (itemOrTagId: string, userPriceId: string, value: number | null) => {
      setPrice(itemOrTagId, value, userPriceId)
    },
    [setPrice]
  )

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

    // modifier multiplier + final modified quantity per recipeElement, keyed
    // by recipeElement row id. Absent key → no bonuses apply (multiplier = 1).
    const computeModified = (reId: string, baseAbsQuantity: number): number => {
      const modified = resolvedMods?.elementModifiedQuantities.get(reId)
      return modified != null ? Math.abs(modified) : baseAbsQuantity
    }

    for (const r of rawRows) {
      if (!r.isProduct) {
        const itemRow = gameDataStore.getRow('items', r.itemOrTagId)
        const baseAbs = Math.abs(r.baseQuantity)
        const modifiedAbs = computeModified(r.id, baseAbs)
        ingredients.push({
          recipeElementId: r.id,
          itemOrTagId: r.itemOrTagId,
          name: getName('item', r.itemOrTagId),
          rawName: (itemRow?.name as string) ?? '',
          baseQuantity: baseAbs,
          modifiedQuantity: modifiedAbs,
          hasModifiers: modifiedAbs !== baseAbs,
          unitPrice: resolveUnitPrice(r.itemOrTagId, false),
          totalPrice: null,
          isTag: (itemRow?.isTag as boolean) ?? false,
          // isProduced and userPriceId are populated at render time below,
          // since the producedItemIds / userPriceIdByItem maps are built by a
          // memo that runs after this callback is declared.
          isProduced: false,
          userPriceId: '',
        })
      }
    }
    // Totals use modified quantity so the dialog's subtotals match what the
    // solver actually charges (baseQuantity × unitPrice would diverge once
    // any bonus reduces ingredient needs).
    for (const ing of ingredients) {
      ing.totalPrice = ing.unitPrice != null ? ing.unitPrice * ing.modifiedQuantity : null
    }

    for (const r of productRaws) {
      const name = getName('item', r.itemOrTagId)
      const rawName = getItemRawName(r.itemOrTagId)
      const baseAbs = Math.abs(r.baseQuantity)
      const modifiedAbs = computeModified(r.id, baseAbs)
      const unitPrice = resolveUnitPrice(r.itemOrTagId, true)
      const totalPrice = unitPrice != null ? unitPrice * modifiedAbs : null

      if (ingredientItemIds.has(r.itemOrTagId)) {
        returnedIngredients.push({
          recipeElementId: r.id,
          itemOrTagId: r.itemOrTagId,
          name,
          rawName,
          baseQuantity: baseAbs,
          modifiedQuantity: modifiedAbs,
          hasModifiers: modifiedAbs !== baseAbs,
          unitPrice,
          totalPrice,
          isTag: false,
          isProduced: false,
          userPriceId: '',
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
          recipeElementId: r.id,
          itemOrTagId: r.itemOrTagId,
          name,
          rawName,
          baseQuantity: baseAbs,
          modifiedQuantity: modifiedAbs,
          hasModifiers: modifiedAbs !== baseAbs,
          unitPrice,
          totalPrice,
          isTag: false,
          isProduced: false,
          userPriceId: '',
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
    resolvedMods,
  ])

  const [activeTabIndex, setActiveTabIndex] = useState(0)
  // Reset to the first tab (Cost Components) whenever the dialog switches to
  // a new recipe — e.g. clicking a recipe in the Used-in-Recipes list.
  useEffect(() => {
    setActiveTabIndex(0)
  }, [recipeId])

  // Keep the dialog from shrinking when the user switches to a tab with less
  // content (e.g. "Used in Recipes" is often much shorter than "Cost
  // Components"). Snapshot the current tab's rendered height at switch time
  // and apply it as a min-height — content can still grow past it, but can't
  // collapse below. Reset on recipe change so a new recipe starts fresh.
  const tabContentRef = useRef<HTMLDivElement | null>(null)
  const [tabMinHeight, setTabMinHeight] = useState<number | undefined>(undefined)
  useEffect(() => {
    setTabMinHeight(undefined)
  }, [recipeId])
  const handleTabChange = useCallback((e: { index: number }) => {
    const el = tabContentRef.current
    if (el) {
      const h = el.getBoundingClientRect().height
      if (h > 0) setTabMinHeight((prev) => (prev == null || h > prev ? h : prev))
    }
    setActiveTabIndex(e.index)
  }, [])

  useStoreRevision(buildStore, ['userProductShares'])
  // Row-ids-only: the useMemo below only reads userRecipes.recipeId (stable
  // after row creation) and userPrices.itemOrTagId (ditto). Cell edits like
  // a userPrices.price change must not invalidate this memo — doing so
  // caused ~2.8s main-thread blocks per keystroke in a material price.
  const buildRecipesRev = useTableRowIdsRevision(buildStore, ['userRecipes', 'userPrices'])
  // The excluded-item set in the memo below depends on userPrices.isOverride
  // — flipping it on an existing row doesn't change row IDs, so subscribe to
  // that one cell across all rows.
  const isOverrideRev = useCellInTableRevision(buildStore, 'userPrices', 'isOverride')
  // Re-render whenever the solver pushes a new result, so the inline reads
  // via `priceSignal.get(...)` / `priceSignal.getRecipe(...)` above reflect
  // the new numbers (e.g. when the user edits a share %).
  usePriceSignalRevision(priceSignal)
  const recipeCost = useRecipeCostCell(priceSignal, recipeId)

  // Items that are primary products of any user-selected recipe in this build.
  // Clicking an ingredient that is one of these opens its winning recipe (via
  // `ProductItemName`) instead of the generic `MaterialDialog`.
  const { productItemIds, userPriceIdByItem, producedItemIds } = useMemo(() => {
    const products = new Set<string>()
    const produced = new Set<string>()
    const priceIds = new Map<string, string>()
    // Dialog is closed — skip the scan entirely. None of the return values
    // are read before the `recipeId ? ... : null` render guard below.
    if (!recipeId) {
      return { productItemIds: products, userPriceIdByItem: priceIds, producedItemIds: produced }
    }
    // Use the cached per-recipe indexes instead of the N×M nested scan over
    // recipeElements — with a full dataset that loop was 225 × 4585 ≈ 1M
    // row reads per rebuild.
    const { productItemIdsByRecipeId, ingredientItemIdsByRecipeId } =
      getGameDataIndexes(gameDataStore)
    // Items the user has moved from Products to Materials. They must be
    // treated as not-produced here so the dialog renders an editable price
    // cell and a Material-link name (instead of locking the row read-only
    // and routing the name click to a recipe view).
    const excluded = new Set<string>()
    for (const upId of buildStore.getRowIds('userPrices')) {
      const up = buildStore.getRow('userPrices', upId)
      if (up.buildId !== buildId) continue
      priceIds.set(up.itemOrTagId as string, upId)
      if (up.isOverride && up.priceMode === 'manual') {
        excluded.add(up.itemOrTagId as string)
      }
    }
    for (const urId of buildStore.getRowIds('userRecipes')) {
      const ur = buildStore.getRow('userRecipes', urId)
      if (ur.buildId !== buildId) continue
      const rId = ur.recipeId as string
      const ownProducts = productItemIdsByRecipeId.get(rId)
      if (!ownProducts || ownProducts.length === 0) continue
      const ownIngredients = ingredientItemIdsByRecipeId.get(rId) ?? new Set<string>()
      // Produced set excludes reintegrated products (same rule as the
      // Materials list at Materials.tsx:107-140), so a recipe that consumes
      // its own product doesn't lock that ingredient as read-only.
      for (const itemId of ownProducts) {
        if (ownIngredients.has(itemId)) continue
        if (excluded.has(itemId)) continue
        produced.add(itemId)
      }
      // The index preserves recipeElements order, so the first product is
      // the primary (same definition the rest of the app uses). Skip when
      // the primary has been moved to Materials — the row should render as
      // a material, not a clickable recipe-product.
      const primary = ownProducts[0]
      if (!excluded.has(primary)) products.add(primary)
    }
    return { productItemIds: products, userPriceIdByItem: priceIds, producedItemIds: produced }
    // buildRecipesRev / isOverrideRev are the invalidation signals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildStore, gameDataStore, buildId, recipeId, buildRecipesRev, isOverrideRev])

  const gameRev = useStoreRevision(gameDataStore, [
    'recipeElements',
    'recipes',
    'tagItems',
    'items',
    'itemParts',
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
  // Enrich ingredient rows with build-scoped flags: whether the item is
  // produced by any recipe in the build (locks it read-only) and its
  // userPrices row id (for in-place edits). Populated here so the memo that
  // owns these maps can live below `getElements`.
  for (const ing of ingredients) {
    ing.isProduced = producedItemIds.has(ing.itemOrTagId)
    ing.userPriceId = userPriceIdByItem.get(ing.itemOrTagId) ?? ''
  }
  const showShareColumn = products.length > 1

  // Recipe header icon: first non-reintegrated product's raw name, falling
  // back to the first product if all products are reintegrated.
  const headerRawName = products[0]?.rawName || returnedIngredients[0]?.rawName || ''

  const primaryProductId = products[0]?.itemOrTagId || returnedIngredients[0]?.itemOrTagId || ''
  const isPrimaryProductPart = primaryProductId
    ? !!gameDataStore.getRow('items', primaryProductId)?.isPart
    : false
  let partLabelTitle: string | undefined
  if (isPrimaryProductPart && primaryProductId) {
    const usedIn: Array<{ name: string; quantity: number }> = []
    for (const ipId of gameDataStore.getRowIds('itemParts')) {
      const ip = gameDataStore.getRow('itemParts', ipId)
      if ((ip.partItemId as string) === primaryProductId) {
        usedIn.push({ name: getName('item', ip.itemId as string), quantity: ip.quantity as number })
      }
    }
    if (usedIn.length > 0) {
      usedIn.sort((a, b) => a.name.localeCompare(b.name))
      partLabelTitle = usedIn.map((u) => `${u.name} ×${u.quantity}`).join('\n')
    }
  }
  const productTagIds: string[] = []
  if (primaryProductId) {
    for (const tiId of gameDataStore.getRowIds('tagItems')) {
      const ti = gameDataStore.getRow('tagItems', tiId)
      if (ti.itemId === primaryProductId) {
        productTagIds.push(ti.tagId as string)
      }
    }
  }

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

  const baseCraftTime = (recipe.baseCraftTime as number) ?? 0
  const baseLaborCost = (recipe.baseLaborCost as number) ?? 0
  const craftTimeChanged = recipeCost ? recipeCost.craftTime !== baseCraftTime : false
  const laborChanged = recipeCost ? recipeCost.laborAmount !== baseLaborCost : false
  const additionalCosts: AdditionalCostRow[] = recipeCost
    ? [
        {
          id: 'craftTime',
          label: t('priceCalculator.recipe.craftTime'),
          baseQuantity: formatCraftTime(baseCraftTime),
          modifiedQuantity: formatCraftTime(recipeCost.craftTime),
          unitSuffix: '',
          hasModifiers: craftTimeChanged,
          unitPriceLabel: `${recipeCost.costPerMinute.toFixed(2)} $/min`,
          totalPrice: recipeCost.craftTimeCost,
        },
        {
          id: 'labor',
          label: t('priceCalculator.recipe.labor'),
          baseQuantity: baseLaborCost.toFixed(0),
          modifiedQuantity: recipeCost.laborAmount.toFixed(0),
          unitSuffix: 'cal',
          hasModifiers: laborChanged,
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

  const quantityTemplate = (row: ElementRow) =>
    row.hasModifiers ? (
      <span>
        <span style={{ color: 'var(--primary-color)' }}>{formatQty(row.modifiedQuantity)}</span>{' '}
        <span className="font-italic">({formatQty(row.baseQuantity)})</span>
      </span>
    ) : (
      <span>{formatQty(row.baseQuantity)}</span>
    )

  const additionalCostQuantityTemplate = (row: AdditionalCostRow) => {
    const suffix = row.unitSuffix ? ` ${row.unitSuffix}` : ''
    if (!row.hasModifiers) {
      return (
        <span>
          {row.modifiedQuantity}
          {suffix}
        </span>
      )
    }
    return (
      <span>
        <span style={{ color: 'var(--primary-color)' }}>
          {row.modifiedQuantity}
          {suffix}
        </span>{' '}
        <span className="font-italic">
          ({row.baseQuantity}
          {suffix})
        </span>
      </span>
    )
  }

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

  const ingredientPriceTemplate = (row: ElementRow) => (
    <div className="flex justify-content-end">
      <IngredientPriceCell
        itemOrTagId={row.itemOrTagId}
        userPriceId={row.userPriceId}
        buildStore={buildStore}
        isTag={row.isTag}
        isProduced={row.isProduced}
        unitPrice={row.unitPrice}
        onChange={onPriceChange}
      />
    </div>
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
        <span
          className="flex align-items-center"
          title={`${t('priceCalculator.recipe.skill')}: ${skillName}`}
        >
          <SkillIcon skill={{ name: skillRawName }} />
        </span>
      )}
      {tableRawName && (
        <span
          className="flex align-items-center"
          title={`${t('priceCalculator.recipe.craftingTable')}: ${tableName}`}
        >
          <CraftingTableIcon table={{ name: tableRawName }} />
        </span>
      )}
      {(isPrimaryProductPart || productTagIds.length > 0) && (
        <div className="flex align-items-center gap-3 ml-3">
          {isPrimaryProductPart && <PartLabel title={partLabelTitle} />}
          {productTagIds.map((tagId) => {
            const tagName = getName('item', tagId)
            return tagName ? <TagLabel key={tagId} tagName={tagName} /> : null
          })}
        </div>
      )}
    </div>
  )

  return (
    <Dialog
      header={headerNode}
      visible={!!recipeId}
      onHide={onHide}
      style={{ width: '75vw' }}
      modal
      dismissableMask
      maximizable
    >
      <div
        ref={tabContentRef}
        style={tabMinHeight != null ? { minHeight: tabMinHeight } : undefined}
      >
        <TabView activeIndex={activeTabIndex} onTabChange={handleTabChange}>
          <TabPanel header={t('priceCalculator.recipe.tabCostComponents')}>
            <div className="grid">
              <div className="col-6 flex flex-column">
                <h4 className="mt-0 mb-2">{t('priceCalculator.recipe.ingredients')}</h4>
                <DataTable value={ingredients} size="small">
                  <Column
                    header={t('priceCalculator.recipe.quantity')}
                    body={quantityTemplate}
                    style={{ width: '6rem' }}
                  />
                  <Column
                    header={t('priceCalculator.recipe.item')}
                    body={ingredientNameTemplate}
                    footer={subtotalLabelFooter}
                  />
                  <Column
                    header={t('priceCalculator.recipe.unitPrice')}
                    body={ingredientPriceTemplate}
                    style={{ width: '7rem' }}
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
                        body={quantityTemplate}
                        style={{ width: '6rem' }}
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
                        body={additionalCostQuantityTemplate}
                        style={{ width: '8rem' }}
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
                    body={quantityTemplate}
                    style={{ width: '6rem' }}
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

                {resolvedMods && resolvedMods.bonuses.length > 0 && (
                  <AppliedBonuses bonuses={resolvedMods.bonuses} />
                )}

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
      </div>
    </Dialog>
  )
}
