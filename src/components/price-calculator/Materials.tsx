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
import { PriceField } from '@/components/common/PriceField'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { usePriceManagement } from '@/hooks/use-price-management'
import { usePriceCell, type PriceSignal } from '@/hooks/use-prices-signal'
import { useCellValue, useStoreRevision, useTableRowIdsRevision } from '@/hooks/use-store-revision'
import { useStores } from '@/stores/providers'
import type { PriceMode } from '@/types/solver'

interface Props {
  buildId: string
  datasetId: string
  priceSignal: PriceSignal
}

const MODE_ICON: Record<PriceMode, string> = {
  manual: 'pi pi-pencil',
  min: 'pi pi-sort-amount-down',
  max: 'pi pi-sort-amount-up',
  avg: 'pi pi-calculator',
  mirror: 'pi pi-link',
}

const MODE_ORDER: PriceMode[] = ['manual', 'min', 'max', 'avg', 'mirror']

interface ModeIconButtonProps {
  itemOrTagId: string
  userPriceId: string
  buildStore: Store
  onSelectMode: (itemOrTagId: string, mode: PriceMode, userPriceId: string) => void
}

// Subscribes to its own `priceMode` cell so mode edits on one tag only
// re-render that tag's button — the DataTable and view-model are untouched.
const ModeIconButton = memo(function ModeIconButton({
  itemOrTagId,
  userPriceId,
  buildStore,
  onSelectMode,
}: ModeIconButtonProps) {
  const { t } = useTranslation()
  const op = useRef<OverlayPanel>(null)
  const stored = useCellValue<string>(buildStore, 'userPrices', userPriceId, 'priceMode')
  const mode: PriceMode = ((stored ?? 'min') as PriceMode) || 'min'

  return (
    <>
      <Button
        icon={MODE_ICON[mode]}
        text
        size="small"
        aria-label={t('priceCalculator.materials.priceMode.label')}
        tooltip={t('priceCalculator.materials.priceMode.modeTooltip', {
          mode: t(`priceCalculator.materials.priceMode.${mode}`),
        })}
        tooltipOptions={{ position: 'top' }}
        onClick={(e) => op.current?.toggle(e)}
      />
      <OverlayPanel ref={op}>
        <div className="flex flex-column gap-2">
          {MODE_ORDER.map((m) => {
            const inputId = `mode-${userPriceId || itemOrTagId}-${m}`
            return (
              <div key={m} className="flex align-items-center gap-2">
                <RadioButton
                  inputId={inputId}
                  checked={mode === m}
                  onChange={() => {
                    onSelectMode(itemOrTagId, m, userPriceId)
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

interface ManualPriceCellProps {
  itemOrTagId: string
  userPriceId: string
  buildStore: Store
  onChange: (itemOrTagId: string, userPriceId: string, value: number | null) => void
}

// The price cell subscribes directly to its own `userPrices` row cell, so an
// edit to one price only re-renders the one InputNumber — the DataTable, the
// view-model, and every other row are untouched. Memoized so unchanged cells
// also bail out when the parent re-renders for unrelated reasons (e.g.
// filtering).
const ManualPriceCell = memo(function ManualPriceCell({
  itemOrTagId,
  userPriceId,
  buildStore,
  onChange,
}: ManualPriceCellProps) {
  const price = useCellValue<number>(buildStore, 'userPrices', userPriceId, 'price')
  // An unset price row collapses to null so the InputNumber shows the
  // placeholder rather than "0".
  const value = price && price > 0 ? price : null
  return <PriceField value={value} onChange={(v) => onChange(itemOrTagId, userPriceId, v)} />
})

interface ComputedPriceCellProps {
  itemOrTagId: string
  signal: PriceSignal
  showIcon?: boolean
}

const ComputedPriceCell = memo(function ComputedPriceCell({
  itemOrTagId,
  signal,
  showIcon = false,
}: ComputedPriceCellProps) {
  const { t } = useTranslation()
  const value = usePriceCell(signal, itemOrTagId, 'costPrice')
  // Match PrimeReact .p-inputtext box model (0.75rem padding, 1px border,
  // 1rem font-size) so produced-item rows are the same height as rows with
  // an editable PriceField input.
  return (
    <div className="flex align-items-center gap-1">
      <div
        className="text-right"
        style={{
          opacity: 0.75,
          width: '5.5rem',
          padding: '0.75rem',
          border: '1px solid transparent',
          boxSizing: 'border-box',
          fontSize: '1rem',
          lineHeight: 1.2,
        }}
      >
        {value != null
          ? value.toFixed(2)
          : t('priceCalculator.materials.priceMode.noComputedPrice')}
      </div>
      {showIcon && <i className="pi pi-calculator text-xs text-color-secondary" />}
    </div>
  )
})

interface TagPriceCellProps {
  itemOrTagId: string
  userPriceId: string
  buildStore: Store
  signal: PriceSignal
  onPriceChange: (itemOrTagId: string, userPriceId: string, value: number | null) => void
  onSelectMode: (itemOrTagId: string, mode: PriceMode, userPriceId: string) => void
}

// Subscribes to the tag's `priceMode` cell so switching mode re-renders only
// this cell — not the DataTable or the view-model.
const TagPriceCell = memo(function TagPriceCell({
  itemOrTagId,
  userPriceId,
  buildStore,
  signal,
  onPriceChange,
  onSelectMode,
}: TagPriceCellProps) {
  const stored = useCellValue<string>(buildStore, 'userPrices', userPriceId, 'priceMode')
  const mode: PriceMode = ((stored ?? 'min') as PriceMode) || 'min'

  return (
    <div className="flex align-items-center justify-content-end gap-1">
      {mode === 'manual' ? (
        <div style={{ width: '5.5rem' }}>
          <ManualPriceCell
            itemOrTagId={itemOrTagId}
            userPriceId={userPriceId}
            buildStore={buildStore}
            onChange={onPriceChange}
          />
        </div>
      ) : (
        <ComputedPriceCell itemOrTagId={itemOrTagId} signal={signal} />
      )}
      <ModeIconButton
        itemOrTagId={itemOrTagId}
        userPriceId={userPriceId}
        buildStore={buildStore}
        onSelectMode={onSelectMode}
      />
    </div>
  )
})

interface MirrorCheckboxProps {
  parentTagId: string
  parentUserPriceId: string
  childItemId: string
  buildStore: Store
  onSelect: (parentTagId: string, childItemId: string, parentUserPriceId: string) => void
}

// Shown on child rows when the parent tag's mode is 'mirror'. Subscribes to
// the parent tag's `priceMode` and `primaryItemId` so changes on either
// re-render only this checkbox.
const MirrorCheckbox = memo(function MirrorCheckbox({
  parentTagId,
  parentUserPriceId,
  childItemId,
  buildStore,
  onSelect,
}: MirrorCheckboxProps) {
  const storedMode = useCellValue<string>(buildStore, 'userPrices', parentUserPriceId, 'priceMode')
  const mode: PriceMode = ((storedMode ?? 'min') as PriceMode) || 'min'
  const primary = useCellValue<string>(buildStore, 'userPrices', parentUserPriceId, 'primaryItemId')

  if (mode !== 'mirror') return null
  return (
    <Checkbox
      checked={primary === childItemId}
      onChange={() => onSelect(parentTagId, childItemId, parentUserPriceId)}
    />
  )
})

interface Material {
  // Unique row key. For children, namespaced by parent tag so the same item
  // appearing under multiple tags gets distinct DataTable keys.
  rowKey: string
  itemOrTagId: string
  name: string
  rawName: string
  isTag: boolean
  userPriceId: string
  isOverride: boolean
  isChild: boolean
  parentTagId: string
  parentUserPriceId: string
  // True when this item is produced by one of the build's recipes (primary
  // or secondary product). Such items get their price from the solver, so
  // the materials list shows the computed cost instead of an editable
  // price field.
  isProduced: boolean
}

interface MaterialGroup {
  parent: Material
  children: Material[]
}

// Tables this panel's view-model depends on. Typing into the local search
// input must not rebuild the view-model, so we gate recomputation on a
// revision counter scoped to these tables only.
//
// `userPrices` is intentionally NOT in this list: individual cells subscribe
// to their own cell. We still need to know when a userPrices row is
// added/removed (so the view-model picks up the new userPriceId for a
// previously-unpriced item), which is handled by `useTableRowIdsRevision`
// below.
const BUILD_TABLES = ['userRecipes'] as const
const USER_PRICES_TABLE = ['userPrices'] as const
const GAME_TABLES = ['recipeElements', 'items', 'tagItems'] as const

function MaterialsImpl({ buildId, datasetId, priceSignal }: Props) {
  const { t } = useTranslation()
  const { gameDataStore, buildStore } = useStores()
  const { getName } = useLocalizedName(datasetId)
  const priceMgmt = usePriceManagement(buildId)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const buildRev = useStoreRevision(buildStore, BUILD_TABLES)
  const userPricesRowIdsRev = useTableRowIdsRevision(buildStore, USER_PRICES_TABLE)
  const gameRev = useStoreRevision(gameDataStore, GAME_TABLES)

  const allGroups = useMemo<MaterialGroup[]>(
    () => {
      // Index recipeElements by recipeId once.
      const elementsByRecipeId = new Map<
        string,
        Array<{ itemOrTagId: string; isProduct: boolean }>
      >()
      for (const reId of gameDataStore.getRowIds('recipeElements')) {
        const re = gameDataStore.getRow('recipeElements', reId)
        if (re.datasetId !== datasetId) continue
        const recipeId = re.recipeId as string
        let list = elementsByRecipeId.get(recipeId)
        if (!list) {
          list = []
          elementsByRecipeId.set(recipeId, list)
        }
        list.push({
          itemOrTagId: re.itemOrTagId as string,
          isProduct: re.isProduct as boolean,
        })
      }

      // Index userPrices by itemOrTagId for this build. We only care about
      // `userPriceId` (for cells to subscribe to their own cell) and
      // `isOverride` (view-model flag). Price *values*, mode, and primary
      // are read by per-cell subscriptions, NOT baked into the view-model,
      // so edits don't invalidate this memo.
      const userPriceByItem = new Map<string, { id: string; isOverride: boolean }>()
      for (const upId of buildStore.getRowIds('userPrices')) {
        const up = buildStore.getRow('userPrices', upId)
        if (up.buildId !== buildId) continue
        userPriceByItem.set(up.itemOrTagId as string, {
          id: upId,
          isOverride: up.isOverride as boolean,
        })
      }

      // Index items satisfying each tag, scoped to this dataset.
      const itemsByTagId = new Map<string, string[]>()
      for (const tiId of gameDataStore.getRowIds('tagItems')) {
        const row = gameDataStore.getRow('tagItems', tiId)
        if (row.datasetId !== datasetId) continue
        const tagId = row.tagId as string
        let list = itemsByTagId.get(tagId)
        if (!list) {
          list = []
          itemsByTagId.set(tagId, list)
        }
        list.push(row.itemId as string)
      }

      const ingredientIds = new Set<string>()
      const primaryProductIds = new Set<string>()
      const producedItemIds = new Set<string>()

      for (const urId of buildStore.getRowIds('userRecipes')) {
        const ur = buildStore.getRow('userRecipes', urId)
        if (ur.buildId !== buildId) continue

        const elems = elementsByRecipeId.get(ur.recipeId as string)
        if (!elems) continue

        // A recipe that consumes its own product (reintegration) is a net
        // sink, not a source — skip it so the item still gets a manually
        // priced row in the materials list. Other recipes that cleanly
        // produce the same item will still mark it as produced.
        const ownIngredientIds = new Set<string>()
        for (const e of elems) {
          if (!e.isProduct) ownIngredientIds.add(e.itemOrTagId)
        }

        let foundPrimary = false
        for (const e of elems) {
          if (e.isProduct) {
            if (ownIngredientIds.has(e.itemOrTagId)) continue
            producedItemIds.add(e.itemOrTagId)
            if (!foundPrimary) {
              primaryProductIds.add(e.itemOrTagId)
              foundPrimary = true
            }
          } else {
            ingredientIds.add(e.itemOrTagId)
          }
        }
      }

      const buildMaterial = (
        itemId: string,
        rowKey: string,
        isChild: boolean,
        parentTagId: string,
        parentUserPriceId: string
      ): Material | null => {
        const itemRow = gameDataStore.getRow('items', itemId)
        if (!itemRow) return null
        const up = userPriceByItem.get(itemId)
        return {
          rowKey,
          itemOrTagId: itemId,
          name: getName('item', itemId),
          rawName: (itemRow.name as string) ?? '',
          isTag: itemRow.isTag as boolean,
          userPriceId: up ? up.id : '',
          isOverride: up ? up.isOverride : false,
          isChild,
          parentTagId,
          parentUserPriceId,
          isProduced: producedItemIds.has(itemId),
        }
      }

      // An item that appears as a child under a tag ingredient should not
      // also appear as its own top-level row.
      const tagChildItemIds = new Set<string>()
      for (const itemId of ingredientIds) {
        const itemRow = gameDataStore.getRow('items', itemId)
        if (!itemRow?.isTag) continue
        for (const childId of itemsByTagId.get(itemId) ?? []) {
          tagChildItemIds.add(childId)
        }
      }

      const groups: MaterialGroup[] = []
      for (const itemId of ingredientIds) {
        if (primaryProductIds.has(itemId)) continue
        const parent = buildMaterial(itemId, itemId, false, '', '')
        if (!parent) continue
        if (!parent.isTag && tagChildItemIds.has(itemId)) continue

        const children: Material[] = []
        if (parent.isTag) {
          const childIds = itemsByTagId.get(itemId) ?? []
          for (const childId of childIds) {
            const childMat = buildMaterial(
              childId,
              `${itemId}::${childId}`,
              true,
              itemId,
              parent.userPriceId
            )
            if (childMat) children.push(childMat)
          }
          children.sort((a, b) => a.name.localeCompare(b.name))
        }

        groups.push({ parent, children })
      }

      return groups.sort((a, b) => a.parent.name.localeCompare(b.parent.name))
    },
    // allGroups depends on store structure (via revisions) and the name
    // lookup, NOT on `search` or on price *values* — typing a price into an
    // InputNumber must not invalidate this memo. `userPricesRowIdsRev`
    // catches the add/remove case (new userPrices row for a previously
    // unpriced item) without firing on cell edits. The lint rule can't see
    // through the revision counters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildId, datasetId, buildStore, gameDataStore, getName, buildRev, userPricesRowIdsRev, gameRev]
  )

  // Filter + flatten into a single row list for DataTable. A tag stays
  // visible if its own name matches (all children shown) or if any child
  // matches (only matching children shown).
  const { rows, topLevelCount } = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const out: Material[] = []
    let top = 0
    for (const group of allGroups) {
      const selfMatch = !q || group.parent.name.toLowerCase().includes(q)
      let visibleChildren: Material[]
      if (!q || selfMatch) {
        visibleChildren = group.children
      } else {
        visibleChildren = group.children.filter((c) => c.name.toLowerCase().includes(q))
      }
      const hasChildMatch = visibleChildren.length > 0
      if (!selfMatch && !hasChildMatch) continue
      out.push(group.parent)
      for (const c of visibleChildren) out.push(c)
      top += 1
    }
    return { rows: out, topLevelCount: top }
  }, [allGroups, debouncedSearch])

  const setPrice = priceMgmt.setPrice
  const setPriceMode = priceMgmt.setPriceMode
  const setPrimaryItem = priceMgmt.setPrimaryItem
  const onPriceChange = useCallback(
    (itemOrTagId: string, userPriceId: string, price: number | null) => {
      setPrice(itemOrTagId, price, userPriceId)
    },
    [setPrice]
  )
  const onSelectMode = useCallback(
    (itemOrTagId: string, mode: PriceMode, userPriceId: string) => {
      setPriceMode(itemOrTagId, mode, userPriceId)
    },
    [setPriceMode]
  )
  const onSelectPrimary = useCallback(
    (parentTagId: string, childItemId: string, parentUserPriceId: string) => {
      setPrimaryItem(parentTagId, childItemId, parentUserPriceId)
    },
    [setPrimaryItem]
  )

  const nameTemplate = useCallback(
    (row: Material) => (
      <div
        className="flex align-items-center gap-2"
        style={row.isChild ? { paddingLeft: '1.5rem' } : undefined}
      >
        {row.rawName && <EcoIcon name={row.rawName} size={20} />}
        <span>{row.name}</span>
        {row.isTag && <i className="pi pi-tag text-xs" />}
      </div>
    ),
    []
  )

  const priceTemplate = useCallback(
    (row: Material) => {
      if (row.isTag && !row.isChild) {
        return (
          <TagPriceCell
            itemOrTagId={row.itemOrTagId}
            userPriceId={row.userPriceId}
            buildStore={buildStore}
            signal={priceSignal}
            onPriceChange={onPriceChange}
            onSelectMode={onSelectMode}
          />
        )
      }
      if (row.isChild) {
        return (
          <div className="flex align-items-center justify-content-end gap-1">
            {row.isProduced ? (
              <ComputedPriceCell itemOrTagId={row.itemOrTagId} signal={priceSignal} showIcon />
            ) : (
              <div style={{ width: '5.5rem' }}>
                <ManualPriceCell
                  itemOrTagId={row.itemOrTagId}
                  userPriceId={row.userPriceId}
                  buildStore={buildStore}
                  onChange={onPriceChange}
                />
              </div>
            )}
            {row.parentUserPriceId ? (
              <MirrorCheckbox
                parentTagId={row.parentTagId}
                parentUserPriceId={row.parentUserPriceId}
                childItemId={row.itemOrTagId}
                buildStore={buildStore}
                onSelect={onSelectPrimary}
              />
            ) : null}
          </div>
        )
      }
      if (row.isProduced) {
        return (
          <div className="flex justify-content-end">
            <ComputedPriceCell itemOrTagId={row.itemOrTagId} signal={priceSignal} showIcon />
          </div>
        )
      }
      return (
        <div className="flex justify-content-end">
          <div style={{ width: '5.5rem' }}>
            <ManualPriceCell
              itemOrTagId={row.itemOrTagId}
              userPriceId={row.userPriceId}
              buildStore={buildStore}
              onChange={onPriceChange}
            />
          </div>
        </div>
      )
    },
    [onPriceChange, onSelectMode, onSelectPrimary, buildStore, priceSignal]
  )

  return (
    <div className="flex flex-column flex-1" style={{ minHeight: 0 }}>
      <div className="flex align-items-center gap-2 mb-2">
        <h3 className="m-0">
          {t('priceCalculator.materials.titleCount', { count: topLevelCount })}
        </h3>
        <DebouncedSearchInput
          onDebouncedChange={setDebouncedSearch}
          placeholder={t('priceCalculator.materials.search')}
          className="flex-1"
        />
      </div>
      <DataTable
        value={rows}
        dataKey="rowKey"
        size="small"
        scrollable
        scrollHeight="flex"
        emptyMessage={t('priceCalculator.materials.emptyMessage')}
      >
        <Column header={t('priceCalculator.materials.item')} body={nameTemplate} />
        <Column
          header={t('priceCalculator.materials.price')}
          body={priceTemplate}
          style={{ width: '13rem' }}
          headerClassName="p-align-right"
        />
      </DataTable>
    </div>
  )
}

export const Materials = memo(MaterialsImpl)
