// Which items a player can actually obtain given a set of unlocked skills.
//
// The Housing Score optimizer's "Unlocked Skills" constraint used to ask only
// "does some recipe producing this item belong to an unlocked skill?", which is
// a one-hop test: it admitted an Elk Mount on day 0 because Hunting was
// unlocked, ignoring that the recipe needs Composite Lumber and Fabric from two
// locked skills. The answer has to be transitive, so it is a graph closure
// rather than a lookup.
//
// This module is pure and store-free, like `housing-optimize.ts` — the graph is
// assembled from the store in `game-data-indexes.ts` and cached there, so a
// closure run costs nothing but the fixpoint itself.

/** One recipe, reduced to what reachability depends on. */
export interface ReachabilityRecipe {
  /** '' when the recipe requires no skill, which makes it always usable. */
  skillId: string
  /** The crafting table's ITEM id, not its `craftingTables` row id — the table
   * has to be built before the recipe can be run, so it behaves as an extra
   * ingredient. '' when the recipe names no table. */
  craftingTableItemId: string
  /** Raw `recipeElements.itemOrTagId` values, so these may be tag ids. */
  ingredientIds: string[]
  productIds: string[]
}

export interface ReachabilityGraph {
  recipes: ReachabilityRecipe[]
  /** tag id -> member item ids. A tag ingredient is satisfied by ANY member. */
  tagMembers: Map<string, string[]>
  /** Items obtainable from the world with no recipe at all — mined, dug,
   * hunted, chopped, foraged — plus the starter items a player spawns with.
   * Gathering is never skill-gated (see the note in `game-constants.ts`), so
   * these seed every closure regardless of the skill selection. */
  rawItemIds: Set<string>
}

/**
 * Every item obtainable under `unlockedSkillIds`.
 *
 * Seeds with the world-gathered raw materials, then repeatedly admits any
 * recipe whose skill is unlocked, whose crafting table is already reachable and
 * whose every ingredient is already reachable — until a pass adds nothing.
 * Same fixpoint shape as the price solver's pass loop, but the reachable set
 * only ever GROWS, so this converges without needing solve()'s `maxPasses`
 * guard: each pass either adds an item or ends the loop, and there are finitely
 * many items. Recipe cycles simply never fire.
 *
 * `unlockedSkillIds: null` means every skill is unlocked.
 */
export function computeReachableItemIds(
  graph: ReachabilityGraph,
  unlockedSkillIds: ReadonlySet<string> | null
): Set<string> {
  const reachable = new Set(graph.rawItemIds)
  const { recipes, tagMembers } = graph

  // A recipe whose skill is locked can never fire, so drop it once rather than
  // re-testing it on every pass.
  const pending = unlockedSkillIds
    ? recipes.filter((r) => r.skillId === '' || unlockedSkillIds.has(r.skillId))
    : recipes.slice()

  const satisfied = (itemOrTagId: string): boolean => {
    if (reachable.has(itemOrTagId)) return true
    const members = tagMembers.get(itemOrTagId)
    return members !== undefined && members.some((id) => reachable.has(id))
  }

  // Each pass compacts the recipes that are still blocked back down to the
  // front of `pending` and drops the ones that fired — a recipe that fired
  // stays fired, since its products are in `reachable` permanently and it can
  // never contribute again. Without that, the closure would re-scan all ~1500
  // recipes on each of up to ~18 passes.
  for (;;) {
    let write = 0
    for (let read = 0; read < pending.length; read++) {
      const recipe = pending[read]
      const usable =
        (recipe.craftingTableItemId === '' || reachable.has(recipe.craftingTableItemId)) &&
        recipe.ingredientIds.every(satisfied)
      if (!usable) {
        pending[write++] = recipe
        continue
      }
      for (const productId of recipe.productIds) reachable.add(productId)
    }
    // No recipe fired, so nothing was added, so no blocked recipe can ever
    // unblock. This is the fixpoint.
    if (write === pending.length) break
    pending.length = write
  }

  return reachable
}
