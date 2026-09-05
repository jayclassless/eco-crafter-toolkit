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
import { compareKeys } from '@/lib/collator'
import type { ReachabilityGraph, ReachabilityRecipe } from '@/lib/item-reachability'
import type { GatheringConstants, ModuleSlot, RoomCategory, RoomTier } from '@/types/game-data'

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
  /** Distinct skills that can craft an item — the non-empty `recipes.skillId`
   * of every recipe that OUTPUTS it, minus recipes that also consume it
   * (reprocessing, not production). Built from all products rather than just
   * the primary one: Glass is produced by both Glassworking and Recycling, and
   * both are worth showing. Items with no producing recipe are absent. */
  skillIdsByItemId: Map<string, string[]>
  /** Housing furnishings and room-material items, per dataset. Dataset-keyed
   * deliberately — unlike `primaryRecipeIdsByItemId`, which is not filtered —
   * because these drive what a page renders and the app keeps several datasets
   * installed side by side. */
  housingItemIdsByDatasetId: Map<string, string[]>
  buildingMaterialItemIdsByDatasetId: Map<string, string[]>
  /** Room categories in the game's own declaration order, and the tier table,
   * per dataset, with the JSON-encoded columns already rehydrated. */
  roomCategoriesByDatasetId: Map<string, RoomCategory[]>
  roomTiersByDatasetId: Map<string, RoomTier[]>
  /** A single object per dataset, not a list — this table is a singleton.
   * Absent for datasets imported before the section existed; consumers fall back
   * to the constants in `game-constants.ts`. */
  gatheringConstantsByDatasetId: Map<string, GatheringConstants>
  /** Items that should terminate a dependency expansion — gathered, foraged or
   * excavated raw materials, identified by tag. Used by the recipe dependency
   * tree, which used to recompute this on every call. */
  rawLeafItemIds: Set<string>
  /** Everything obtainable from the world with no recipe: `rawLeafItemIds`
   * plus the per-item gathering markers, plus items nothing produces, plus the
   * starter items. Seeds the reachability closure. */
  rawMaterialItemIds: Set<string>
  /** Per-dataset crafting graph for `computeReachableItemIds`. Dataset-keyed
   * because a closure must never combine two datasets' recipes. */
  reachabilityGraphByDatasetId: Map<string, ReachabilityGraph>
  /** Skills that craft at least one recipe, per dataset. The optimizer's
   * unlocked-skill selector needs these — a skill can gate an intermediate
   * material without ever crafting a furnishing, which makes it load-bearing
   * for reachability even though it would never appear in a list built from
   * furnishings alone. Excludes the profession skills, which craft nothing. */
  craftingSkillIdsByDatasetId: Map<string, string[]>
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
    // `family` is a raw (unlocalized) key and the sort only picks a stable
    // winner, so this stays locale-independent.
    list.sort((a, b) => b.size - a.size || compareKeys(a.family, b.family))
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

/** Items carrying any of these tag names are gathered/foraged from the world —
 * even if a recipe produces one, it is obtainable without that recipe. */
const RAW_LEAF_TAG_NAMES: readonly string[] = ['NaturalFiber', 'Crop', 'Harvestable']
/** `Excavatable` items are also raw — UNLESS they're processed forms
 * (CrushedRock / ConcentratedOre), which legitimately come from recipes. */
const EXCAVATABLE_TAG_NAME = 'Excavatable'
const EXCAVATABLE_EXCLUDE_TAG_NAMES: readonly string[] = ['CrushedRock', 'ConcentratedOre']

/**
 * Items a player starts with, by raw game name.
 *
 * The Campsite is the table for the Workbench and Tool Bench recipes, but is
 * itself crafted at a Tailoring Table — so on paper the crafting graph has no
 * entry point and a reachability closure bottoms out at a handful of flowers.
 * In game every player spawns holding one. The dataset does not encode
 * "starting item" in any form, so it has to be named here.
 */
const STARTER_ITEM_NAMES: readonly string[] = ['CampsiteItem']

/**
 * Items that are terminal in a crafting graph because the world provides them.
 *
 * Tag-based only; `buildRawMaterialItemIds` widens this with the per-item
 * gathering markers. Kept separate because the dependency tree wants exactly
 * this narrower notion — an item it should stop expanding — while reachability
 * wants everything obtainable by any means.
 */
