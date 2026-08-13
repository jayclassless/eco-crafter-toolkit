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
import type { GarbageAmountRow } from '@/components/price-calculator/products/GarbageAmount'
import {
  GarbageBreakdownTab,
  type GarbageBreakdownViewRow,
} from '@/components/price-calculator/products/GarbageBreakdownTab'
import { GarbageOutputTable } from '@/components/price-calculator/products/GarbageOutputTable'
import { IngredientPriceCell } from '@/components/price-calculator/products/IngredientPriceCell'
import { ProductItemName } from '@/components/price-calculator/products/ProductItemName'
import { RecipeFavoriteStar } from '@/components/price-calculator/products/RecipeFavoriteStar'
import { RecipeDependencyGraph } from '@/components/price-calculator/recipe-dependency-graph/RecipeDependencyGraph'
import { UsedInRecipesTable } from '@/components/price-calculator/UsedInRecipesTable'
import { CustomRecipeFormDialog } from '@/components/settings/datasets/CustomRecipeFormDialog'
import { useLocalization } from '@/hooks/use-localization'
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
import { CRAFT_GARBAGE_RATIO } from '@/lib/game-constants'
import { getGameDataIndexes } from '@/lib/game-data-indexes'
import { computeRecipeGarbage } from '@/lib/recipe-garbage'
import { resolveRecipeModifiers } from '@/lib/recipe-modifiers'
import { buildReintegrationOverrides, computeReintegratedProductIds } from '@/lib/reintegration'
import { computeAutoShares } from '@/lib/share-defaults'
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
  isCustom: boolean
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
  const { formatPrice, formatDuration, formatNumber, compare } = useLocalization()
  const { setProductShare, setProductReintegrated, setRecipeFavorite } =
    useRecipeManagement(buildId)
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
        getName,
        compare
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
      compare,
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
        // Gate on `priceMode === 'manual'`, not on a truthy `price`. The `price`
        // cell defaults to 0 and rows also exist for mode/mirror/exclude with a
        // placeholder 0, so a truthiness check both (a) dropped a deliberate
        // manual price of 0 — a valid "free" material — and (b) would misread
        // those placeholder rows as priced. Manual mode is the precise signal
        // that the user typed a price (see use-price-management.setPrice).
        if (up.buildId === buildId && up.itemOrTagId === itemId && up.priceMode === 'manual') {
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

  // Pure structural assembly of the recipe's ingredient/product rows WITHOUT
  // prices. Memoized via `elementStructure` below so it only re-runs when the
  // game-data / build structure changes — not on every solver price push.
  const buildElementStructure = useCallback(() => {
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

    // Which products are reintegrated (credited against cost, shown on the
    // ingredient side) vs sellable. Mirrors the snapshot-side computation in
    // `assembleSolverRecipe` so the dialog matches what the solver charges.
    const reintegratedIds = computeReintegratedProductIds({
      orderedProductItemIds: productRaws.map((r) => r.itemOrTagId),
      ingredientItemIds,
      autoReintegrateSecondaryItemIds:
        getGameDataIndexes(gameDataStore).recipeIndexes.autoReintegrateSecondaryItemIds,
      userOverrides: buildReintegrationOverrides(buildStore, buildId).get(userRecipeId),
    })

    // Auto-default shares used when the user hasn't edited any share for this
    // recipe. Mirrors the snapshot-side computation in
    // `assembleSolverRecipe` so the dialog displays exactly what the solver
    // charges. Only computed when needed.
    let autoShares: Map<string, number> | null = null
    if (!hasUserShares) {
      const nonReintegratedIds = productRaws
        .map((r) => r.itemOrTagId)
        .filter((id) => !reintegratedIds.has(id))
      let configPercent = 20
      for (const rowId of buildStore.getRowIds('userSettings')) {
        const row = buildStore.getRow('userSettings', rowId)
        if (row.buildId !== buildId) continue
        configPercent = (row.defaultShareForSecondaryItems as number) ?? 20
        break
      }
      const zeroShare = getGameDataIndexes(gameDataStore).recipeIndexes.zeroShareSecondaryItemIds
      autoShares = computeAutoShares(nonReintegratedIds, zeroShare, configPercent)
    }

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
          isCustom: !!itemRow?.isCustom,
          baseQuantity: baseAbs,
          modifiedQuantity: modifiedAbs,
          hasModifiers: modifiedAbs !== baseAbs,
          // unitPrice / totalPrice are filled at render time from the price
          // signal (see the price-fill pass below) so a solver push doesn't
          // re-run this structural scan. isProduced / userPriceId are likewise
          // populated at render from the producedItemIds / userPriceIdByItem
          // maps built further down.
          unitPrice: null,
          totalPrice: null,
          isTag: (itemRow?.isTag as boolean) ?? false,
          isProduced: false,
          userPriceId: '',
        })
      }
    }

    for (const r of productRaws) {
      const name = getName('item', r.itemOrTagId)
      const rawName = getItemRawName(r.itemOrTagId)
      const itemRow = gameDataStore.getRow('items', r.itemOrTagId)
      const isCustom = !!itemRow?.isCustom
      const baseAbs = Math.abs(r.baseQuantity)
      const modifiedAbs = computeModified(r.id, baseAbs)

      if (reintegratedIds.has(r.itemOrTagId)) {
        returnedIngredients.push({
          recipeElementId: r.id,
          itemOrTagId: r.itemOrTagId,
          name,
          rawName,
          isCustom,
          baseQuantity: baseAbs,
          modifiedQuantity: modifiedAbs,
          hasModifiers: modifiedAbs !== baseAbs,
          unitPrice: null,
          totalPrice: null,
          isTag: false,
          isProduced: false,
          userPriceId: '',
        })
      } else {
        const sharePercent = hasUserShares
          ? (userSharesByProduct.get(r.itemOrTagId) ?? 0)
          : (autoShares?.get(r.itemOrTagId) ?? 0)
        products.push({
          recipeElementId: r.id,
          itemOrTagId: r.itemOrTagId,
          name,
          rawName,
          isCustom,
          baseQuantity: baseAbs,
          modifiedQuantity: modifiedAbs,
          hasModifiers: modifiedAbs !== baseAbs,
          unitPrice: null,
          totalPrice: null,
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
    getName,
    getItemRawName,
    resolvedMods,
  ])

  const [editFormVisible, setEditFormVisible] = useState(false)

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

  // Invalidation signal for the structural element memo below. userSettings is
  // included so it refreshes when the build's defaultShareForSecondaryItems
  // changes — the builder reads it inline to compute auto-default share
  // percentages for multi-product recipes.
  const shareConfigRev = useStoreRevision(buildStore, [
    'userProductShares',
    'userReintegratedProducts',
    'userSettings',
  ])
  // Row-ids-only: the useMemo below only reads userRecipes.recipeId (stable
  // after row creation) and userPrices.itemOrTagId (ditto). Cell edits like
  // a userPrices.price change must not invalidate this memo — doing so
  // caused ~2.8s main-thread blocks per keystroke in a material price.
  const buildRecipesRev = useTableRowIdsRevision(buildStore, ['userRecipes', 'userPrices'])
  // The excluded-item set in the memo below depends on userPrices.isOverride
  // — flipping it on an existing row doesn't change row IDs, so subscribe to
  // that one cell across all rows.
  const isOverrideRev = useCellInTableRevision(buildStore, 'userPrices', 'isOverride')
  // Reintegration overrides affect which products count as "produced" below.
  // Subscribe to both row adds/removes and isReintegrated cell flips.
  const reintegrateRowRev = useTableRowIdsRevision(buildStore, ['userReintegratedProducts'])
  const reintegrateCellRev = useCellInTableRevision(
    buildStore,
    'userReintegratedProducts',
    'isReintegrated'
  )
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
    const { productItemIdsByRecipeId, ingredientItemIdsByRecipeId, recipeIndexes } =
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
    // Per-recipe reintegration overrides, keyed by userRecipeId.
    const reintegrateOverridesByUserRecipe = buildReintegrationOverrides(buildStore, buildId)
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
      const reintegratedIds = computeReintegratedProductIds({
        orderedProductItemIds: ownProducts,
        ingredientItemIds: ownIngredients,
        autoReintegrateSecondaryItemIds: recipeIndexes.autoReintegrateSecondaryItemIds,
        userOverrides: reintegrateOverridesByUserRecipe.get(urId),
      })
      for (const itemId of ownProducts) {
        if (reintegratedIds.has(itemId)) continue
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
    // buildRecipesRev / isOverrideRev / reintegrate* are the invalidation signals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    buildStore,
    gameDataStore,
    buildId,
    recipeId,
    buildRecipesRev,
    isOverrideRev,
    reintegrateRowRev,
    reintegrateCellRev,
  ])

  const gameRev = useStoreRevision(gameDataStore, [
    'recipeElements',
    'recipes',
    'tagItems',
    'items',
    'itemParts',
  ])

  // Structural rows (no prices), recomputed only when the recipe structure or
  // build options change. `buildElementStructure` reads stores directly, so its
  // useCallback identity doesn't change on a cell edit — the revision signals
  // below are what invalidate the memo. Prices are filled at render time so a
  // solver push re-renders without re-running this scan.
  const elementStructure = useMemo(
    () => buildElementStructure(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      buildElementStructure,
      gameRev,
      shareConfigRev,
      buildRecipesRev,
      reintegrateRowRev,
      reintegrateCellRev,
    ]
  )

  // Which item the build has pinned for each tag. Only this one cell matters
  // here, so subscribe to it rather than to all of `userPrices`.
  const primaryItemRev = useCellInTableRevision(buildStore, 'userPrices', 'primaryItemId')

  /**
   * Garbage this craft produces.
   *
   * Deliberately built from the raw recipe elements rather than from
   * `elementStructure` / `resolvedMods`: garbage uses BASE ingredient
   * quantities (confirmed in game — installing upgrade modules reduced the
   * ingredients consumed but not the garbage produced), so it must not depend
   * on the build's modules, talents or skill levels, and must not re-run when
   * they change. `gameRev` and the tag-pin signal are the only inputs.
   *
   * Null when the recipe produces no garbage, which hides both the Cost
   * Components section and the Waste tab. That covers all of v11–v13, which
   * ship no salvage data at all, with no version check.
   */
  const garbage = useMemo(() => {
    if (!recipeId) return null
    const indexes = getGameDataIndexes(gameDataStore)

    const pinnedTagItems = new Map<string, string>()
    for (const upId of buildStore.getRowIds('userPrices')) {
      const up = buildStore.getRow('userPrices', upId)
      if (up.buildId !== buildId) continue
      if (up.primaryItemId) {
        pinnedTagItems.set(up.itemOrTagId as string, up.primaryItemId as string)
      }
    }

    const elements = indexes.recipeIndexes.elementsByRecipeId.get(recipeId) ?? []
    const { totals, breakdown } = computeRecipeGarbage({
      explicit: indexes.garbageByRecipeId.get(recipeId) ?? [],
      ingredients: elements
        .filter(({ row }) => !row.isProduct)
        .map(({ row }) => ({
          itemOrTagId: row.itemOrTagId as string,
          quantity: row.baseQuantity as number,
        })),
      salvageByItemId: indexes.salvageByItemId,
      // The same candidate list the price solver walks for min/max pricing, so
      // a tag's waste range and its cost describe the same set of items.
      tagItemIds: (id) => indexes.itemIdsByTagId.get(id),
      resolveTagItem: (tagId) => pinnedTagItems.get(tagId) ?? null,
      ratio: CRAFT_GARBAGE_RATIO,
    })
    if (totals.length === 0) return null

    const decorate = (q: { itemId: string; min: number; max: number }): GarbageAmountRow => ({
      ...q,
      name: getName('item', q.itemId) || getItemRawName(q.itemId),
      rawName: getItemRawName(q.itemId),
      isCustom: !!gameDataStore.getRow('items', q.itemId)?.isCustom,
    })

    const rows: GarbageBreakdownViewRow[] = breakdown.map((r, i) => ({
      key: r.sourceItemOrTagId ?? `explicit-${i}`,
      source: r.sourceItemOrTagId
        ? {
            // A pinned tag is displayed as the item it resolved to — that is
            // the thing whose salvage the numbers actually came from.
            name:
              getName('item', r.resolvedItemId ?? r.sourceItemOrTagId) ||
              getItemRawName(r.resolvedItemId ?? r.sourceItemOrTagId),
            rawName: getItemRawName(r.resolvedItemId ?? r.sourceItemOrTagId),
            isCustom: !!gameDataStore.getRow('items', r.resolvedItemId ?? r.sourceItemOrTagId)
              ?.isCustom,
          }
        : null,
      sourceQuantity: r.sourceQuantity,
      isRange: r.isRange,
      outputs: r.outputs.map(decorate),
    }))

    return { totals: totals.map(decorate), rows }
    // gameRev / primaryItemRev are the invalidation signals for this memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    recipeId,
    buildId,
    gameDataStore,
    buildStore,
    getName,
    getItemRawName,
    gameRev,
    primaryItemRev,
  ])

  // Recipes that consume the primary product of the current recipe (both in
  // and out of the build — the table's scope toggle filters them). The primary
  // product is the first product (by `index`) that isn't also an ingredient of
  // this recipe (i.e. not reintegrated). Delegates the ingredient scan +
  // tag-expansion to the shared helper.
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
        compare,
      })
    },
    // gameRev / buildRecipesRev are the invalidation signals for this memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      recipeId,
      buildId,
      datasetId,
      gameDataStore,
      buildStore,
      getName,
      compare,
      gameRev,
      buildRecipesRev,
    ]
  )

  if (!recipeId) return null

  const recipe = gameDataStore.getRow('recipes', recipeId)
  if (!recipe) return null

  // Fall back to the raw `recipes.name` when no localized name is available —
  // notably for a custom recipe that was just created in this session, before
  // the localized-name index has reloaded.
  const recipeName = getName('recipe', recipeId) || ((recipe.name as string) ?? '')
  const isCustomRecipe = !!recipe.isCustom
  const skillName = recipe.skillId ? getName('skill', recipe.skillId as string) : ''
  const tableName = getName('craftingTable', recipe.craftingTableId as string)
  const skillRawName = recipe.skillId
    ? ((gameDataStore.getRow('skills', recipe.skillId as string)?.name as string) ?? '')
    : ''
  const tableRawName =
    (gameDataStore.getRow('craftingTables', recipe.craftingTableId as string)?.name as string) ?? ''

  // Fill prices at render time from the price signal so a solver push updates
  // the displayed numbers without re-running the structural scan in
  // `elementStructure`. New row objects are produced — the memoized structure
  // must not be mutated. Totals use modified quantity so subtotals match what
  // the solver charges (baseQuantity × unitPrice would diverge once a bonus
  // reduces ingredient needs).
  const fillPrice = (row: ElementRow, isProduct: boolean) => {
    const unitPrice = resolveUnitPrice(row.itemOrTagId, isProduct)
    return { unitPrice, totalPrice: unitPrice != null ? unitPrice * row.modifiedQuantity : null }
  }
  // Ingredient rows additionally carry build-scoped flags: produced-by-build
  // locks the row read-only, and userPriceId enables in-place edits.
  const ingredients = elementStructure.ingredients.map((row) => ({
    ...row,
    ...fillPrice(row, false),
    isProduced: producedItemIds.has(row.itemOrTagId),
    userPriceId: userPriceIdByItem.get(row.itemOrTagId) ?? '',
  }))
  const returnedIngredients = elementStructure.returnedIngredients.map((row) => ({
    ...row,
    ...fillPrice(row, true),
  }))
  const products = elementStructure.products.map((row) => ({ ...row, ...fillPrice(row, true) }))
  const showShareColumn = products.length > 1
  // Show the per-product reintegration toggle on the products table only when
  // there's something meaningful to do: more than one sellable product (so a
  // product can be moved to "returned" without leaving zero priced output), or
  // at least one already-returned product that could be moved back.
  const showReintegrateControls = products.length > 1 || returnedIngredients.length > 0

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
      usedIn.sort((a, b) => compare(a.name, b.name))
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
          baseQuantity: formatDuration(baseCraftTime),
          modifiedQuantity: formatDuration(recipeCost.craftTime),
          unitSuffix: '',
          hasModifiers: craftTimeChanged,
          unitPriceLabel: `${formatPrice(recipeCost.costPerMinute)} $/min`,
          totalPrice: recipeCost.craftTimeCost,
        },
        {
          id: 'labor',
          label: t('priceCalculator.recipe.labor'),
          baseQuantity: formatNumber(baseLaborCost),
          modifiedQuantity: formatNumber(recipeCost.laborAmount),
          unitSuffix: 'cal',
          hasModifiers: laborChanged,
          unitPriceLabel: `${formatPrice(recipeCost.calorieCost)} $/1k cal`,
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
        <span style={{ color: 'var(--primary-color)' }}>
          {formatNumber(row.modifiedQuantity, { maximumFractionDigits: 2 })}
        </span>{' '}
        <span className="font-italic">
          ({formatNumber(row.baseQuantity, { maximumFractionDigits: 2 })})
        </span>
      </span>
    ) : (
      <span>{formatNumber(row.baseQuantity, { maximumFractionDigits: 2 })}</span>
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
      {(row.rawName || row.isCustom) && (
        <ItemIcon item={{ name: row.rawName, isCustom: row.isCustom }} />
      )}
      <span>{row.name}</span>
    </div>
  )

  const materialOnlyNameTemplate = (row: ElementRow) =>
    onOpenMaterial ? (
      <div className="flex align-items-center gap-2">
        {(row.rawName || row.isCustom) && (
          <ItemIcon item={{ name: row.rawName, isCustom: row.isCustom }} />
        )}
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
          isCustom={row.isCustom}
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
      {row.unitPrice != null ? formatPrice(row.unitPrice) : '-'}
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
      {row.totalPrice != null ? formatPrice(row.totalPrice) : '-'}
    </span>
  )

  const deductedTotalTemplate = (row: ElementRow) => (
    <span className="text-right block font-semibold text-color-secondary">
      {row.totalPrice != null ? `−${formatPrice(row.totalPrice)}` : '-'}
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
      <span>{value != null ? formatPrice(value) : '-'}</span>
    </div>
  )

  const subtotalValueFooter = (value: number | null, deducted = false) => (
    <span className={`text-right block font-semibold${deducted ? ' text-color-secondary' : ''}`}>
      {value != null ? (deducted ? `−${formatPrice(value)}` : formatPrice(value)) : '-'}
    </span>
  )
  const subtotalLabelFooter = (
    <span className="font-semibold">{t('priceCalculator.recipe.subtotal')}</span>
  )

  const additionalCostTotalTemplate = (row: AdditionalCostRow) => (
    <span className="text-right block font-semibold">{formatPrice(row.totalPrice)}</span>
  )

  const additionalCostUnitTemplate = (row: AdditionalCostRow) => (
    <span className="text-right block text-color-secondary">{row.unitPriceLabel}</span>
  )

  const additionalCostNameTemplate = (row: AdditionalCostRow) => <span>{row.label}</span>

  const headerUserRecipeId = findUserRecipeId()

  // Move a sellable product to the "returned ingredients" (credited) side.
  // Hidden for the last remaining sellable product so a recipe always keeps at
  // least one priced output.
  const reintegrateToggleTemplate = (row: ProductRow) => {
    if (!row.userRecipeId || products.length <= 1) return null
    return (
      <div className="flex justify-content-center">
        <Button
          icon="pi pi-arrow-left"
          text
          rounded
          severity="secondary"
          aria-label={t('priceCalculator.recipe.reintegrateTooltip')}
          tooltip={t('priceCalculator.recipe.reintegrateTooltip')}
          tooltipOptions={{ position: 'top' }}
          onClick={() => setProductReintegrated(row.userRecipeId, row.itemOrTagId, true)}
        />
      </div>
    )
  }

  // Move a returned/credited product back to the sellable products side.
  const unreintegrateToggleTemplate = (row: ElementRow) => {
    if (!headerUserRecipeId) return null
    return (
      <div className="flex justify-content-center">
        <Button
          icon="pi pi-arrow-right"
          text
          rounded
          severity="secondary"
          aria-label={t('priceCalculator.recipe.stopReintegrateTooltip')}
          tooltip={t('priceCalculator.recipe.stopReintegrateTooltip')}
          tooltipOptions={{ position: 'top' }}
          onClick={() => setProductReintegrated(headerUserRecipeId, row.itemOrTagId, false)}
        />
      </div>
    )
  }

  const headerNode = (
    <div className="flex align-items-center gap-2">
      {(headerRawName || isCustomRecipe) && (
        <ItemIcon item={{ name: headerRawName, isCustom: isCustomRecipe }} size={48} />
      )}
      <span>{recipeName}</span>
      {headerUserRecipeId && (
        <RecipeFavoriteStar
          buildStore={buildStore}
          userRecipeId={headerUserRecipeId}
          onToggle={setRecipeFavorite}
        />
      )}
      {skillRawName && (
        <span
          className="flex align-items-center"
          title={t('common.labeledValue', {
            label: t('priceCalculator.recipe.skill'),
            value: skillName,
          })}
        >
          <SkillIcon skill={{ name: skillRawName }} />
        </span>
      )}
      {tableRawName && (
        <span
          className="flex align-items-center"
          title={t('common.labeledValue', {
            label: t('priceCalculator.recipe.craftingTable'),
            value: tableName,
          })}
        >
          <CraftingTableIcon table={{ name: tableRawName }} />
        </span>
      )}
      {(isPrimaryProductPart || productTagIds.length > 0) && (
        <div className="flex align-items-center gap-3">
          {isPrimaryProductPart && <PartLabel title={partLabelTitle} />}
          {productTagIds.map((tagId) => {
            const tagName = getName('item', tagId)
            return tagName ? <TagLabel key={tagId} tagName={tagName} /> : null
          })}
        </div>
      )}
      {isCustomRecipe && (
        <Button
          icon="pi pi-pencil"
          size="small"
          text
          aria-label={t('settings.customEntities.editCustomRecipe')}
          tooltip={t('settings.customEntities.editCustomRecipe')}
          tooltipOptions={{ position: 'bottom' }}
          onClick={() => setEditFormVisible(true)}
        />
      )}
    </div>
  )

  return (
    <>
      <Dialog
        header={headerNode}
        visible={!!recipeId}
        onHide={onHide}
        style={{ width: '75vw' }}
        modal
        dismissableMask
        maximizable
        focusOnShow={false}
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
                  <DataTable value={ingredients} dataKey="recipeElementId" size="small">
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
                      <h4 className="mt-4 mb-2">
                        {t('priceCalculator.recipe.returnedIngredients')}
                      </h4>
                      <DataTable value={returnedIngredients} dataKey="recipeElementId" size="small">
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
                        <Column body={unreintegrateToggleTemplate} style={{ width: '3rem' }} />
                      </DataTable>
                    </>
                  )}

                  {additionalCosts.length > 0 && (
                    <>
                      <h4 className="mt-4 mb-2">{t('priceCalculator.recipe.additionalCosts')}</h4>
                      <DataTable value={additionalCosts} dataKey="id" size="small">
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

                  <div className="pt-3">{totalFooter(leftTotal)}</div>
                </div>

                <div className="col-6 flex flex-column">
                  <h4 className="mt-0 mb-2">{t('priceCalculator.recipe.products')}</h4>
                  <DataTable value={products} dataKey="recipeElementId" size="small">
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
                    {showReintegrateControls && (
                      <Column body={reintegrateToggleTemplate} style={{ width: '3rem' }} />
                    )}
                  </DataTable>

                  {/* The products total belongs with the rows it sums, not
                      pinned to the bottom of the pane — Bonuses and Waste sit
                      below it and describe the craft rather than its price. */}
                  <div className="pt-3 mb-2">{totalFooter(productsTotal)}</div>

                  <div className="flex flex-wrap gap-3">
                    {resolvedMods && resolvedMods.bonuses.length > 0 && (
                      <div className="flex-1">
                        <AppliedBonuses bonuses={resolvedMods.bonuses} />
                      </div>
                    )}

                    {garbage && (
                      <div className="flex-1">
                        <GarbageOutputTable totals={garbage.totals} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabPanel>
            <TabPanel header={t('priceCalculator.recipe.tabUsedIn')}>
              <UsedInRecipesTable
                rows={usedInRows}
                emptyMessages={{
                  mine: t('priceCalculator.recipe.usedInEmpty'),
                  other: t('priceCalculator.recipe.usedInEmptyOther'),
                  all: t('priceCalculator.recipe.usedInEmptyAll'),
                }}
                onOpenRecipe={onOpenRecipe ?? (() => {})}
              />
            </TabPanel>
            <TabPanel header={t('priceCalculator.recipe.tabDependencyGraph')}>
              <RecipeDependencyGraph
                target={{ type: 'recipe', recipeId }}
                buildId={buildId}
                datasetId={datasetId}
                onOpenRecipe={onOpenRecipe}
                onOpenMaterial={onOpenMaterial}
              />
            </TabPanel>
            {/* Conditionally present, so the tab COUNT varies by recipe. Safe
                because the effect above resets `activeTabIndex` to 0 on every
                recipe change — without that, switching from a recipe that has
                this tab to one that doesn't would leave the index dangling past
                the end. */}
            {garbage && (
              <TabPanel header={t('priceCalculator.recipe.tabWaste')}>
                <GarbageBreakdownTab rows={garbage.rows} totals={garbage.totals} />
              </TabPanel>
            )}
          </TabView>
        </div>
      </Dialog>
      {isCustomRecipe && (
        <CustomRecipeFormDialog
          visible={editFormVisible}
          onHide={() => setEditFormVisible(false)}
          datasetId={datasetId}
          recipeId={recipeId}
        />
      )}
    </>
  )
}
