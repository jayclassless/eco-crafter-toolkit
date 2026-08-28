import type { Store } from 'tinybase'

import type { Compare } from '@/lib/collator'
import { getGameDataIndexes } from '@/lib/game-data-indexes'

export type DepNode = DepRootRecipeNode | DepItemNode

interface DepRootRecipeNode {
  kind: 'root-recipe'
  nodeId: string
  recipeId: string
  /** First product of the recipe that is not also an ingredient. May be ''
   * for malformed recipes — the renderer falls back to a generic icon. */
  primaryItemId: string
  /** First-encounter ingredient nodes only; later parents that depend on
   * the same item produce a shortcut edge instead of a duplicate subtree. */
  children: DepItemNode[]
}

export interface DepItemNode {
  kind: 'item'
  nodeId: string
  /** The item / tag id this node represents. For tags, the rendered
   * children belong to `selectedTagItemId`'s primary recipe. */
  itemId: string
  isTag: boolean
  /** For tags only: alphabetically-sorted member item ids. null for items. */
  tagItemIds: string[] | null
  /** For tags only: the resolved member id (user-selected or first-alpha). */
  selectedTagItemId: string | null
  /** Recipes producing the resolved item (item itself, or selected tag
   * member) as primary product. Sorted alphabetically by localized recipe
   * name. */
  availableRecipeIds: string[]
  /** The recipe driving this node's children. null for leaves and items
   * with no producing recipe. */
  selectedRecipeId: string | null
  /** First-encounter children only — see DepRootRecipeNode.children. */
  children: DepItemNode[]
}

export interface ShortcutEdge {
  fromNodeId: string
  toNodeId: string
  /** True when the target is on the current DFS path (a real circular
   * dependency). False when the target is just a previously-visited node
   * elsewhere in the graph (shared subtree). The renderer styles cycles
   * distinctly to flag the unusual structure. */
  isCycle: boolean
}

interface DependencyTree {
  root: DepNode
  shortcutEdges: ShortcutEdge[]
}

export type DependencyTreeStart =
  | { type: 'recipe'; recipeId: string }
  | { type: 'item'; itemId: string }

const SEL_RECIPE = 'recipe:'
const SEL_TAG_ITEM = 'tag-item:'

interface BuildContext {
  store: Store
  primaryRecipeIdsByItemId: Map<string, string[]>
  itemIdsByTagId: Map<string, string[]>
  /** recipeId → its recipeElement rows. Avoids re-scanning the whole
   * recipeElements table once per expanded node (O(nodes × all-elements)). */
  elementsByRecipeId: Map<string, Array<{ id: string; row: Record<string, unknown> }>>
  selections: Map<string, string>
  getName: (entityType: string, entityId: string) => string
  /** Display-order comparator for the active locale (`useLocalization().compare`). */
  compare: Compare
  shortcutEdges: ShortcutEdge[]
  /** Map<key, nodeId> for every item/tag we have created a node for so
   * far, anywhere in the graph. Lookups here drive deduplication: a child
   * we'd otherwise create that's already here becomes a shortcut edge. */
  visited: Map<string, string>
  /** Subset of `visited` representing the current DFS path. Used to
   * classify shortcuts as cycles (same path) vs shared (elsewhere). */
  pathKeys: Set<string>
  /** Item ids that should render as leaves regardless of producing
   * recipes — gathered/foraged/excavated raw materials. */
  rawLeafItemIds: Set<string>
}

function nodeKey(itemOrTagId: string, isTag: boolean): string {
  return isTag ? `t:${itemOrTagId}` : `i:${itemOrTagId}`
}

/**
 * Build a recipe dependency graph as a tree of first-encounter nodes plus
 * a list of shortcut edges for repeats.
 *
 * Each item / tag appears at most once in the resulting node tree. When an
 * ingredient resolves to something already in the graph, the recursion
 * stops there and an edge is recorded in `shortcutEdges` from the parent
 * to the existing node — flagged as a cycle if the target is on the
 * current DFS path, otherwise as a shared dependency.
 *
 * Selections (recipe choice for multi-recipe items, tag-member choice for
 * tag ingredients) are keyed by node id, which matches the item/tag id —
 * so a selection on one occurrence of an item applies everywhere it's
 * referenced in the graph.
 */
