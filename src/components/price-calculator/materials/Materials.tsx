import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { memo, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DebouncedSearchInput } from '@/components/common/DebouncedSearchInput'
import { ItemIcon } from '@/components/common/ItemIcon'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { usePriceManagement } from '@/hooks/use-price-management'
import { type PriceSignal } from '@/hooks/use-prices-signal'
import { arrayEquals, shallowEquals, useStableContent } from '@/hooks/use-stable-content'
import { useStoreRevision, useTableRowIdsRevision } from '@/hooks/use-store-revision'
import { getGameDataIndexes } from '@/lib/game-data-indexes'
import { useStores } from '@/stores/providers'
import type { PriceMode } from '@/types/solver'

import { RecipeDialog } from '../products/RecipeDialog'
import { ComputedPriceCell } from './ComputedPriceCell'
import { ManualPriceCell } from './ManualPriceCell'
import { MaterialDialog } from './MaterialDialog'
import { MirrorCheckbox } from './MirrorCheckbox'
import { TagPriceCell } from './TagPriceCell'
import type { Material, MaterialGroup } from './types'

interface Props {
  buildId: string
  datasetId: string
  priceSignal: PriceSignal
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

// Let `ProductsDataTable`-style re-renders bail out when a userPrices row
// add touches at most one Material's `userPriceId`. Without this, all ~114
// Materials rows re-render their body templates on every add.
function groupEquals(a: MaterialGroup, b: MaterialGroup): boolean {
  if (!shallowEquals(a.parent, b.parent)) return false
  return arrayEquals(a.children, b.children, shallowEquals)
}

function groupsEqual(a: MaterialGroup[], b: MaterialGroup[]): boolean {
  return arrayEquals(a, b, groupEquals)
}

function MaterialsImpl({ buildId, datasetId, priceSignal }: Props) {
  const { t } = useTranslation()
  const { gameDataStore, buildStore } = useStores()
  const { getName } = useLocalizedName(datasetId)
  const priceMgmt = usePriceManagement(buildId)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [recipeDialogId, setRecipeDialogId] = useState<string | null>(null)

  const buildRev = useStoreRevision(buildStore, BUILD_TABLES)
  const userPricesRowIdsRev = useTableRowIdsRevision(buildStore, USER_PRICES_TABLE)
  const gameRev = useStoreRevision(gameDataStore, GAME_TABLES)

  const rawAllGroups = useMemo<MaterialGroup[]>(
    () => {
      // Cached indexes: the per-recipe product/ingredient maps and the
      // per-tag item list are dataset-scoped and immutable after import.
      // Previously this memo re-scanned `recipeElements` (~4500 rows) and
      // `tagItems` (~1300 rows) on every rebuild, which made a new
      // userPrices row (`userPricesRowIdsRev` bump) trigger a ~600ms
      // synchronous task.
      const { productItemIdsByRecipeId, ingredientItemIdsByRecipeId, itemIdsByTagId } =
        getGameDataIndexes(gameDataStore)

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

      const ingredientIds = new Set<string>()
      const primaryProductIds = new Set<string>()
      const producedItemIds = new Set<string>()

      for (const urId of buildStore.getRowIds('userRecipes')) {
        const ur = buildStore.getRow('userRecipes', urId)
        if (ur.buildId !== buildId) continue

        const recipeId = ur.recipeId as string
        const ownIngredients = ingredientItemIdsByRecipeId.get(recipeId)
        const ownProducts = productItemIdsByRecipeId.get(recipeId)
        if (!ownProducts && !ownIngredients) continue

        // A recipe that consumes its own product (reintegration) is a net
        // sink, not a source — skip it so the item still gets a manually
        // priced row in the materials list. Other recipes that cleanly
        // produce the same item will still mark it as produced.
        if (ownIngredients) {
          for (const id of ownIngredients) ingredientIds.add(id)
        }
        if (ownProducts) {
          let foundPrimary = false
          for (const itemId of ownProducts) {
            if (ownIngredients?.has(itemId)) continue
            producedItemIds.add(itemId)
            if (!foundPrimary) {
              primaryProductIds.add(itemId)
              foundPrimary = true
            }
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
        for (const childId of itemIdsByTagId.get(itemId) ?? []) {
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
          const childIds = itemIdsByTagId.get(itemId) ?? []
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
  // Preserve reference when semantic content didn't change so the
  // downstream `rows` memo and the DataTable re-render bail out when a
  // userPrices row add doesn't actually alter any visible Material.
  const allGroups = useStableContent(rawAllGroups, groupsEqual)

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
        {row.rawName && <ItemIcon item={{ name: row.rawName }} />}
        <Button
          label={row.name}
          link
          className="p-0"
          pt={{ label: { style: { textAlign: 'left' } } }}
          onClick={() => setSelectedItemId(row.itemOrTagId)}
        />
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
      <MaterialDialog
        itemId={selectedItemId}
        buildId={buildId}
        datasetId={datasetId}
        onHide={() => setSelectedItemId(null)}
        onOpenRecipe={(id) => {
          setSelectedItemId(null)
          setRecipeDialogId(id)
        }}
      />
      <RecipeDialog
        recipeId={recipeDialogId}
        buildId={buildId}
        datasetId={datasetId}
        priceSignal={priceSignal}
        onHide={() => setRecipeDialogId(null)}
        onOpenMaterial={(id) => {
          setRecipeDialogId(null)
          setSelectedItemId(id)
        }}
      />
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
