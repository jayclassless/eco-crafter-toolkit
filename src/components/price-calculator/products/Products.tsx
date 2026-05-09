import { Button } from 'primereact/button'
import { memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DebouncedSearchInput } from '@/components/common/DebouncedSearchInput'
import { PriceModeButton } from '@/components/common/PriceModeButton'
import { RecipeIcon } from '@/components/common/RecipeIcon'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { usePriceManagement } from '@/hooks/use-price-management'
import { type PriceSignal } from '@/hooks/use-prices-signal'
import {
  buildMarginOptions,
  buildProductGroups,
  buildTagIdsByItemId,
  findDefaultMarginId,
  type Product,
  type ProductGroup,
} from '@/hooks/use-products'
import { useRecipeManagement } from '@/hooks/use-recipe-management'
import { useSettings } from '@/hooks/use-settings'
import {
  arrayEquals,
  mapEquals,
  setEquals,
  shallowEquals,
  useStableContent,
} from '@/hooks/use-stable-content'
import {
  useCellInTableRevision,
  useStoreRevision,
  useTableRowIdsRevision,
} from '@/hooks/use-store-revision'
import { generateId } from '@/lib/ids'
import { useStores } from '@/stores/providers'
import type { PriceMode } from '@/types/solver'

import { MaterialDialog } from '../materials/MaterialDialog'
import { AddRecipeDialog } from './AddRecipeDialog'
import { buildProductRows } from './build-product-rows'
import { ItemCostCell } from './ItemCostCell'
import { ItemSaleCell } from './ItemSaleCell'
import { MarginCell } from './MarginCell'
import { MirrorChildCheckbox } from './MirrorChildCheckbox'
import { ParentFavoriteStar } from './ParentFavoriteStar'
import { ProductParentName } from './ProductParentName'
import { ProductsDataTable } from './ProductsDataTable'
import { RecipeCostCell } from './RecipeCostCell'
import { RecipeDialog } from './RecipeDialog'
import { RecipeFavoriteStar } from './RecipeFavoriteStar'
import { RecipeFilterButton, type TagFilterOption } from './RecipeFilterButton'
import { RowActionsMenu } from './RowActionsMenu'
import type { Row } from './types'

// Heavy tables that feed `buildProductGroups`. A change to any of these
// invalidates the group view-model, which indexes the game-data store's
// `recipeElements` end-to-end (~300ms on a full dataset). `userMargins` is
// deliberately NOT here — it only affects dropdown labels + default-id
// lookup and is tracked on its own revision below so editing a margin name
// doesn't trigger the expensive group rebuild.
//
// `userPrices` is tracked on a separate row-ids-only revision below —
// `buildProductGroups` only reads `userPriceId` (a stable row id), so a
// price cell edit doesn't change the view-model. Without that split, every
// keystroke in a material price cell rebuilt groups and re-rendered the
// Products DataTable (~9s with 225 user-recipes).
const GROUPS_BUILD_TABLES = ['userRecipes', 'userRecipeMargins', 'userProductMargins'] as const

const USER_PRICES_TABLE = ['userPrices'] as const

const MARGINS_BUILD_TABLES = ['userMargins'] as const

// Filter-state tables. These don't affect the group view-model — only which
// rows get shown — so they're tracked on a separate revision counter so a
// filter toggle doesn't rebuild groups.
const FILTER_BUILD_TABLES = [
  'userSettings',
  'userSkills',
  'userTalents',
  'hiddenSkills',
  'hiddenCraftingTables',
  'hiddenTags',
] as const

// Product mode picker omits 'manual' — users override product prices from
// the Materials list, not the Products panel.
const PRODUCT_MODE_ORDER: PriceMode[] = ['min', 'max', 'avg', 'mirror']

// Module-level sentinels: when `onlyLevelAccessible` is off, the level/talent
// gates in `childVisible` are bypassed, so we hand it these stable empty
// containers instead of reading the build store. Level / talent edits then
// produce no observable filter change → `childVisible` keeps its identity →
// `rows` keeps its identity → the Products DataTable doesn't re-render its
// 500+ rows on a single skill-level click.
const EMPTY_LEVEL_MAP: Map<string, number> = new Map()
const EMPTY_TALENT_SET: Set<string> = new Set()
const EMPTY_FAVORITE_SET: Set<string> = new Set()

