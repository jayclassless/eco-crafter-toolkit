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

function build(store: Store): GameDataIndexes {
  const recipeIndexes = buildRecipeIndexes(store)
  return {
    productItemIdsByRecipeId: buildRecipeProductItemIds(store),
    ingredientItemIdsByRecipeId: buildRecipeIngredientItemIds(store),
    unlockingTalentsByRecipeId: buildRecipeUnlockingTalents(store),
    tagIdsByItemId: buildTagIdsByItemId(store),
    itemIdsByTagId: buildItemIdsByTagId(store),
    recipeIndexes,
    talentsBySkillId: recipeIndexes.talentsBySkillId,
    bonusesByTalentId: recipeIndexes.bonusesByTalentId,
    talentDetailsBySkillId: buildTalentDetailsBySkillId(store),
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
