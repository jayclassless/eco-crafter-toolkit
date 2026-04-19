import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { OverlayPanel } from 'primereact/overlaypanel'
import { RadioButton } from 'primereact/radiobutton'
import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Store } from 'tinybase'

import { DebouncedSearchInput } from '@/components/common/DebouncedSearchInput'
import { EcoIcon } from '@/components/common/EcoIcon'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { usePriceManagement } from '@/hooks/use-price-management'
import { usePriceCell, useRecipePriceCell, type PriceSignal } from '@/hooks/use-prices-signal'
import {
  buildMarginOptions,
  buildProductGroups,
  findDefaultMarginId,
  type Product,
  type ProductParent,
} from '@/hooks/use-products'
import { useRecipeManagement } from '@/hooks/use-recipe-management'
import { useSettings } from '@/hooks/use-settings'
import { useCellValue, useStoreRevision } from '@/hooks/use-store-revision'
import { generateId } from '@/lib/ids'
import { useStores } from '@/stores/providers'
import type { PriceMode } from '@/types/solver'

import { AddRecipeDialog } from './AddRecipeDialog'
import { RecipeDialog } from './RecipeDialog'

// Heavy tables that feed `buildProductGroups` + margin lookups. A change to
// any of these invalidates the group/margin view-model, which indexes the
// game-data store's `recipeElements` end-to-end (~300ms on a full dataset).
const GROUPS_BUILD_TABLES = [
  'userRecipes',
  'userRecipeMargins',
  'userProductMargins',
  'userMargins',
  'userPrices',
] as const

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

const MODE_ICON: Record<PriceMode, string> = {
  manual: 'pi pi-pencil',
  min: 'pi pi-sort-amount-down',
  max: 'pi pi-sort-amount-up',
  avg: 'pi pi-calculator',
  mirror: 'pi pi-link',
}

interface Props {
  buildId: string
  datasetId: string
  priceSignal: PriceSignal
}

// Item-keyed price cell — used for flat (single-recipe) rows and the
// aggregated parent price.
const ItemCostCell = memo(function ItemCostCell({
  signal,
  itemId,
}: {
  signal: PriceSignal
  itemId: string
}) {
  const value = usePriceCell(signal, itemId, 'costPrice')
  return <span className="text-right block">{value != null ? value.toFixed(2) : '-'}</span>
})

const ItemSaleCell = memo(function ItemSaleCell({
  signal,
  itemId,
}: {
  signal: PriceSignal
  itemId: string
}) {
  const value = usePriceCell(signal, itemId, 'salePrice')
  return <span className="text-right block">{value != null ? value.toFixed(2) : '-'}</span>
})

// Recipe-keyed price cell — used for child rows under a multi-recipe group
// so each child shows its own producer's cost.
const RecipeCostCell = memo(function RecipeCostCell({
  signal,
  recipeId,
}: {
  signal: PriceSignal
  recipeId: string
}) {
  const value = useRecipePriceCell(signal, recipeId, 'costPrice')
  return <span className="text-right block">{value != null ? value.toFixed(2) : '-'}</span>
})

interface MarginOption {
  id: string
  name: string
}

interface MarginCellProps {
  value: string
  rowId: string
  options: MarginOption[]
  onChange: (rowId: string, marginId: string) => void
}

// Native <select> is ~100× cheaper to mount/unmount than PrimeReact Dropdown.
const MarginCell = memo(function MarginCell({ value, rowId, options, onChange }: MarginCellProps) {
  return (
    <select
      className="p-inputtext p-inputtext-sm w-full"
      value={value || ''}
      onChange={(e) => onChange(rowId, e.target.value)}
    >
      <option value=""></option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  )
})

interface ProductModeButtonProps {
  productId: string
  userPriceId: string
  buildStore: Store
  onSelectMode: (productId: string, mode: PriceMode, userPriceId: string) => void
}