function buildRawLeafItemIds(store: Store, tagIdsByItemId: Map<string, string[]>): Set<string> {
  const tagIdByName = new Map<string, string>()
  for (const id of store.getRowIds('items')) {
    const row = store.getRow('items', id)
    if (row.isTag) tagIdByName.set(row.name as string, id)
  }
  const alwaysLeafTagIds = new Set<string>()
  for (const name of RAW_LEAF_TAG_NAMES) {
    const id = tagIdByName.get(name)
    if (id) alwaysLeafTagIds.add(id)
  }
  const excavatableId = tagIdByName.get(EXCAVATABLE_TAG_NAME)
  const excavatableExcludeIds = new Set<string>()
  for (const name of EXCAVATABLE_EXCLUDE_TAG_NAMES) {
    const id = tagIdByName.get(name)
    if (id) excavatableExcludeIds.add(id)
  }

  const result = new Set<string>()
  for (const [itemId, tagIds] of tagIdsByItemId) {
    let qualifies = tagIds.some((tid) => alwaysLeafTagIds.has(tid))
    if (!qualifies && excavatableId && tagIds.includes(excavatableId)) {
      qualifies = !tagIds.some((tid) => excavatableExcludeIds.has(tid))
    }
    if (qualifies) result.add(itemId)
  }
  return result
}

/**
 * Everything obtainable without crafting, which seeds the reachability closure.
 *
 * No single signal is sufficient, so this is a union of four:
 *  1. `rawLeafItemIds` — the tag-based predicate above.
 *  2. Per-item gathering markers (minable / shovel / carcass / tree), plus the
 *     log of every tree species — the same classification `gatherableItemIds`
 *     uses, which alone misses every plant.
 *  3. Plant markers. A plant that is ALSO produced by a recipe is caught by
 *     nothing else: PlantFibers is picked from the world but is additionally
 *     an output of Cotton Lint and Flax Fiber, so both the marker set above and
 *     the "nothing produces it" rule below skip it — and missing it collapses
 *     the whole day-0 chain, since it gates the Research Table.
 *  4. Items no recipe produces at all. Catches the fish, acorns and flowers
 *     that carry no marker because the extractor does not parse fishing.
 *
 * The union errs toward admitting: a wrongly-included raw material makes the
 * optimizer slightly permissive, while a wrongly-excluded one silently deletes
 * a whole branch of the tech tree.
 */
function buildRawMaterialItemIds(
  store: Store,
  rawLeafItemIds: Set<string>,
  productItemIdsByRecipeId: Map<string, string[]>
): Set<string> {
  const produced = new Set<string>()
  for (const productIds of productItemIdsByRecipeId.values()) {
    for (const id of productIds) produced.add(id)
  }

  const result = new Set(rawLeafItemIds)
  const starterNames = new Set(STARTER_ITEM_NAMES)
  for (const itemId of store.getRowIds('items')) {
    const row = store.getRow('items', itemId)
    // Tags are rows in `items` too, but a tag is never itself obtainable — it
    // is satisfied through its members.
    if (row.isTag) continue
    if (
      ((row.minableHardness as number) ?? 0) > 0 ||
      row.requiresShovel === true ||
      ((row.animalHealth as number) ?? 0) > 0 ||
      row.isTree === true ||
      ((row.maturityAgeDays as number) ?? 0) > 0 ||
      ((row.primaryResourceMin as number) ?? 0) > 0 ||
      starterNames.has(row.name as string) ||
      !produced.has(itemId)
    ) {
      result.add(itemId)
    }
  }
  for (const speciesId of store.getRowIds('treeSpecies')) {
    const logItemId = store.getCell('treeSpecies', speciesId, 'logItemId') as string
    if (logItemId) result.add(logItemId)
  }
  return result
}

/**
 * The per-dataset crafting graph the reachability closure walks.
 *
 * The crafting table is folded in as an item id rather than left as a
 * `craftingTables` row id: the closure treats it as an implicit ingredient, and
 * `craftingTables` rows carry a fresh uuid with no link back to the item — only
 * a matching `name` — so the join has to happen here.
 */
