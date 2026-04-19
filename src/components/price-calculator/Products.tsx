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

const BUILD_TABLES = [
  'userRecipes',
  'userRecipeMargins',
  'userProductMargins',
  'userMargins',
  'userSettings',
  'userSkills',
  'userPrices',
  'hiddenSkills',
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

interface SkillFilterButtonProps {
  skillNames: string[]
  hidden: Set<string>
  showUnskilled: boolean
  onToggle: (name: string) => void
  onToggleUnskilled: () => void
  onSetAll: (hideAll: boolean) => void
}

const SkillFilterButton = memo(function SkillFilterButton({
  skillNames,
  hidden,
  showUnskilled,
  onToggle,
  onToggleUnskilled,
  onSetAll,
}: SkillFilterButtonProps) {
  const { t } = useTranslation()
  const op = useRef<OverlayPanel>(null)
  const isAnyHidden = hidden.size > 0 || !showUnskilled
  return (
    <>
      <Button
        icon={isAnyHidden ? 'pi pi-filter-fill' : 'pi pi-filter'}
        text={!isAnyHidden}
        size="small"
        aria-label={t('priceCalculator.products.skillFilter.label')}
        tooltip={t('priceCalculator.products.skillFilter.tooltip')}
        tooltipOptions={{ position: 'bottom' }}
        onClick={(e) => op.current?.toggle(e)}
      />
      <OverlayPanel ref={op}>
        <div className="flex flex-column gap-2" style={{ minWidth: '14rem' }}>
          <div className="flex gap-2">
            <Button
              label={t('priceCalculator.products.skillFilter.all')}
              size="small"
              text
              onClick={() => onSetAll(false)}
            />
            <Button
              label={t('priceCalculator.products.skillFilter.none')}
              size="small"
              text
              onClick={() => onSetAll(true)}
            />
          </div>
          {skillNames.map((name) => {
            const inputId = `skill-filter-${name}`
            return (
              <div key={name} className="flex align-items-center gap-2">
                <Checkbox
                  inputId={inputId}
                  checked={!hidden.has(name)}
                  onChange={() => onToggle(name)}
                />
                <label htmlFor={inputId} className="text-sm cursor-pointer">
                  {name}
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
              {t('priceCalculator.products.skillFilter.unskilled')}
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

  const buildRev = useStoreRevision(buildStore, BUILD_TABLES)

  const {
    groups,
    margins,
    defaultMarginId,
    showUnskilledRecipes,
    onlyLevelAccessible,
    userSkillLevels,
    hiddenSkills,
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
    const hidden = new Set<string>()
    for (const rowId of buildStore.getRowIds('hiddenSkills')) {
      const row = buildStore.getRow('hiddenSkills', rowId)
      if (row.buildId !== buildId) continue
      hidden.add(row.skillName as string)
    }
    return {
      groups: buildProductGroups(buildStore, gameDataStore, buildId, getName),
      margins: buildMarginOptions(buildStore, buildId),
      defaultMarginId: findDefaultMarginId(buildStore, buildId),
      showUnskilledRecipes: showUnskilled,
      onlyLevelAccessible: levelOnly,
      userSkillLevels: skillLevels,
      hiddenSkills: hidden,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildStore, gameDataStore, buildId, getName, buildRev])

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

  // All skill names in the build (stable set for the filter overlay).
  // Empty names (unskilled recipes) are governed by the Unskilled checkbox instead.
  const allSkillNames = useMemo(() => {
    const s = new Set<string>()
    for (const g of groups) for (const c of g.children) if (c.skillName) s.add(c.skillName)
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [groups])

  const childVisible = useCallback(
    (c: Product): boolean => {
      if (!showUnskilledRecipes && !c.skillId) return false
      if (onlyLevelAccessible && c.skillId) {
        const level = userSkillLevels.get(c.skillId) ?? 0
        if (c.requiredSkillLevel > level) return false
      }
      if (hiddenSkills.has(c.skillName)) return false
      return true
    },
    [showUnskilledRecipes, onlyLevelAccessible, userSkillLevels, hiddenSkills]
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
    (name: string) => {
      let existingId: string | null = null
      for (const rowId of buildStore.getRowIds('hiddenSkills')) {
        const row = buildStore.getRow('hiddenSkills', rowId)
        if (row.buildId === buildId && row.skillName === name) {
          existingId = rowId
          break
        }
      }
      if (existingId) {
        buildStore.delRow('hiddenSkills', existingId)
      } else {
        const id = generateId()
        buildStore.setRow('hiddenSkills', id, { buildId, skillName: name })
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
          for (const name of allSkillNames) {
            const id = generateId()
            buildStore.setRow('hiddenSkills', id, { buildId, skillName: name })
          }
        }
      })
      settingsMgmt.setSetting('showUnskilledRecipes', !hideAll)
    },
    [allSkillNames, buildId, buildStore, settingsMgmt]
  )

  const handleToggleUnskilled = useCallback(
    () => settingsMgmt.setSetting('showUnskilledRecipes', !showUnskilledRecipes),
    [settingsMgmt, showUnskilledRecipes]
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
        <SkillFilterButton
          skillNames={allSkillNames}
          hidden={hiddenSkills}
          showUnskilled={showUnskilledRecipes}
          onToggle={handleToggleSkill}
          onToggleUnskilled={handleToggleUnskilled}
          onSetAll={handleSetAllSkills}
        />
        <Button
          icon="pi pi-lock"
          text={!onlyLevelAccessible}
          size="small"
          aria-label={t('priceCalculator.products.onlyLevelAccessible')}
          aria-pressed={onlyLevelAccessible}
          tooltip={t('priceCalculator.products.onlyLevelAccessible')}
          tooltipOptions={{ position: 'bottom' }}
          onClick={() => settingsMgmt.setSetting('onlyLevelAccessible', !onlyLevelAccessible)}
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