// `buildProductGroups` produces a new array of new objects on every
// invocation, even when the underlying data hasn't meaningfully changed.
// Without a content comparison, a userPrices row add (which bumps
// `userPricesRowIdsRev` and can affect at most one group's `userPriceId`)
// forces a new `groups` ref → new `rows` ref → full DataTable re-render of
// ~229 rows. The comparator below walks parents + children by scalar
// fields, letting `useStableContent` preserve the prior reference when
// nothing visible changed.
function productEquals(a: Product, b: Product): boolean {
  return (
    a.userRecipeId === b.userRecipeId &&
    a.recipeId === b.recipeId &&
    a.recipeName === b.recipeName &&
    a.skillId === b.skillId &&
    a.skillName === b.skillName &&
    a.skillRawName === b.skillRawName &&
    a.craftingTableId === b.craftingTableId &&
    a.requiredSkillLevel === b.requiredSkillLevel &&
    a.primaryProductRawName === b.primaryProductRawName &&
    a.recipePrimaryProductRawName === b.recipePrimaryProductRawName &&
    a.primaryProductId === b.primaryProductId &&
    a.primaryProductName === b.primaryProductName &&
    a.userPriceId === b.userPriceId &&
    a.userMarginId === b.userMarginId &&
    arrayEquals(a.productItemIds, b.productItemIds, (x, y) => x === y) &&
    arrayEquals(a.unlockingTalentIds, b.unlockingTalentIds, (x, y) => x === y)
  )
}

function groupEquals(a: ProductGroup, b: ProductGroup): boolean {
  if (a.familyName !== b.familyName) return false
  if (a.parent === null) {
    if (b.parent !== null) return false
  } else {
    if (b.parent === null) return false
    if (!shallowEquals(a.parent, b.parent)) return false
  }
  return arrayEquals(a.children, b.children, productEquals)
}

function groupsEqual(a: ProductGroup[], b: ProductGroup[]): boolean {
  return arrayEquals(a, b, groupEquals)
}

interface Props {
  buildId: string
  datasetId: string
  priceSignal: PriceSignal
}