function buildReachabilityGraphs(
  store: Store,
  productItemIdsByRecipeId: Map<string, string[]>,
  ingredientItemIdsByRecipeId: Map<string, Set<string>>,
  itemIdsByTagId: Map<string, string[]>,
  rawMaterialItemIds: Set<string>
): Map<string, ReachabilityGraph> {
  const itemIdByDatasetName = new Map<string, string>()
  const rawByDataset = new Map<string, Set<string>>()
  for (const itemId of store.getRowIds('items')) {
    const row = store.getRow('items', itemId)
    const datasetId = (row.datasetId as string) ?? ''
    if (!datasetId) continue
    if (!row.isTag) itemIdByDatasetName.set(`${datasetId} ${row.name as string}`, itemId)
    if (rawMaterialItemIds.has(itemId)) {
      let set = rawByDataset.get(datasetId)
      if (!set) {
        set = new Set()
        rawByDataset.set(datasetId, set)
      }
      set.add(itemId)
    }
  }

  const tagsByDataset = new Map<string, Map<string, string[]>>()
  for (const [tagId, itemIds] of itemIdsByTagId) {
    const datasetId = (store.getCell('items', tagId, 'datasetId') as string) ?? ''
    if (!datasetId) continue
    let map = tagsByDataset.get(datasetId)
    if (!map) {
      map = new Map()
      tagsByDataset.set(datasetId, map)
    }
    map.set(tagId, itemIds)
  }

  // A table whose name resolves to no item leaves the recipe table-unrestricted
  // rather than permanently blocked: import validates this link, so a miss here
  // means malformed data, and over-blocking would silently empty the optimizer.
  const tableItemIdByTableId = new Map<string, string>()
  for (const ctId of store.getRowIds('craftingTables')) {
    const row = store.getRow('craftingTables', ctId)
    const key = `${row.datasetId as string} ${row.name as string}`
    tableItemIdByTableId.set(ctId, itemIdByDatasetName.get(key) ?? '')
  }

  const byDataset = new Map<string, ReachabilityGraph>()
  for (const recipeId of store.getRowIds('recipes')) {
    const row = store.getRow('recipes', recipeId)
    const datasetId = (row.datasetId as string) ?? ''
    if (!datasetId) continue
    let graph = byDataset.get(datasetId)
    if (!graph) {
      graph = {
        recipes: [],
        tagMembers: tagsByDataset.get(datasetId) ?? new Map(),
        rawItemIds: rawByDataset.get(datasetId) ?? new Set(),
      }
      byDataset.set(datasetId, graph)
    }
    const recipe: ReachabilityRecipe = {
      skillId: (row.skillId as string) ?? '',
      craftingTableItemId: tableItemIdByTableId.get(row.craftingTableId as string) ?? '',
      ingredientIds: [...(ingredientItemIdsByRecipeId.get(recipeId) ?? [])],
      productIds: productItemIdsByRecipeId.get(recipeId) ?? [],
    }
    graph.recipes.push(recipe)
  }
  return byDataset
}

function buildCraftingSkillIdsByDatasetId(store: Store): Map<string, string[]> {
  const sets = new Map<string, Set<string>>()
  for (const recipeId of store.getRowIds('recipes')) {
    const row = store.getRow('recipes', recipeId)
    const datasetId = (row.datasetId as string) ?? ''
    const skillId = (row.skillId as string) ?? ''
    if (!datasetId || !skillId) continue
    let set = sets.get(datasetId)
    if (!set) {
      set = new Set()
      sets.set(datasetId, set)
    }
    set.add(skillId)
  }
  const map = new Map<string, string[]>()
  for (const [datasetId, set] of sets) map.set(datasetId, [...set])
  return map
}

function buildSkillIdsByItemId(
  store: Store,
  productItemIdsByRecipeId: Map<string, string[]>,
  ingredientItemIdsByRecipeId: Map<string, Set<string>>
): Map<string, string[]> {
  const sets = new Map<string, Set<string>>()
  for (const [recipeId, productIds] of productItemIdsByRecipeId) {
    const skillId = (store.getCell('recipes', recipeId, 'skillId') as string) ?? ''
    if (!skillId) continue
    const ingredients = ingredientItemIdsByRecipeId.get(recipeId)
    for (const itemId of productIds) {
      // A recipe that consumes what it produces is reprocessing it, not a way
      // to obtain it — same exclusion MaterialDialog's "Produced by" applies.
      if (ingredients?.has(itemId)) continue
      let set = sets.get(itemId)
      if (!set) {
        set = new Set()
        sets.set(itemId, set)
      }
      set.add(skillId)
    }
  }
  const map = new Map<string, string[]>()
  for (const [itemId, set] of sets) map.set(itemId, [...set].sort(compareKeys))
  return map
}

/** Split the housing items of every dataset into furnishings and room
 * materials in one pass over `items`. */
function buildHousingItemIds(store: Store): {
  housing: Map<string, string[]>
  materials: Map<string, string[]>
} {
  const housing = new Map<string, string[]>()
  const materials = new Map<string, string[]>()
  const push = (map: Map<string, string[]>, datasetId: string, itemId: string) => {
    let list = map.get(datasetId)
    if (!list) {
      list = []
      map.set(datasetId, list)
    }
    list.push(itemId)
  }
  for (const itemId of store.getRowIds('items')) {
    const row = store.getRow('items', itemId)
    const datasetId = (row.datasetId as string) ?? ''
    if (!datasetId) continue
    if (row.housingCategory) push(housing, datasetId, itemId)
    // Presence is the boolean, never `buildingBlockTier > 0` — tier 0 is real.
    if (row.isBuildingMaterial === true) push(materials, datasetId, itemId)
  }
  return { housing, materials }
}

