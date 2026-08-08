import type { Store } from 'tinybase'

import {
  buildRecipeIngredientItemIds,
  buildRecipeProductItemIds,
  buildRecipeUnlockingTalents,
  buildTagIdsByItemId,
} from '@/hooks/use-products'
import {
  type BonusEntry,
  buildRecipeIndexes,
  type RecipeIndexes,
  type TalentIndexEntry,
} from '@/hooks/use-solver-snapshot'
import type { ModuleSlot } from '@/types/game-data'

/** A module a crafting table accepts, in the shape the module UI needs. Names
 * are raw (non-localized) game names — callers localize via `useLocalizedName`. */
export interface CraftingTableModule {
  id: string
  datasetId: string
  name: string
  slot: ModuleSlot
  isDeprecated: boolean
}

interface TalentDetails {
  id: string
  name: string
  talentGroupName: string
  level: number
  isLevelable: boolean
  maxTalentLevel: number
}

interface GameDataIndexes {
  productItemIdsByRecipeId: Map<string, string[]>
  ingredientItemIdsByRecipeId: Map<string, Set<string>>
  unlockingTalentsByRecipeId: Map<string, string[]>
  tagIdsByItemId: Map<string, string[]>
  /** Items satisfying each tag (inverse of `tagIdsByItemId`). Used by the
   * Materials view-model to expand tag ingredients into their concrete
   * items. Precomputed here so the per-rebuild scan over ~1300 `tagItems`
   * rows is a one-time cost per dataset. */
  itemIdsByTagId: Map<string, string[]>
  /** `SolverInput.tagItems`, keyed by datasetId. Handed to the solver as-is on
   * every snapshot, so it is SHARED — callers must treat it as read-only. */
  solverTagItemsByDatasetId: Map<string, Record<string, string[]>>
  /** Recipes where this item is the primary product — first product NOT also
   * an ingredient (matches the "primary product" semantics used by
   * `buildProducts` and MaterialDialog). Used by the dependency graph to
   * enumerate which recipes can produce a given item. */
  primaryRecipeIdsByItemId: Map<string, string[]>
  /** Per-item "canonical" recipe family — used by Products list ordering to
   * cluster substrate variants (Board / Hardwood Board / Softwood Board)
   * adjacently. An item can be produced by recipes in multiple families
   * (e.g. BoardItem comes from "Board", "Boards", "Saw Boards", "Particle
   * Boards"); we pick the family with the largest dataset-level item-set,
   * ties broken alphabetically. Computed dataset-wide so an item resolves
   * to the same family regardless of which recipe the user has in their
   * build. Items with no family-bearing producer are absent from the map. */
  canonicalFamilyByItemId: Map<string, string>
  recipeIndexes: RecipeIndexes
  /** Convenience: talents bucketed by their owning skill — this is the same
   * Map exposed inside `recipeIndexes.talentsBySkillId`, hoisted here so
   * non-solver consumers (e.g. SkillsPanel) don't need to know about the
   * solver bundle. */
  talentsBySkillId: Map<string, TalentIndexEntry[]>
  bonusesByTalentId: Map<string, BonusEntry[]>
  /** Per-skill, view-friendly talent metadata (level, group, level cap) for
   * components that render talent UIs. Avoids one `gameDataStore.getRow` per
   * talent on every SkillsPanel rebuild. */
  talentDetailsBySkillId: Map<string, TalentDetails[]>
  /** Items the Gathering Calculator can price. Used by the Materials row
   * action for an O(1) "does this row have a gathering estimate?" test, with
   * no per-row store reads. Dataset-immutable, so it rides this cache. */
  gatherableItemIds: Set<string>
  /** Modules each crafting table accepts, via the `craftingTablePluginModules`
   * join. Prefer `craftingTableModules()` over reading this directly — it
   * applies the dataset filter. */
  modulesByCraftingTableId: Map<string, CraftingTableModule[]>
  /** What one unit of an item breaks down into (`itemSalvage`). Scaled by
   * `CRAFT_GARBAGE_RATIO` when a recipe consumes it. Empty on v11–v13. */
  salvageByItemId: Map<string, GarbageQuantityRow[]>
  /** A recipe's explicit `GarbageOutputs` — literal quantities, NOT ratio
   * scaled. Empty on v11–v13. */
  garbageByRecipeId: Map<string, GarbageQuantityRow[]>
}