export function buildDependencyTree(
  store: Store,
  start: DependencyTreeStart,
  selections: Map<string, string>,
  getName: (entityType: string, entityId: string) => string,
  compare: Compare
): DependencyTree {
  const indexes = getGameDataIndexes(store)
  const ctx: BuildContext = {
    store,
    primaryRecipeIdsByItemId: indexes.primaryRecipeIdsByItemId,
    itemIdsByTagId: indexes.itemIdsByTagId,
    elementsByRecipeId: indexes.recipeIndexes.elementsByRecipeId,
    selections,
    getName,
    compare,
    shortcutEdges: [],
    visited: new Map(),
    pathKeys: new Set(),
    rawLeafItemIds: indexes.rawLeafItemIds,
  }

  if (start.type === 'recipe') {
    const recipeId = start.recipeId
    const productItemIds = indexes.productItemIdsByRecipeId.get(recipeId) ?? []
    const ingredientSet = indexes.ingredientItemIdsByRecipeId.get(recipeId)
    const primaryItemId =
      productItemIds.find((id) => !ingredientSet?.has(id)) ?? productItemIds[0] ?? ''
    const rootNodeId = `r:${recipeId}`

    // Pre-mark the primary product as visited at the root nodeId so any
    // ingredient that loops back to it (cycle) emits a back-edge to the
    // root rather than creating a duplicate item node.
    if (primaryItemId) {
      const primaryKey = nodeKey(primaryItemId, false)
      ctx.visited.set(primaryKey, rootNodeId)
      ctx.pathKeys.add(primaryKey)
    }

    const children = expandIngredients(ctx, recipeId, rootNodeId)

    if (primaryItemId) ctx.pathKeys.delete(nodeKey(primaryItemId, false))

    return {
      root: { kind: 'root-recipe', nodeId: rootNodeId, recipeId, primaryItemId, children },
      shortcutEdges: ctx.shortcutEdges,
    }
  }

  // Item-rooted graph (MaterialDialog case). The root is created inline —
  // it isn't a child of anything, so no parent edge to record.
  const itemRow = ctx.store.getRow('items', start.itemId)
  const isTag = !!itemRow?.isTag
  const key = nodeKey(start.itemId, isTag)
  const root = createItemNode(ctx, start.itemId, key)
  return { root, shortcutEdges: ctx.shortcutEdges }
}

function expandIngredients(
  ctx: BuildContext,
  recipeId: string,
  parentNodeId: string
): DepItemNode[] {
  interface Ingredient {
    itemOrTagId: string
    index: number
  }
  const ingredients: Ingredient[] = []
  for (const { row } of ctx.elementsByRecipeId.get(recipeId) ?? []) {
    if (row.isProduct) continue
    ingredients.push({
      itemOrTagId: row.itemOrTagId as string,
      index: (row.index as number) ?? 0,
    })
  }
  ingredients.sort((a, b) => a.index - b.index)

  const children: DepItemNode[] = []
  for (const ing of ingredients) {
    const child = visitChild(ctx, parentNodeId, ing.itemOrTagId)
    if (child) children.push(child)
  }
  return children
}

/**
 * Visit a child ingredient. If it resolves to something already in the
 * graph, record a shortcut edge and return null (no new node). Otherwise
 * create the node and recurse into its children.
 */
function visitChild(
  ctx: BuildContext,
  parentNodeId: string,
  itemOrTagId: string
): DepItemNode | null {
  const itemRow = ctx.store.getRow('items', itemOrTagId)
  const isTag = !!itemRow?.isTag
  const key = nodeKey(itemOrTagId, isTag)

  if (ctx.pathKeys.has(key)) {
    const existing = ctx.visited.get(key)
    if (existing)
      ctx.shortcutEdges.push({ fromNodeId: parentNodeId, toNodeId: existing, isCycle: true })
    return null
  }
  if (ctx.visited.has(key)) {
    const existing = ctx.visited.get(key)
    if (existing)
      ctx.shortcutEdges.push({ fromNodeId: parentNodeId, toNodeId: existing, isCycle: false })
    return null
  }

  return createItemNode(ctx, itemOrTagId, key)
}

/** Create a fresh item / tag node. Caller has already verified the key is
 * not in `visited` or `pathKeys`. */
function createItemNode(ctx: BuildContext, itemOrTagId: string, key: string): DepItemNode {
  const itemRow = ctx.store.getRow('items', itemOrTagId)
  const isTag = !!itemRow?.isTag
  const nodeId = key
  ctx.visited.set(key, nodeId)
  ctx.pathKeys.add(key)

  let resolvedItemId = itemOrTagId
  let tagItemIds: string[] | null = null
  let selectedTagItemId: string | null = null
  if (isTag) {
    const members = ctx.itemIdsByTagId.get(itemOrTagId) ?? []
    tagItemIds = [...members].sort((a, b) =>
      ctx.compare(ctx.getName('item', a), ctx.getName('item', b))
    )
    const sel = ctx.selections.get(SEL_TAG_ITEM + nodeId)
    selectedTagItemId = sel && tagItemIds.includes(sel) ? sel : (tagItemIds[0] ?? null)
    if (selectedTagItemId) resolvedItemId = selectedTagItemId
  }

  // Raw-material items (gathered/foraged/excavated) terminate the graph
  // even when a recipe technically produces them — see RAW_LEAF_TAG_NAMES.
  const recipeIdsRaw = ctx.rawLeafItemIds.has(resolvedItemId)
    ? []
    : (ctx.primaryRecipeIdsByItemId.get(resolvedItemId) ?? [])
  const availableRecipeIds = [...recipeIdsRaw].sort((a, b) =>
    ctx.compare(ctx.getName('recipe', a), ctx.getName('recipe', b))
  )

  let selectedRecipeId: string | null = null
  let children: DepItemNode[] = []
  if (availableRecipeIds.length > 0) {
    const sel = ctx.selections.get(SEL_RECIPE + nodeId)
    selectedRecipeId = sel && availableRecipeIds.includes(sel) ? sel : availableRecipeIds[0]
    children = expandIngredients(ctx, selectedRecipeId, nodeId)
  }

  ctx.pathKeys.delete(key)

  return {
    kind: 'item',
    nodeId,
    itemId: itemOrTagId,
    isTag,
    tagItemIds,
    selectedTagItemId,
    availableRecipeIds,
    selectedRecipeId,
    children,
  }
}