// Parent product mode button. Subscribes to the product's priceMode cell so
// mode edits re-render only this button, not the DataTable.
const ProductModeButton = memo(function ProductModeButton({
  productId,
  userPriceId,
  buildStore,
  onSelectMode,
}: ProductModeButtonProps) {
  const { t } = useTranslation()
  const op = useRef<OverlayPanel>(null)
  const stored = useCellValue<string>(buildStore, 'userPrices', userPriceId, 'priceMode')
  const mode: PriceMode = ((stored ?? 'min') as PriceMode) || 'min'
  const activeMode: PriceMode = mode === 'manual' ? 'min' : mode

  return (
    <>
      <Button
        icon={MODE_ICON[activeMode]}
        text
        size="small"
        aria-label={t('priceCalculator.materials.priceMode.label')}
        tooltip={t('priceCalculator.materials.priceMode.modeTooltip', {
          mode: t(`priceCalculator.materials.priceMode.${activeMode}`),
        })}
        tooltipOptions={{ position: 'top' }}
        onClick={(e) => op.current?.toggle(e)}
      />
      <OverlayPanel ref={op}>
        <div className="flex flex-column gap-2">
          {PRODUCT_MODE_ORDER.map((m) => {
            const inputId = `pmode-${userPriceId || productId}-${m}`
            return (
              <div key={m} className="flex align-items-center gap-2">
                <RadioButton
                  inputId={inputId}
                  checked={activeMode === m}
                  onChange={() => {
                    onSelectMode(productId, m, userPriceId)
                    op.current?.hide()
                  }}
                />
                <label htmlFor={inputId} className="text-sm cursor-pointer">
                  <i className={`${MODE_ICON[m]} mr-2`} />
                  {t(`priceCalculator.materials.priceMode.${m}`)}
                </label>
              </div>
            )
          })}
        </div>
      </OverlayPanel>
    </>
  )
})

interface ProductParentNameProps {
  parent: ProductParent
  userPriceId: string
  buildStore: Store
  signal: PriceSignal
  onOpenRecipe: (recipeId: string) => void
}

// Parent name cell. In avg mode — or when no price has resolved yet — the
// name is plain text (no single producer to route to). Otherwise it's a link
// that opens the winning recipe's dialog, with the winner read from the
// signal's recipeId snapshot.
const ProductParentName = memo(function ProductParentName({
  parent,
  userPriceId,
  buildStore,
  signal,
  onOpenRecipe,
}: ProductParentNameProps) {
  const stored = useCellValue<string>(buildStore, 'userPrices', userPriceId, 'priceMode')
  const mode: PriceMode = ((stored ?? 'min') as PriceMode) || 'min'
  const cost = usePriceCell(signal, parent.primaryProductId, 'costPrice')

  const icon = parent.primaryProductRawName ? (
    <EcoIcon name={parent.primaryProductRawName} size={20} />
  ) : null

  if (mode === 'avg' || cost === null) {
    return (
      <div className="flex align-items-center gap-2">
        {icon}
        <span className="font-bold">{parent.primaryProductName}</span>
      </div>
    )
  }

  return (
    <div className="flex align-items-center gap-2">
      {icon}
      <Button
        label={parent.primaryProductName}
        link
        className="p-0 font-bold"
        onClick={() => {
          const winner = signal.getRecipeIdFor(parent.primaryProductId)
          if (winner) onOpenRecipe(winner)
        }}
      />
    </div>
  )
})

interface MirrorChildCheckboxProps {
  parentProductId: string
  parentUserPriceId: string
  childRecipeId: string
  buildStore: Store
  onSelect: (parentProductId: string, childRecipeId: string, parentUserPriceId: string) => void
}

const MirrorChildCheckbox = memo(function MirrorChildCheckbox({
  parentProductId,
  parentUserPriceId,
  childRecipeId,
  buildStore,
  onSelect,
}: MirrorChildCheckboxProps) {
  const storedMode = useCellValue<string>(buildStore, 'userPrices', parentUserPriceId, 'priceMode')
  const mode: PriceMode = ((storedMode ?? 'min') as PriceMode) || 'min'
  const primary = useCellValue<string>(buildStore, 'userPrices', parentUserPriceId, 'primaryItemId')

  if (mode !== 'mirror') return null
  return (
    <Checkbox
      checked={primary === childRecipeId}
      onChange={() => onSelect(parentProductId, childRecipeId, parentUserPriceId)}
    />
  )
})

