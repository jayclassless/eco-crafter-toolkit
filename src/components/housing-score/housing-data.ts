import type { Store } from 'tinybase'

import type { Compare } from '@/lib/collator'
import { getGameDataIndexes } from '@/lib/game-data-indexes'

import type {
  FurnishingFilterState,
  FurnishingRow,
  MaterialRow,
  RoomCategoryView,
  RoomTierView,
} from './housing-types'

/** Resolves an entity id to its localized name (the `useLocalizedName` hook's
 * `getName`). Passed in rather than hooked, so these stay pure. */
type GetName = (entityType: string, entityId: string) => string

export function buildRoomCategoryViews(
  store: Store,
  datasetId: string,
  getName: GetName
): RoomCategoryView[] {
  const { roomCategoriesByDatasetId } = getGameDataIndexes(store)
  const categories = roomCategoriesByDatasetId.get(datasetId) ?? []
  return categories.map((c) => ({
    name: c.name,
    // Category names are game data, localized in the dataset — not i18n keys.
    displayName: getName('roomCategory', c.id) || c.name,
    color: c.color,
    negatesValue: c.negatesValue,
  }))
}

export function buildRoomTierMap(store: Store, datasetId: string): Map<number, RoomTierView> {
  const { roomTiersByDatasetId } = getGameDataIndexes(store)
  const map = new Map<number, RoomTierView>()
  for (const t of roomTiersByDatasetId.get(datasetId) ?? []) {
    map.set(t.tierVal, { tier: t.tierVal, softCap: t.softCap, hardCap: t.hardCap })
  }
  return map
}

function skillFields(store: Store, itemId: string, getName: GetName, compare: Compare) {
  const { skillIdsByItemId } = getGameDataIndexes(store)
  const skillIds = skillIdsByItemId.get(itemId) ?? []
  const entries = skillIds
    .map((skillId) => ({
      id: skillId,
      name:
        getName('skill', skillId) || ((store.getCell('skills', skillId, 'name') as string) ?? ''),
      rawName: (store.getCell('skills', skillId, 'name') as string) ?? '',
    }))
    .sort((a, b) => compare(a.name, b.name))
  return {
    skillIds: entries.map((e) => e.id),
    skillNames: entries.map((e) => e.name),
    skillRawNames: entries.map((e) => e.rawName),
    skillLabel: entries.map((e) => e.name).join(', '),
  }
}

/**
 * Furnishing rows for the browser. Categories that zero a room's value
 * (`negatesValue`, i.e. Industrial) are dropped — derived from the data rather
 * than matched on the literal name, so a renamed or newly-added negating
 * category is still excluded. When the dataset carries no categories at all
 * (extracted before housing support) nothing is excluded and the caller shows
 * its empty state instead.
 */
export function buildFurnishingRows(
  store: Store,
  datasetId: string,
  getName: GetName,
  categories: RoomCategoryView[],
  compare: Compare
): FurnishingRow[] {
  const { housingItemIdsByDatasetId } = getGameDataIndexes(store)
  const byName = new Map(categories.map((c) => [c.name, c]))
  const rows: FurnishingRow[] = []
  for (const itemId of housingItemIdsByDatasetId.get(datasetId) ?? []) {
    const row = store.getRow('items', itemId)
    const categoryName = (row.housingCategory as string) ?? ''
    const category = byName.get(categoryName)
    if (category?.negatesValue) continue
    const rawName = (row.name as string) ?? ''
    const multiplier = (row.housingDiminishingReturnMultiplier as number) ?? 1
    rows.push({
      itemId,
      name: getName('item', itemId) || rawName,
      rawName,
      categoryName,
      // An unknown category still renders, uncolored, rather than throwing.
      categoryDisplayName: category?.displayName ?? categoryName,
      categoryColor: category?.color ?? '',
      typeForRoomLimit: (row.housingTypeForRoomLimit as string) ?? '',
      baseValue: (row.housingBaseValue as number) ?? 0,
      repeatReduction: multiplier === 1 ? null : 1 - multiplier,
      ...skillFields(store, itemId, getName, compare),
    })
  }
  return rows
}

export function buildMaterialRows(
  store: Store,
  datasetId: string,
  getName: GetName,
  tiers: Map<number, RoomTierView>,
  compare: Compare
): MaterialRow[] {
  const { buildingMaterialItemIdsByDatasetId } = getGameDataIndexes(store)
  const rows: MaterialRow[] = []
  for (const itemId of buildingMaterialItemIdsByDatasetId.get(datasetId) ?? []) {
    const row = store.getRow('items', itemId)
    const rawName = (row.name as string) ?? ''
    const tier = (row.buildingBlockTier as number) ?? 0
    const tierView = tiers.get(tier)
    rows.push({
      itemId,
      name: getName('item', itemId) || rawName,
      rawName,
      tier,
      softCap: tierView?.softCap ?? null,
      hardCap: tierView?.hardCap ?? null,
      ...skillFields(store, itemId, getName, compare),
    })
  }
  return rows
}

export interface FurnishingFilterOptions {
  categories: RoomCategoryView[]
  types: string[]
  skills: { id: string; name: string; rawName: string }[]
}

/** The option lists for the three filters, derived from the unfiltered rows so
 * they never offer a value that matches nothing. */
export function collectFurnishingFilterOptions(
  rows: FurnishingRow[],
  categories: RoomCategoryView[],
  compare: Compare
): FurnishingFilterOptions {
  const usedCategories = new Set(rows.map((r) => r.categoryName))
  const types = new Set<string>()
  const skills = new Map<string, { id: string; name: string; rawName: string }>()
  for (const row of rows) {
    // Ungrouped furnishings have an empty type; offering "" as a choice would
    // read as a blank row in the dropdown.
    if (row.typeForRoomLimit) types.add(row.typeForRoomLimit)
    row.skillIds.forEach((id, i) => {
      if (!skills.has(id)) {
        skills.set(id, { id, name: row.skillNames[i], rawName: row.skillRawNames[i] })
      }
    })
  }
  return {
    // Keep the game's declaration order for categories; the others collate.
    categories: categories.filter((c) => usedCategories.has(c.name)),
    types: [...types].sort(compare),
    skills: [...skills.values()].sort((a, b) => compare(a.name, b.name)),
  }
}

export function applyFurnishingFilters(
  rows: FurnishingRow[],
  filters: FurnishingFilterState
): FurnishingRow[] {
  const { categories, types, skillIds } = filters
  if (!categories && !types && !skillIds) return rows
  const catSet = categories && new Set(categories)
  const typeSet = types && new Set(types)
  const skillSet = skillIds && new Set(skillIds)
  return rows.filter((row) => {
    if (catSet && !catSet.has(row.categoryName)) return false
    if (typeSet && !typeSet.has(row.typeForRoomLimit)) return false
    if (skillSet && !row.skillIds.some((id) => skillSet.has(id))) return false
    return true
  })
}
