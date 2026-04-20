import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
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
  findDefaultMarginId,
  type Product,
} from '@/hooks/use-products'
import { useRecipeManagement } from '@/hooks/use-recipe-management'
import { useSettings } from '@/hooks/use-settings'
import { useStoreRevision } from '@/hooks/use-store-revision'
import { generateId } from '@/lib/ids'
import { useStores } from '@/stores/providers'
import type { PriceMode } from '@/types/solver'

import { MaterialDialog } from '../materials/MaterialDialog'
import { AddRecipeDialog } from './AddRecipeDialog'
import { ItemCostCell } from './ItemCostCell'
import { ItemSaleCell } from './ItemSaleCell'
import { MarginCell, MarginOptionsContext } from './MarginCell'
import { MirrorChildCheckbox } from './MirrorChildCheckbox'
import { ProductParentName } from './ProductParentName'
import { RecipeCostCell } from './RecipeCostCell'
import { RecipeDialog } from './RecipeDialog'
import { RecipeFilterButton } from './RecipeFilterButton'
import type { Row } from './types'

// Heavy tables that feed `buildProductGroups`. A change to any of these
// invalidates the group view-model, which indexes the game-data store's
// `recipeElements` end-to-end (~300ms on a full dataset). `userMargins` is
// deliberately NOT here — it only affects dropdown labels + default-id
// lookup and is tracked on its own revision below so editing a margin name
// doesn't trigger the expensive group rebuild.
const GROUPS_BUILD_TABLES = [
  'userRecipes',
  'userRecipeMargins',
  'userProductMargins',
  'userPrices',
] as const

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
] as const