/** An `(item, quantity)` pair from either garbage table. */
interface GarbageQuantityRow {
  itemId: string
  quantity: number
}

const cache = new WeakMap<Store, GameDataIndexes>()
const wired = new WeakSet<Store>()

function buildTalentDetailsBySkillId(store: Store): Map<string, TalentDetails[]> {
  const map = new Map<string, TalentDetails[]>()
  for (const tId of store.getRowIds('talents')) {
    const t = store.getRow('talents', tId)
    const skillId = t.skillId as string
    if (!skillId) continue
    let list = map.get(skillId)
    if (!list) {
      list = []
      map.set(skillId, list)
    }
    list.push({
      id: tId,
      name: t.name as string,
      talentGroupName: (t.talentGroupName as string) ?? '',
      level: (t.level as number) ?? 0,
      isLevelable: (t.isLevelable as boolean) ?? false,
      maxTalentLevel: (t.maxTalentLevel as number) ?? 0,
    })
  }
  return map
}

function buildPrimaryRecipeIdsByItemId(
  productItemIdsByRecipeId: Map<string, string[]>,
  ingredientItemIdsByRecipeId: Map<string, Set<string>>
): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const [recipeId, productIds] of productItemIdsByRecipeId) {
    if (productIds.length === 0) continue
    const ingredients = ingredientItemIdsByRecipeId.get(recipeId)
    const primary = productIds.find((id) => !ingredients?.has(id)) ?? productIds[0]
    let list = map.get(primary)
    if (!list) {
      list = []
      map.set(primary, list)
    }
    list.push(recipeId)
  }
  return map
}

function buildCanonicalFamilyByItemId(
  store: Store,
  productItemIdsByRecipeId: Map<string, string[]>,
  ingredientItemIdsByRecipeId: Map<string, Set<string>>
): Map<string, string> {
  // family → distinct PRIMARY products of its recipes. Using only the primary
  // product (first non-reintegrated, mirroring `buildPrimaryRecipeIdsByItemId`)
  // avoids spurious cross-cluster linkage via shared byproducts: e.g. all
  // ore-concentrate Lv2 families produce WetTailings as a secondary, and
  // counting it would conflate Copper / Iron / Gold concentrates into one
  // "Concentrate Copper Lv2" cluster.
  const itemsByFamily = new Map<string, Set<string>>()
  for (const [recipeId, productIds] of productItemIdsByRecipeId) {
    if (productIds.length === 0) continue
    const familyName = (store.getCell('recipes', recipeId, 'familyName') as string) ?? ''
    if (!familyName) continue
    const ingredients = ingredientItemIdsByRecipeId.get(recipeId)
    const primary = productIds.find((id) => !ingredients?.has(id)) ?? productIds[0]
    let set = itemsByFamily.get(familyName)
    if (!set) {
      set = new Set()
      itemsByFamily.set(familyName, set)
    }
    set.add(primary)
  }

  // Invert: itemId → list of (family, family-size) candidates. Then per item
  // pick the largest-family candidate, alphabetical tiebreak.
  const candidatesByItem = new Map<string, Array<{ family: string; size: number }>>()
  for (const [family, items] of itemsByFamily) {
    const size = items.size
    for (const itemId of items) {
      let list = candidatesByItem.get(itemId)
      if (!list) {
        list = []
        candidatesByItem.set(itemId, list)
      }
      list.push({ family, size })
    }
  }
  const result = new Map<string, string>()
  for (const [itemId, list] of candidatesByItem) {
    list.sort((a, b) => b.size - a.size || a.family.localeCompare(b.family))
    result.set(itemId, list[0].family)
  }
  return result
}