interface RecipeFilterButtonProps {
  skillOptions: { id: string; name: string }[]
  hiddenSkills: Set<string>
  showUnskilled: boolean
  onToggleSkill: (id: string) => void
  onToggleUnskilled: () => void
  onSetAllSkills: (hideAll: boolean) => void
  craftingTableOptions: { id: string; name: string }[]
  hiddenCraftingTables: Set<string>
  onToggleCraftingTable: (id: string) => void
  onSetAllCraftingTables: (hideAll: boolean) => void
  onlyLevelAccessible: boolean
  onToggleOnlyLevelAccessible: () => void
}

const RecipeFilterButton = memo(function RecipeFilterButton({
  skillOptions,
  hiddenSkills,
  showUnskilled,
  onToggleSkill,
  onToggleUnskilled,
  onSetAllSkills,
  craftingTableOptions,
  hiddenCraftingTables,
  onToggleCraftingTable,
  onSetAllCraftingTables,
  onlyLevelAccessible,
  onToggleOnlyLevelAccessible,
}: RecipeFilterButtonProps) {
  const { t } = useTranslation()
  const op = useRef<OverlayPanel>(null)
  const isAnyHidden =
    hiddenSkills.size > 0 || !showUnskilled || hiddenCraftingTables.size > 0 || onlyLevelAccessible
  return (
    <>
      <Button
        icon={isAnyHidden ? 'pi pi-filter-fill' : 'pi pi-filter'}
        text={!isAnyHidden}
        size="small"
        aria-label={t('priceCalculator.products.recipeFilter.label')}
        tooltip={t('priceCalculator.products.recipeFilter.tooltip')}
        tooltipOptions={{ position: 'bottom' }}
        onClick={(e) => op.current?.toggle(e)}
      />
      <OverlayPanel ref={op}>
        <div
          className="flex flex-column gap-3"
          style={{ minWidth: '22rem' }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex gap-4">
            <div className="flex flex-column gap-2 flex-1">
              <div className="font-semibold text-sm">
                {t('priceCalculator.products.recipeFilter.skillSection')}
              </div>
              <div className="flex gap-2">
                <Button
                  label={t('priceCalculator.products.recipeFilter.all')}
                  size="small"
                  text
                  onClick={() => onSetAllSkills(false)}
                />
                <Button
                  label={t('priceCalculator.products.recipeFilter.none')}
                  size="small"
                  text
                  onClick={() => onSetAllSkills(true)}
                />
              </div>
              {skillOptions.map((opt) => {
                const inputId = `skill-filter-${opt.id}`
                return (
                  <div key={opt.id} className="flex align-items-center gap-2">
                    <Checkbox
                      inputId={inputId}
                      checked={!hiddenSkills.has(opt.id)}
                      onChange={() => onToggleSkill(opt.id)}
                    />
                    <label htmlFor={inputId} className="text-sm cursor-pointer">
                      {opt.name}
                    </label>
                  </div>
                )
              })}
              <div className="flex align-items-center gap-2">
                <Checkbox
                  inputId="skill-filter-unskilled"
                  checked={showUnskilled}
                  onChange={onToggleUnskilled}
                />
                <label htmlFor="skill-filter-unskilled" className="text-sm cursor-pointer">
                  {t('priceCalculator.products.recipeFilter.unskilled')}
                </label>
              </div>
            </div>
            <div className="flex flex-column gap-2 flex-1">
              <div className="font-semibold text-sm">
                {t('priceCalculator.products.recipeFilter.craftingTableSection')}
              </div>
              <div className="flex gap-2">
                <Button
                  label={t('priceCalculator.products.recipeFilter.all')}
                  size="small"
                  text
                  onClick={() => onSetAllCraftingTables(false)}
                />
                <Button
                  label={t('priceCalculator.products.recipeFilter.none')}
                  size="small"
                  text
                  onClick={() => onSetAllCraftingTables(true)}
                />
              </div>
              {craftingTableOptions.map((opt) => {
                const inputId = `crafting-table-filter-${opt.id}`
                return (
                  <div key={opt.id} className="flex align-items-center gap-2">
                    <Checkbox
                      inputId={inputId}
                      checked={!hiddenCraftingTables.has(opt.id)}
                      onChange={() => onToggleCraftingTable(opt.id)}
                    />
                    <label htmlFor={inputId} className="text-sm cursor-pointer">
                      {opt.name}
                    </label>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="flex align-items-center gap-2 border-top-1 surface-border pt-2">
            <Checkbox
              inputId="recipe-filter-only-level-accessible"
              checked={onlyLevelAccessible}
              onChange={onToggleOnlyLevelAccessible}
            />
            <label htmlFor="recipe-filter-only-level-accessible" className="text-sm cursor-pointer">
              {t('priceCalculator.products.onlyLevelAccessible')}
            </label>
          </div>
        </div>
      </OverlayPanel>
    </>
  )
})

// --- row flattening ---

interface ParentRow {
  kind: 'parent'
  rowKey: string
  parent: ProductParent
  /** Child count — kept for potential future use (count badge etc.). */
  childCount: number
}

interface ChildRow {
  kind: 'child'
  rowKey: string
  product: Product
  parent: ProductParent
}

interface FlatRow {
  kind: 'flat'
  rowKey: string
  product: Product
}

type Row = ParentRow | ChildRow | FlatRow

function ProductsImpl({ buildId, datasetId, priceSignal }: Props) {
  const { t } = useTranslation()
  const { gameDataStore, buildStore } = useStores()
  const { getName } = useLocalizedName(datasetId)
  const recipeMgmt = useRecipeManagement(buildId)
  const priceMgmt = usePriceManagement(buildId)
  const settingsMgmt = useSettings(buildId)

  const groupsRev = useStoreRevision(buildStore, GROUPS_BUILD_TABLES)
  const filterRev = useStoreRevision(buildStore, FILTER_BUILD_TABLES)

  const { groups, margins, defaultMarginId } = useMemo(
    () => ({
      groups: buildProductGroups(buildStore, gameDataStore, buildId, getName),
      margins: buildMarginOptions(buildStore, buildId),
      defaultMarginId: findDefaultMarginId(buildStore, buildId),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildStore, gameDataStore, buildId, getName, groupsRev]
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
              <EcoIcon name={p.recipePrimaryProductRawName} size={20} />
            )}
            <Button
              label={p.recipeName}
              link
              className="p-0"
              onClick={() => setSelectedRecipeId(p.recipeId)}
            />
          </div>
        )
      }
      // flat
      const p = row.product
      return (
        <div className="flex align-items-center gap-2">
          {p.primaryProductRawName && <EcoIcon name={p.primaryProductRawName} size={20} />}
          <Button
            label={p.recipeName}
            link
            className="p-0"
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
            <ProductModeButton
              productId={row.parent.primaryProductId}
              userPriceId={row.parent.userPriceId}
              buildStore={buildStore}
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

  const marginTemplate = useCallback(
    (row: Row) => {
      if (row.kind === 'parent') {
        return (
          <MarginCell
            value={row.parent.productUserMarginId || defaultMarginId}
            rowId={row.parent.primaryProductId}
            options={margins}
            onChange={handleProductMarginChange}
          />
        )
      }
      if (row.kind === 'child') return null
      return (
        <MarginCell
          value={row.product.userMarginId}
          rowId={row.product.userRecipeId}
          options={margins}
          onChange={handleRecipeMarginChange}
        />
      )
    },
    [margins, defaultMarginId, handleProductMarginChange, handleRecipeMarginChange]
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
      />
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
          style={{ width: '9rem' }}
          headerClassName="p-align-right"
        />
        <Column
          header={t('priceCalculator.products.margin')}
          body={marginTemplate}
          style={{ width: '10rem' }}
        />
        <Column
          header={t('priceCalculator.products.salePrice')}
          body={saleTemplate}
          style={{ width: '7rem' }}
          headerClassName="p-align-right"
        />
        <Column body={deleteTemplate} style={{ width: '3rem' }} />
      </DataTable>
    </div>
  )
}

export const Products = memo(ProductsImpl)