// Product mode picker omits 'manual' — users override product prices from
// the Materials list, not the Products panel.
const PRODUCT_MODE_ORDER: PriceMode[] = ['min', 'max', 'avg', 'mirror']

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
  const marginsRev = useStoreRevision(buildStore, MARGINS_BUILD_TABLES)
  const filterRev = useStoreRevision(buildStore, FILTER_BUILD_TABLES)

  const groups = useMemo(
    () => buildProductGroups(buildStore, gameDataStore, buildId, getName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildStore, gameDataStore, buildId, getName, groupsRev]
  )

  const { margins, defaultMarginId } = useMemo(
    () => ({
      margins: buildMarginOptions(buildStore, buildId),
      defaultMarginId: findDefaultMarginId(buildStore, buildId),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildStore, buildId, marginsRev]
  )

  const {
    showUnskilledRecipes,
    onlyLevelAccessible,
    userSkillLevels,
    activeTalentIds,
    hiddenSkills,
    hiddenCraftingTables,
  } = useMemo(() => {
    let showUnskilled = true
    let levelOnly = false
    for (const rowId of buildStore.getRowIds('userSettings')) {
      const row = buildStore.getRow('userSettings', rowId)
      if (row.buildId !== buildId) continue
      showUnskilled = row.showUnskilledRecipes as boolean
      levelOnly = row.onlyLevelAccessible as boolean
      break
    }
    const skillLevels = new Map<string, number>()
    for (const rowId of buildStore.getRowIds('userSkills')) {
      const row = buildStore.getRow('userSkills', rowId)
      if (row.buildId !== buildId) continue
      skillLevels.set(row.skillId as string, row.level as number)
    }
    // Unlock talents are always non-levelable (BonusEffectOverride), so the
    // `enabled` flag alone is the activation signal.
    const activeTalents = new Set<string>()
    for (const rowId of buildStore.getRowIds('userTalents')) {
      const row = buildStore.getRow('userTalents', rowId)
      if (row.buildId !== buildId) continue
      if (row.enabled) activeTalents.add(row.talentId as string)
    }
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
    return {
      showUnskilledRecipes: showUnskilled,
      onlyLevelAccessible: levelOnly,
      userSkillLevels: skillLevels,
      activeTalentIds: activeTalents,
      hiddenSkills: hidden,
      hiddenCraftingTables: hiddenTables,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildStore, buildId, filterRev])

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

  const childVisible = useCallback(
    (c: Product): boolean => {
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
      return true
    },
    [
      showUnskilledRecipes,
      onlyLevelAccessible,
      userSkillLevels,
      activeTalentIds,
      hiddenSkills,
      hiddenCraftingTables,
    ]
  )

  const rows = useMemo<Row[]>(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const out: Row[] = []
    for (const g of groups) {
      const matchesSearch = (c: Product, parentName: string) =>
        !q ||
        c.recipeName.toLowerCase().includes(q) ||
        c.primaryProductName.toLowerCase().includes(q) ||
        parentName.toLowerCase().includes(q)

      if (g.parent) {
        const parent = g.parent
        const visibleChildren = g.children.filter(
          (c) => childVisible(c) && matchesSearch(c, parent.primaryProductName)
        )
        if (visibleChildren.length === 0) continue
        out.push({
          kind: 'parent',
          rowKey: `parent::${parent.primaryProductId}`,
          parent,
          childCount: visibleChildren.length,
        })
        for (const c of visibleChildren) {
          out.push({
            kind: 'child',
            rowKey: `child::${parent.primaryProductId}::${c.userRecipeId}`,
            product: c,
            parent,
          })
        }
      } else {
        const c = g.children[0]
        if (!childVisible(c)) continue
        if (!matchesSearch(c, c.primaryProductName)) continue
        out.push({
          kind: 'flat',
          rowKey: `flat::${c.userRecipeId}::${c.primaryProductId}`,
          product: c,
        })
      }
    }
    return out
  }, [groups, debouncedSearch, childVisible])

  const productRowCount = useMemo(
    () => rows.filter((r) => r.kind === 'parent' || r.kind === 'flat').length,
    [rows]
  )

  const setRecipeMargin = recipeMgmt.setRecipeMargin
  const setProductMargin = recipeMgmt.setProductMargin
  const removeRecipe = recipeMgmt.removeRecipe
  const setPriceMode = priceMgmt.setPriceMode
  const setPrimaryItem = priceMgmt.setPrimaryItem

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

  const nameTemplate = useCallback(
    (row: Row) => {
      if (row.kind === 'parent') {
        return (
          <ProductParentName
            parent={row.parent}
            userPriceId={row.parent.userPriceId}
            buildStore={buildStore}
            signal={priceSignal}
            onOpenRecipe={setSelectedRecipeId}
          />
        )
      }
      if (row.kind === 'child') {
        const p = row.product
        return (
          <div className="flex align-items-center gap-2" style={{ paddingLeft: '1.5rem' }}>
            {p.recipePrimaryProductRawName && (
              <RecipeIcon primaryProduct={{ name: p.recipePrimaryProductRawName }} />
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
        <div className="flex align-items-center gap-2">
          {p.primaryProductRawName && (
            <RecipeIcon primaryProduct={{ name: p.primaryProductRawName }} />
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
    },
    [buildStore, priceSignal]
  )

  const costTemplate = useCallback(
    (row: Row) => {
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
  const marginContextValue = useMemo(
    () => ({ options: margins, defaultMarginId }),
    [margins, defaultMarginId]
  )

  const marginTemplate = useCallback(
    (row: Row) => {
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
      if (row.kind === 'parent') {
        return <ItemSaleCell signal={priceSignal} itemId={row.parent.primaryProductId} />
      }
      if (row.kind === 'child') return null
      return <ItemSaleCell signal={priceSignal} itemId={row.product.primaryProductId} />
    },
    [priceSignal]
  )

  const deleteTemplate = useCallback(
    (row: Row) => {
      if (row.kind === 'parent') return null
      const userRecipeId =
        row.kind === 'child' ? row.product.userRecipeId : row.product.userRecipeId
      return (
        <Button
          icon="pi pi-trash"
          severity="danger"
          text
          size="small"
          onClick={() => removeRecipe(userRecipeId)}
        />
      )
    },
    [removeRecipe]
  )

  return (
    <div className="flex flex-column flex-1" style={{ minHeight: 0 }}>
      <div className="flex align-items-center gap-2 mb-2">
        <h3 className="m-0">
          {t('priceCalculator.products.titleCount', { count: productRowCount })}
        </h3>
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
          onlyLevelAccessible={onlyLevelAccessible}
          onToggleOnlyLevelAccessible={() =>
            settingsMgmt.setSetting('onlyLevelAccessible', !onlyLevelAccessible)
          }
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
      />
      <MarginOptionsContext.Provider value={marginContextValue}>
        <DataTable
          value={rows}
          dataKey="rowKey"
          size="small"
          scrollable
          scrollHeight="flex"
          emptyMessage={t('priceCalculator.products.emptyMessage')}
        >
          <Column header={t('priceCalculator.products.product')} body={nameTemplate} />
          <Column
            header={t('priceCalculator.products.costPrice')}
            body={costTemplate}
            style={{ width: '5rem' }}
            headerClassName="p-align-right"
          />
          <Column
            header={t('priceCalculator.products.margin')}
            body={marginTemplate}
            style={{ width: '7rem' }}
          />
          <Column
            header={t('priceCalculator.products.salePrice')}
            body={saleTemplate}
            style={{ width: '5rem' }}
            headerClassName="p-align-right"
          />
          <Column body={deleteTemplate} style={{ width: '3rem' }} />
        </DataTable>
      </MarginOptionsContext.Provider>
    </div>
  )
}

export const Products = memo(ProductsImpl)