function buildItemIdsByTagId(store: Store): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const tiId of store.getRowIds('tagItems')) {
    const row = store.getRow('tagItems', tiId)
    const tagId = row.tagId as string
    let list = map.get(tagId)
    if (!list) {
      list = []
      map.set(tagId, list)
    }
    list.push(row.itemId as string)
  }
  return map
}

/**
 * The solver's `tagItems` payload, pre-built per dataset.
 *
 * Same data as `itemIdsByTagId`, but split by dataset and shaped as the plain
 * `Record` that crosses the worker `postMessage` boundary. It cannot just reuse
 * the unfiltered map: `solve()` walks `for (const tagId in tagItems)` to emit
 * tag prices, so another dataset's tags would leak into `SolverOutput`.
 *
 * Precomputed because `buildSolverSnapshot` used to rebuild it on EVERY
 * debounced recalculation — 6,665 rows for v14 alone, ~26k with all four
 * datasets installed — even though it is dataset-immutable.
 */
function buildSolverTagItems(store: Store): Map<string, Record<string, string[]>> {
  const byDataset = new Map<string, Record<string, string[]>>()
  for (const tiId of store.getRowIds('tagItems')) {
    const row = store.getRow('tagItems', tiId)
    const datasetId = row.datasetId as string
    let tags = byDataset.get(datasetId)
    if (!tags) {
      tags = {}
      byDataset.set(datasetId, tags)
    }
    const tagId = row.tagId as string
    const list = tags[tagId]
    if (list) list.push(row.itemId as string)
    else tags[tagId] = [row.itemId as string]
  }
  return byDataset
}

/** Items with any gathering data, plus every log item a tree species yields.
 * Mirrors the classification in `gathering-data.ts`; a rock whose block has no
 * rubble is excluded there and here, since it can't be priced. */
function buildGatherableItemIds(store: Store): Set<string> {
  const out = new Set<string>()
  for (const itemId of store.getRowIds('items')) {
    const row = store.getRow('items', itemId)
    const minable =
      ((row.minableHardness as number) ?? 0) > 0 && ((row.rubbleItemsPerBlock as number) ?? 0) > 0
    if (minable || row.requiresShovel === true || ((row.animalHealth as number) ?? 0) > 0) {
      out.add(itemId)
    }
  }
  for (const speciesId of store.getRowIds('treeSpecies')) {
    const logItemId = store.getCell('treeSpecies', speciesId, 'logItemId') as string
    if (logItemId) out.add(logItemId)
  }
  return out
}

/**
 * Bucket the `craftingTablePluginModules` join by crafting table.
 *
 * Replaces two hand-rolled copies of this scan (`CraftingTablesPanel` and
 * `AdHocRecipeInputs`), each of which walked every join row in the store for
 * every table it rendered — and, since v14, would have walked every
 * `pluginModuleBonuses` row per module on top of that. Doing it once per
 * dataset import instead makes the cost independent of how many tables the
 * build has.
 */
function buildModulesByCraftingTableId(store: Store): Map<string, CraftingTableModule[]> {
  const map = new Map<string, CraftingTableModule[]>()
  for (const joinId of store.getRowIds('craftingTablePluginModules')) {
    const join = store.getRow('craftingTablePluginModules', joinId)
    const moduleId = join.pluginModuleId as string
    const module = store.getRow('pluginModules', moduleId)
    // A join row pointing at a module that no longer exists (or was imported
    // without a name) would otherwise render as a blank, unselectable option.
    if (!module?.name) continue
    const ctId = join.craftingTableId as string
    let list = map.get(ctId)
    if (!list) {
      list = []
      map.set(ctId, list)
    }
    list.push({
      id: moduleId,
      datasetId: module.datasetId as string,
      name: module.name as string,
      slot: (module.slot as ModuleSlot) ?? 'Specialty',
      isDeprecated: module.isDeprecated === true,
    })
  }
  return map
}