function parseJsonCell<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || raw === '') return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function buildRoomCategoriesByDatasetId(store: Store): Map<string, RoomCategory[]> {
  const map = new Map<string, RoomCategory[]>()
  for (const rowId of store.getRowIds('roomCategories')) {
    const row = store.getRow('roomCategories', rowId)
    const datasetId = (row.datasetId as string) ?? ''
    if (!datasetId) continue
    let list = map.get(datasetId)
    if (!list) {
      list = []
      map.set(datasetId, list)
    }
    list.push({
      id: rowId,
      datasetId,
      name: (row.name as string) ?? '',
      color: (row.color as string) ?? '',
      index: (row.index as number) ?? 0,
      affectsPropertyTypes: parseJsonCell<string[]>(row.affectsPropertyTypes, []),
      supportingRoomCategoryNames: parseJsonCell<string[]>(row.supportingRoomCategoryNames, []),
      maxSupportPercentOfPrimary: (row.maxSupportPercentOfPrimary as number) ?? 1,
      maxSupportPercentOfPrimaryPerCategory: parseJsonCell<Record<string, number>>(
        row.maxSupportPercentOfPrimaryPerCategory,
        {}
      ),
      capToPercentOfRestOfProperty: (row.capToPercentOfRestOfProperty as number) ?? 0,
      canBeRoomCategory: row.canBeRoomCategory !== false,
      supportForAnyRoomType: row.supportForAnyRoomType === true,
      shouldCapFromRoomMaterials: row.shouldCapFromRoomMaterials !== false,
      canAutoChooseCategory: row.canAutoChooseCategory !== false,
      negatesValue: row.negatesValue === true,
    })
  }
  // The game's declaration order, so the UI groups the way the game does.
  for (const list of map.values()) list.sort((a, b) => a.index - b.index)
  return map
}

function buildGatheringConstantsByDatasetId(store: Store): Map<string, GatheringConstants> {
  const map = new Map<string, GatheringConstants>()
  for (const rowId of store.getRowIds('gatheringConstants')) {
    const row = store.getRow('gatheringConstants', rowId)
    const datasetId = (row.datasetId as string) ?? ''
    if (!datasetId) continue
    map.set(datasetId, {
      id: rowId,
      datasetId,
      bowHeadshotMultiplier: (row.bowHeadshotMultiplier as number) ?? 0,
      bowHeadshotMultiplierDeadeye: (row.bowHeadshotMultiplierDeadeye as number) ?? 0,
      maxTrunkPickupSize: (row.maxTrunkPickupSize as number) ?? 0,
    })
  }
  return map
}

function buildRoomTiersByDatasetId(store: Store): Map<string, RoomTier[]> {
  const map = new Map<string, RoomTier[]>()
  for (const rowId of store.getRowIds('roomTiers')) {
    const row = store.getRow('roomTiers', rowId)
    const datasetId = (row.datasetId as string) ?? ''
    if (!datasetId) continue
    let list = map.get(datasetId)
    if (!list) {
      list = []
      map.set(datasetId, list)
    }
    list.push({
      id: rowId,
      datasetId,
      tierVal: (row.tierVal as number) ?? 0,
      softCap: (row.softCap as number) ?? 0,
      hardCap: (row.hardCap as number) ?? 0,
      diminishingReturnPercent: (row.diminishingReturnPercent as number) ?? 0,
    })
  }
  for (const list of map.values()) list.sort((a, b) => a.tierVal - b.tierVal)
  return map
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
  const housingItemIds = buildHousingItemIds(store)
  const tagIdsByItemId = buildTagIdsByItemId(store)
  const itemIdsByTagId = buildItemIdsByTagId(store)
  const rawLeafItemIds = buildRawLeafItemIds(store, tagIdsByItemId)
  const rawMaterialItemIds = buildRawMaterialItemIds(
    store,
    rawLeafItemIds,
    productItemIdsByRecipeId
  )
  return {
    productItemIdsByRecipeId,
    ingredientItemIdsByRecipeId,
    unlockingTalentsByRecipeId: buildRecipeUnlockingTalents(store),
    tagIdsByItemId,
    itemIdsByTagId,
    rawLeafItemIds,
    rawMaterialItemIds,
    reachabilityGraphByDatasetId: buildReachabilityGraphs(
      store,
      productItemIdsByRecipeId,
      ingredientItemIdsByRecipeId,
      itemIdsByTagId,
      rawMaterialItemIds
    ),
    craftingSkillIdsByDatasetId: buildCraftingSkillIdsByDatasetId(store),
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
    skillIdsByItemId: buildSkillIdsByItemId(
      store,
      productItemIdsByRecipeId,
      ingredientItemIdsByRecipeId
    ),
    housingItemIdsByDatasetId: housingItemIds.housing,
    buildingMaterialItemIdsByDatasetId: housingItemIds.materials,
    roomCategoriesByDatasetId: buildRoomCategoriesByDatasetId(store),
    roomTiersByDatasetId: buildRoomTiersByDatasetId(store),
    gatheringConstantsByDatasetId: buildGatheringConstantsByDatasetId(store),
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