function ProductsImpl({ buildId, datasetId, priceSignal }: Props) {
  const { t } = useTranslation()
  const { gameDataStore, buildStore } = useStores()
  const { getName } = useLocalizedName(datasetId)
  const recipeMgmt = useRecipeManagement(buildId)
  const priceMgmt = usePriceManagement(buildId)
  const settingsMgmt = useSettings(buildId)

  const groupsRev = useStoreRevision(buildStore, GROUPS_BUILD_TABLES)
  const userPricesRowIdsRev = useTableRowIdsRevision(buildStore, USER_PRICES_TABLE)
  // `userPrices.isOverride` flips when the user moves an item between
  // Products and Materials. The flip happens on an existing row's cell, not
  // a row add/remove, so neither `groupsRev` nor `userPricesRowIdsRev` would
  // catch it. Subscribe to that one cell across all rows.
  const isOverrideRev = useCellInTableRevision(buildStore, 'userPrices', 'isOverride')
  const marginsRev = useStoreRevision(buildStore, MARGINS_BUILD_TABLES)
  const filterRev = useStoreRevision(buildStore, FILTER_BUILD_TABLES)
  // userRecipes.favorite gates the showOnlyFavorites filter. Tracked here on
  // its own column-level revision so favorite toggles bump only `filterRaw`
  // (and `childVisible` via the resulting Set) — they don't invalidate the
  // expensive `buildProductGroups` view-model that GROUPS_BUILD_TABLES feeds.
  const favoriteCellRev = useCellInTableRevision(buildStore, 'userRecipes', 'favorite')

  const rawGroups = useMemo(
    () => buildProductGroups(buildStore, gameDataStore, buildId, getName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildStore, gameDataStore, buildId, getName, groupsRev, userPricesRowIdsRev, isOverrideRev]
  )
  // Preserve reference when content is semantically unchanged so downstream
  // memos (`rows`, `ProductsDataTable`) can bail out.
  const groups = useStableContent(rawGroups, groupsEqual)

  const { margins, defaultMarginId } = useMemo(
    () => ({
      margins: buildMarginOptions(buildStore, buildId),
      defaultMarginId: findDefaultMarginId(buildStore, buildId),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildStore, buildId, marginsRev]
  )

  // The filter cascade rebuilds whenever any FILTER_BUILD_TABLES row changes
  // (most often a userSkills.level cell edit). The Map/Set outputs below are
  // run through `useStableContent` so unchanged contents preserve identity —
  // that lets `childVisible` and `rows` bail out via dep equality, avoiding a
  // full re-render of the ~700-row Products DataTable on every level/talent
  // edit.
  const filterRaw = useMemo(() => {
    let showUnskilled = true
    let showPartsFlag = true
    let showUntaggedFlag = true
    let levelOnly = false
    let onlyFavorites = false
    for (const rowId of buildStore.getRowIds('userSettings')) {
      const row = buildStore.getRow('userSettings', rowId)
      if (row.buildId !== buildId) continue
      showUnskilled = row.showUnskilledRecipes as boolean
      showPartsFlag = row.showParts as boolean
      showUntaggedFlag = row.showUntagged as boolean
      levelOnly = row.onlyLevelAccessible as boolean
      onlyFavorites = row.showOnlyFavorites as boolean
      break
    }
    // Skill levels and active talents only feed `childVisible` when
    // `onlyLevelAccessible` is on. Skip the scans (and the resulting Map/Set
    // identity churn) when the flag is off — the empty sentinels are
    // referentially stable across renders.
    const skillLevels = levelOnly
      ? (() => {
          const m = new Map<string, number>()
          for (const rowId of buildStore.getRowIds('userSkills')) {
            const row = buildStore.getRow('userSkills', rowId)
            if (row.buildId !== buildId) continue
            m.set(row.skillId as string, row.level as number)
          }
          return m
        })()
      : EMPTY_LEVEL_MAP
    // Unlock talents are always non-levelable (BonusEffectOverride), so the
    // `enabled` flag alone is the activation signal.
    const activeTalents = levelOnly
      ? (() => {
          const s = new Set<string>()
          for (const rowId of buildStore.getRowIds('userTalents')) {
            const row = buildStore.getRow('userTalents', rowId)
            if (row.buildId !== buildId) continue
            if (row.enabled) s.add(row.talentId as string)
          }
          return s
        })()
      : EMPTY_TALENT_SET
    const hidden = new Set<string>()
    for (const rowId of buildStore.getRowIds('hiddenSkills')) {
      const row = buildStore.getRow('hiddenSkills', rowId)
      if (row.buildId !== buildId) continue
      hidden.add(row.skillId as string)
    }
    const hiddenTables = new Set<string>()
    for (const rowId of buildStore.getRowIds('hiddenCraftingTables')) {
      const row = buildStore.getRow('hiddenCraftingTables', rowId)
      if (row.buildId !== buildId) continue
      hiddenTables.add(row.craftingTableId as string)
    }
    const hiddenTagSet = new Set<string>()
    for (const rowId of buildStore.getRowIds('hiddenTags')) {
      const row = buildStore.getRow('hiddenTags', rowId)
      if (row.buildId !== buildId) continue
      hiddenTagSet.add(row.tagId as string)
    }
    // Skip the userRecipes scan when the favorites filter is off — the empty
    // sentinel is referentially stable so `childVisible` keeps its identity
    // across favorite-cell toggles when not filtering.
    const favoriteUserRecipeIds = onlyFavorites
      ? (() => {
          const s = new Set<string>()
          for (const rowId of buildStore.getRowIds('userRecipes')) {
            const row = buildStore.getRow('userRecipes', rowId)
            if (row.buildId !== buildId) continue
            if (row.favorite) s.add(rowId)
          }
          return s
        })()
      : EMPTY_FAVORITE_SET
    return {
      showUnskilledRecipes: showUnskilled,
      showParts: showPartsFlag,
      showUntagged: showUntaggedFlag,
      onlyLevelAccessible: levelOnly,
      showOnlyFavorites: onlyFavorites,
      userSkillLevels: skillLevels,
      activeTalentIds: activeTalents,
      hiddenSkills: hidden,
      hiddenCraftingTables: hiddenTables,
      hiddenTags: hiddenTagSet,
      favoriteUserRecipeIds,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildStore, buildId, filterRev, favoriteCellRev])

  const { showUnskilledRecipes, showParts, showUntagged, onlyLevelAccessible, showOnlyFavorites } =
    filterRaw
  const userSkillLevels = useStableContent(filterRaw.userSkillLevels, mapEquals)
  const activeTalentIds = useStableContent(filterRaw.activeTalentIds, setEquals)
  const hiddenSkills = useStableContent(filterRaw.hiddenSkills, setEquals)
  const hiddenCraftingTables = useStableContent(filterRaw.hiddenCraftingTables, setEquals)
  const hiddenTags = useStableContent(filterRaw.hiddenTags, setEquals)
  const favoriteUserRecipeIds = useStableContent(filterRaw.favoriteUserRecipeIds, setEquals)

  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [addDialogVisible, setAddDialogVisible] = useState(false)
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null)
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null)

  // Every child's recipeId (flat children included) — used to prevent
  // duplicate adds in AddRecipeDialog.
  const existingRecipeIdSet = useMemo(() => {
    const s = new Set<string>()
    for (const g of groups) for (const c of g.children) s.add(c.recipeId)
    return s
  }, [groups])

  // All skill IDs in the build (stable set for the filter overlay).
  // Empty IDs (unskilled recipes) are governed by the Unskilled checkbox instead.
  const skillOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const g of groups) for (const c of g.children) if (c.skillId) ids.add(c.skillId)
    const opts = [...ids].map((id) => ({ id, name: getName('skill', id) || id }))
    opts.sort((a, b) => a.name.localeCompare(b.name))
    return opts
  }, [groups, getName])

  const craftingTableOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const g of groups)
      for (const c of g.children) if (c.craftingTableId) ids.add(c.craftingTableId)
    const opts = [...ids].map((id) => ({ id, name: getName('craftingTable', id) || id }))
    opts.sort((a, b) => a.name.localeCompare(b.name))
    return opts
  }, [groups, getName])

  // Tag/part index, rebuilt whenever the group view-model rebuilds. The
  // gameDataStore is effectively immutable after dataset import, so we piggy-
  // back on `groups` for dependency tracking — the same pattern the other
  // option lists above use.
  const tagIdsByItemId = useMemo(
    () => buildTagIdsByItemId(gameDataStore),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameDataStore, groups]
  )

  const tagOptions = useMemo<TagFilterOption[]>(() => {
    const ids = new Set<string>()
    let anyPart = false
    for (const g of groups) {
      for (const c of g.children) {
        const tids = tagIdsByItemId.get(c.primaryProductId)
        if (tids) for (const tid of tids) ids.add(tid)
        if (!anyPart) {
          const row = gameDataStore.getRow('items', c.primaryProductId)
          if (row?.isPart) anyPart = true
        }
      }
    }
    const opts: TagFilterOption[] = [...ids].map((id) => ({
      id,
      name: getName('item', id) || id,
      kind: 'tag',
    }))
    if (anyPart) {
      opts.push({
        id: '__part__',
        name: t('priceCalculator.products.recipeFilter.part'),
        kind: 'part',
      })
    }
    opts.sort((a, b) => a.name.localeCompare(b.name))
    return opts
  }, [groups, gameDataStore, tagIdsByItemId, getName, t])

  const childVisible = useCallback(
    (c: Product): boolean => {
      if (showOnlyFavorites && !favoriteUserRecipeIds.has(c.userRecipeId)) return false
      if (!showUnskilledRecipes && !c.skillId) return false
      if (onlyLevelAccessible && c.skillId) {
        const level = userSkillLevels.get(c.skillId) ?? 0
        if (c.requiredSkillLevel > level) return false
        if (
          c.unlockingTalentIds.length > 0 &&
          !c.unlockingTalentIds.some((id) => activeTalentIds.has(id))
        ) {
          return false
        }
      }
      if (hiddenSkills.has(c.skillId)) return false
      if (hiddenCraftingTables.has(c.craftingTableId)) return false
      const tags = tagIdsByItemId.get(c.primaryProductId)
      const isPart = gameDataStore.getRow('items', c.primaryProductId)?.isPart === true
      let anyChecked = false
      if (tags && tags.length > 0) {
        for (const tid of tags) {
          if (!hiddenTags.has(tid)) {
            anyChecked = true
            break
          }
        }
      } else if (showUntagged) {
        anyChecked = true
      }
      if (!anyChecked && isPart && showParts) anyChecked = true
      if (!anyChecked) return false
      return true
    },
    [
      showOnlyFavorites,
      favoriteUserRecipeIds,
      showUnskilledRecipes,
      onlyLevelAccessible,
      userSkillLevels,
      activeTalentIds,
      hiddenSkills,
      hiddenCraftingTables,
      hiddenTags,
      showParts,
      showUntagged,
      tagIdsByItemId,
      gameDataStore,
    ]
  )

  const rows = useMemo<Row[]>(
    () => buildProductRows(groups, debouncedSearch, childVisible),
    [groups, debouncedSearch, childVisible]
  )

  const productRowCount = useMemo(
    () => rows.filter((r) => r.kind === 'parent' || r.kind === 'flat').length,
    [rows]
  )

  const setRecipeMargin = recipeMgmt.setRecipeMargin
  const setProductMargin = recipeMgmt.setProductMargin
  const removeRecipe = recipeMgmt.removeRecipe
  const setRecipeFavorite = recipeMgmt.setRecipeFavorite
  const setRecipesFavorite = recipeMgmt.setRecipesFavorite
  const setPriceMode = priceMgmt.setPriceMode
  const setPrimaryItem = priceMgmt.setPrimaryItem
  const setOverrideAsMaterial = priceMgmt.setOverrideAsMaterial

  const handleRecipeMarginChange = useCallback(
    (userRecipeId: string, marginId: string) => setRecipeMargin(userRecipeId, marginId),
    [setRecipeMargin]
  )
  const handleProductMarginChange = useCallback(
    (productId: string, marginId: string) => setProductMargin(productId, marginId),
    [setProductMargin]
  )
  const handleSelectMode = useCallback(
    (productId: string, mode: PriceMode, userPriceId: string) =>
      setPriceMode(productId, mode, userPriceId),
    [setPriceMode]
  )
  const handleSelectPrimary = useCallback(
    (productId: string, childRecipeId: string, userPriceId: string) =>
      setPrimaryItem(productId, childRecipeId, userPriceId),
    [setPrimaryItem]
  )
  const handleMoveToMaterials = useCallback(
    (productId: string, userPriceId: string) =>
      setOverrideAsMaterial(productId, true, userPriceId || undefined),
    [setOverrideAsMaterial]
  )
  const handleToggleFavorite = useCallback(
    (userRecipeId: string, favorite: boolean) => setRecipeFavorite(userRecipeId, favorite),
    [setRecipeFavorite]
  )
  const handleToggleAllFavorites = useCallback(
    (userRecipeIds: readonly string[], favorite: boolean) =>
      setRecipesFavorite(userRecipeIds, favorite),
    [setRecipesFavorite]
  )

  const handleToggleSkill = useCallback(
    (skillId: string) => {
      let existingId: string | null = null
      for (const rowId of buildStore.getRowIds('hiddenSkills')) {
        const row = buildStore.getRow('hiddenSkills', rowId)
        if (row.buildId === buildId && row.skillId === skillId) {
          existingId = rowId
          break
        }
      }
      if (existingId) {
        buildStore.delRow('hiddenSkills', existingId)
      } else {
        const id = generateId()
        buildStore.setRow('hiddenSkills', id, { buildId, skillId })
      }
    },
    [buildId, buildStore]
  )

  const handleSetAllSkills = useCallback(
    (hideAll: boolean) => {
      buildStore.transaction(() => {
        for (const rowId of buildStore.getRowIds('hiddenSkills')) {
          const row = buildStore.getRow('hiddenSkills', rowId)
          if (row.buildId === buildId) buildStore.delRow('hiddenSkills', rowId)
        }
        if (hideAll) {
          for (const opt of skillOptions) {
            const id = generateId()
            buildStore.setRow('hiddenSkills', id, { buildId, skillId: opt.id })
          }
        }
      })
      settingsMgmt.setSetting('showUnskilledRecipes', !hideAll)
    },
    [skillOptions, buildId, buildStore, settingsMgmt]
  )

  const handleToggleUnskilled = useCallback(
    () => settingsMgmt.setSetting('showUnskilledRecipes', !showUnskilledRecipes),
    [settingsMgmt, showUnskilledRecipes]
  )

  const handleToggleCraftingTable = useCallback(
    (id: string) => {
      let existingId: string | null = null
      for (const rowId of buildStore.getRowIds('hiddenCraftingTables')) {
        const row = buildStore.getRow('hiddenCraftingTables', rowId)
        if (row.buildId === buildId && row.craftingTableId === id) {
          existingId = rowId
          break
        }
      }
      if (existingId) {
        buildStore.delRow('hiddenCraftingTables', existingId)
      } else {
        const rowId = generateId()
        buildStore.setRow('hiddenCraftingTables', rowId, { buildId, craftingTableId: id })
      }
    },
    [buildId, buildStore]
  )

  const handleSetAllCraftingTables = useCallback(
    (hideAll: boolean) => {
      buildStore.transaction(() => {
        for (const rowId of buildStore.getRowIds('hiddenCraftingTables')) {
          const row = buildStore.getRow('hiddenCraftingTables', rowId)
          if (row.buildId === buildId) buildStore.delRow('hiddenCraftingTables', rowId)
        }
        if (hideAll) {
          for (const opt of craftingTableOptions) {
            const rowId = generateId()
            buildStore.setRow('hiddenCraftingTables', rowId, {
              buildId,
              craftingTableId: opt.id,
            })
          }
        }
      })
    },
    [buildId, buildStore, craftingTableOptions]
  )

  const handleToggleTag = useCallback(
    (tagId: string) => {
      let existingId: string | null = null
      for (const rowId of buildStore.getRowIds('hiddenTags')) {
        const row = buildStore.getRow('hiddenTags', rowId)
        if (row.buildId === buildId && row.tagId === tagId) {
          existingId = rowId
          break
        }
      }
      if (existingId) {
        buildStore.delRow('hiddenTags', existingId)
      } else {
        const rowId = generateId()
        buildStore.setRow('hiddenTags', rowId, { buildId, tagId })
      }
    },
    [buildId, buildStore]
  )

  const handleTogglePart = useCallback(
    () => settingsMgmt.setSetting('showParts', !showParts),
    [settingsMgmt, showParts]
  )

  const handleToggleUntagged = useCallback(
    () => settingsMgmt.setSetting('showUntagged', !showUntagged),
    [settingsMgmt, showUntagged]
  )

  const handleSetAllTags = useCallback(
    (hideAll: boolean) => {
      buildStore.transaction(() => {
        for (const rowId of buildStore.getRowIds('hiddenTags')) {
          const row = buildStore.getRow('hiddenTags', rowId)
          if (row.buildId === buildId) buildStore.delRow('hiddenTags', rowId)
        }
        if (hideAll) {
          for (const opt of tagOptions) {
            if (opt.kind !== 'tag') continue
            const rowId = generateId()
            buildStore.setRow('hiddenTags', rowId, { buildId, tagId: opt.id })
          }
        }
      })
      settingsMgmt.setSetting('showParts', !hideAll)
      settingsMgmt.setSetting('showUntagged', !hideAll)
    },
    [buildId, buildStore, tagOptions, settingsMgmt]
  )

  const nameTemplate = useCallback(
    (row: Row) => {
      if (row.kind === 'family') {
        return (
          <div className="flex align-items-center gap-2">
            <ParentFavoriteStar
              buildStore={buildStore}
              childUserRecipeIds={row.childUserRecipeIds}
              onToggleAll={handleToggleAllFavorites}
            />
            <span className="font-bold">{row.familyName}</span>
          </div>
        )
      }
      if (row.kind === 'parent') {
        return (
          <div
            className="flex align-items-center gap-2"
            style={row.inFamily ? { paddingLeft: '1.5rem' } : undefined}
          >
            <ParentFavoriteStar
              buildStore={buildStore}
              childUserRecipeIds={row.childUserRecipeIds}
              onToggleAll={handleToggleAllFavorites}
            />
            <ProductParentName
              parent={row.parent}
              userPriceId={row.parent.userPriceId}
              buildStore={buildStore}
              signal={priceSignal}
              onOpenRecipe={setSelectedRecipeId}
            />
          </div>
        )
      }
      if (row.kind === 'child') {
        const p = row.product
        return (
          <div
            className="flex align-items-center gap-2"
            style={{ paddingLeft: row.inFamily ? '3rem' : '1.5rem' }}
          >
            <RecipeFavoriteStar
              buildStore={buildStore}
              userRecipeId={p.userRecipeId}
              onToggle={handleToggleFavorite}
            />
            {(p.recipePrimaryProductRawName || p.recipeIsCustom) && (
              <RecipeIcon
                primaryProduct={{
                  name: p.recipePrimaryProductRawName,
                  isCustom: p.recipeIsCustom,
                }}
              />
            )}
            <Button
              label={p.recipeName}
              link
              className="p-0"
              pt={{ label: { style: { textAlign: 'left' } } }}
              onClick={() => setSelectedRecipeId(p.recipeId)}
            />
          </div>
        )
      }
      // flat
      const p = row.product
      return (
        <div
          className="flex align-items-center gap-2"
          style={row.inFamily ? { paddingLeft: '1.5rem' } : undefined}
        >
          <RecipeFavoriteStar
            buildStore={buildStore}
            userRecipeId={p.userRecipeId}
            onToggle={handleToggleFavorite}
          />
          {(p.primaryProductRawName || p.recipeIsCustom) && (
            <RecipeIcon
              primaryProduct={{ name: p.primaryProductRawName, isCustom: p.recipeIsCustom }}
            />
          )}
          <Button
            label={p.primaryProductName}
            link
            className="p-0"
            pt={{ label: { style: { textAlign: 'left' } } }}
            onClick={() => setSelectedRecipeId(p.recipeId)}
          />
        </div>
      )
    },
    [buildStore, priceSignal, handleToggleFavorite, handleToggleAllFavorites]
  )

  const costTemplate = useCallback(
    (row: Row) => {
      if (row.kind === 'family') return null
      if (row.kind === 'parent') {
        return (
          <div className="flex align-items-center justify-content-end gap-1">
            <ItemCostCell signal={priceSignal} itemId={row.parent.primaryProductId} />
            <PriceModeButton
              entityId={row.parent.primaryProductId}
              userPriceId={row.parent.userPriceId}
              buildStore={buildStore}
              modes={PRODUCT_MODE_ORDER}
              inputIdPrefix="pmode"
              onSelectMode={handleSelectMode}
            />
          </div>
        )
      }
      if (row.kind === 'child') {
        return (
          <div className="flex align-items-center justify-content-end gap-1">
            <RecipeCostCell
              signal={priceSignal}
              recipeId={`${row.product.recipeId}::${row.product.primaryProductId}`}
            />
            <MirrorChildCheckbox
              parentProductId={row.parent.primaryProductId}
              parentUserPriceId={row.parent.userPriceId}
              childRecipeId={row.product.recipeId}
              buildStore={buildStore}
              onSelect={handleSelectPrimary}
            />
          </div>
        )
      }
      return <ItemCostCell signal={priceSignal} itemId={row.product.primaryProductId} />
    },
    [priceSignal, buildStore, handleSelectMode, handleSelectPrimary]
  )

  // Options + defaultMarginId flow to MarginCell through context, not props.
  // Props would be fed via the DataTable Column body template, which isn't
  // re-invoked when BodyCell's memo bails — so margin-name edits wouldn't
  // reach the dropdown options. Context updates propagate to consumers
  // regardless of parent memoization.

  const marginTemplate = useCallback(
    (row: Row) => {
      if (row.kind === 'family') return null
      if (row.kind === 'parent') {
        return (
          <MarginCell
            value={row.parent.productUserMarginId}
            rowId={row.parent.primaryProductId}
            onChange={handleProductMarginChange}
          />
        )
      }
      if (row.kind === 'child') return null
      return (
        <MarginCell
          value={row.product.userMarginId}
          rowId={row.product.userRecipeId}
          onChange={handleRecipeMarginChange}
        />
      )
    },
    [handleProductMarginChange, handleRecipeMarginChange]
  )

  const saleTemplate = useCallback(
    (row: Row) => {
      if (row.kind === 'family') return null
      if (row.kind === 'parent') {
        return <ItemSaleCell signal={priceSignal} itemId={row.parent.primaryProductId} />
      }
      if (row.kind === 'child') return null
      return <ItemSaleCell signal={priceSignal} itemId={row.product.primaryProductId} />
    },
    [priceSignal]
  )

  const actionsTemplate = useCallback(
    (row: Row) => {
      if (row.kind === 'family') return null
      if (row.kind === 'parent') {
        return (
          <RowActionsMenu
            onMoveToMaterials={() =>
              handleMoveToMaterials(row.parent.primaryProductId, row.parent.userPriceId)
            }
          />
        )
      }
      if (row.kind === 'child') {
        return <RowActionsMenu onDeleteRecipe={() => removeRecipe(row.product.userRecipeId)} />
      }
      const p = row.product
      return (
        <RowActionsMenu
          onMoveToMaterials={() => handleMoveToMaterials(p.primaryProductId, p.userPriceId)}
          onDeleteRecipe={() => removeRecipe(p.userRecipeId)}
        />
      )
    },
    [removeRecipe, handleMoveToMaterials]
  )

  return (
    <div className="flex flex-column flex-1" style={{ minHeight: 0 }}>
      <div className="flex align-items-center gap-2 mb-2">
        <h3 className="m-0">{t('priceCalculator.products.title', { count: productRowCount })}</h3>
        <DebouncedSearchInput
          onDebouncedChange={setDebouncedSearch}
          placeholder={t('priceCalculator.products.search')}
          className="flex-1"
        />
        <RecipeFilterButton
          skillOptions={skillOptions}
          hiddenSkills={hiddenSkills}
          showUnskilled={showUnskilledRecipes}
          onToggleSkill={handleToggleSkill}
          onToggleUnskilled={handleToggleUnskilled}
          onSetAllSkills={handleSetAllSkills}
          craftingTableOptions={craftingTableOptions}
          hiddenCraftingTables={hiddenCraftingTables}
          onToggleCraftingTable={handleToggleCraftingTable}
          onSetAllCraftingTables={handleSetAllCraftingTables}
          tagOptions={tagOptions}
          hiddenTags={hiddenTags}
          showParts={showParts}
          showUntagged={showUntagged}
          onToggleTag={handleToggleTag}
          onTogglePart={handleTogglePart}
          onToggleUntagged={handleToggleUntagged}
          onSetAllTags={handleSetAllTags}
          onlyLevelAccessible={onlyLevelAccessible}
          onToggleOnlyLevelAccessible={() =>
            settingsMgmt.setSetting('onlyLevelAccessible', !onlyLevelAccessible)
          }
        />
        <Button
          icon={showOnlyFavorites ? 'pi pi-star-fill' : 'pi pi-star'}
          text={!showOnlyFavorites}
          size="small"
          aria-label={
            showOnlyFavorites
              ? t('priceCalculator.products.favoritesFilter.toggleOff')
              : t('priceCalculator.products.favoritesFilter.toggleOn')
          }
          tooltip={
            showOnlyFavorites
              ? t('priceCalculator.products.favoritesFilter.toggleOff')
              : t('priceCalculator.products.favoritesFilter.toggleOn')
          }
          tooltipOptions={{ position: 'bottom' }}
          onClick={() => settingsMgmt.setSetting('showOnlyFavorites', !showOnlyFavorites)}
        />
        <Button
          icon="pi pi-plus"
          text
          size="small"
          aria-label={t('priceCalculator.addRecipeDialog.openButton')}
          tooltip={t('priceCalculator.addRecipeDialog.openButton')}
          tooltipOptions={{ position: 'bottom' }}
          onClick={() => setAddDialogVisible(true)}
        />
      </div>
      <AddRecipeDialog
        visible={addDialogVisible}
        onHide={() => setAddDialogVisible(false)}
        buildId={buildId}
        datasetId={datasetId}
        existingRecipeIds={existingRecipeIdSet}
      />
      <RecipeDialog
        recipeId={selectedRecipeId}
        buildId={buildId}
        datasetId={datasetId}
        priceSignal={priceSignal}
        onHide={() => setSelectedRecipeId(null)}
        onOpenMaterial={(id) => {
          setSelectedRecipeId(null)
          setSelectedMaterialId(id)
        }}
        onOpenRecipe={(id) => setSelectedRecipeId(id)}
      />
      <MaterialDialog
        itemId={selectedMaterialId}
        buildId={buildId}
        datasetId={datasetId}
        onHide={() => setSelectedMaterialId(null)}
        onOpenRecipe={(id) => {
          setSelectedMaterialId(null)
          setSelectedRecipeId(id)
        }}
        onOpenMaterial={(id) => setSelectedMaterialId(id)}
      />
      <ProductsDataTable
        rows={rows}
        margins={margins}
        defaultMarginId={defaultMarginId}
        emptyMessage={t('priceCalculator.products.emptyMessage')}
        productHeader={t('priceCalculator.products.product')}
        costHeader={t('priceCalculator.products.costPrice')}
        marginHeader={t('priceCalculator.products.margin')}
        saleHeader={t('priceCalculator.products.salePrice')}
        nameTemplate={nameTemplate}
        costTemplate={costTemplate}
        marginTemplate={marginTemplate}
        saleTemplate={saleTemplate}
        actionsTemplate={actionsTemplate}
      />
    </div>
  )
}

export const Products = memo(ProductsImpl)