/**
 * Modules the given crafting table accepts, filtered to one dataset.
 *
 * The dataset filter is what the two open-coded scans this replaces were
 * missing. Row ids are UUIDs, so in practice a table id can only ever match its
 * own dataset's join rows — but the app keeps several datasets installed side by
 * side, and "correct because ids happen not to collide" is not a property worth
 * relying on when the filter costs one comparison per candidate.
 */
export function craftingTableModules(
  store: Store,
  datasetId: string,
  craftingTableId: string
): CraftingTableModule[] {
  const all = getGameDataIndexes(store).modulesByCraftingTableId.get(craftingTableId)
  if (!all) return []
  return all.filter((m) => m.datasetId === datasetId)
}

/** Bucket `itemSalvage` / `recipeGarbage` by their owning row. Both tables are
 * empty on v11–v13, so this costs nothing there. */
function buildGarbageIndex(
  store: Store,
  table: 'itemSalvage' | 'recipeGarbage',
  ownerCell: 'itemId' | 'recipeId'
): Map<string, GarbageQuantityRow[]> {
  const map = new Map<string, GarbageQuantityRow[]>()
  for (const rowId of store.getRowIds(table)) {
    const row = store.getRow(table, rowId)
    const ownerId = row[ownerCell] as string
    let list = map.get(ownerId)
    if (!list) {
      list = []
      map.set(ownerId, list)
    }
    list.push({ itemId: row.garbageItemId as string, quantity: row.quantity as number })
  }
  return map
}

function build(store: Store): GameDataIndexes {
  const recipeIndexes = buildRecipeIndexes(store)
  const productItemIdsByRecipeId = buildRecipeProductItemIds(store)
  const ingredientItemIdsByRecipeId = buildRecipeIngredientItemIds(store)
  return {
    productItemIdsByRecipeId,
    ingredientItemIdsByRecipeId,
    unlockingTalentsByRecipeId: buildRecipeUnlockingTalents(store),
    tagIdsByItemId: buildTagIdsByItemId(store),
    itemIdsByTagId: buildItemIdsByTagId(store),
    solverTagItemsByDatasetId: buildSolverTagItems(store),
    primaryRecipeIdsByItemId: buildPrimaryRecipeIdsByItemId(
      productItemIdsByRecipeId,
      ingredientItemIdsByRecipeId
    ),
    canonicalFamilyByItemId: buildCanonicalFamilyByItemId(
      store,
      productItemIdsByRecipeId,
      ingredientItemIdsByRecipeId
    ),
    recipeIndexes,
    talentsBySkillId: recipeIndexes.talentsBySkillId,
    bonusesByTalentId: recipeIndexes.bonusesByTalentId,
    talentDetailsBySkillId: buildTalentDetailsBySkillId(store),
    gatherableItemIds: buildGatherableItemIds(store),
    modulesByCraftingTableId: buildModulesByCraftingTableId(store),
    salvageByItemId: buildGarbageIndex(store, 'itemSalvage', 'itemId'),
    garbageByRecipeId: buildGarbageIndex(store, 'recipeGarbage', 'recipeId'),
  }
}

/**
 * Returns indexes derived purely from the given game-data store. Cached for
 * the lifetime of the store; the cache is dropped automatically the first
 * time the store mutates after a build (dataset import). Callers must treat
 * the returned object as read-only.
 *
 * Avoids the per-render rebuild cost (~20–35 ms total) of indexing
 * recipeElements, modifiers, talentBonuses, and tagItems on every change to
 * the build store, which is the dominant cost during skill/recipe edits.
 */
export function getGameDataIndexes(store: Store): GameDataIndexes {
  let entry = cache.get(store)
  if (!entry) {
    entry = build(store)
    cache.set(store, entry)
    if (!wired.has(store)) {
      wired.add(store)
      store.addTablesListener(() => {
        cache.delete(store)
      })
    }
  }
  return entry
}

/**
 * Test-only escape hatch to drop the cache for a specific store. Production
 * code never needs this — the auto-invalidation listener handles real
 * mutations.
 */
export function clearGameDataIndexesCache(store?: Store) {
  if (store) cache.delete(store)
}
