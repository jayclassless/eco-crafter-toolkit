import { beforeEach, describe, expect, it } from 'vitest'

import { clearGameDataIndexesCache } from '@/lib/game-data-indexes'
import { buildDependencyTree, type DepItemNode } from '@/lib/recipe-dependency-tree'
import { createGameDataStore } from '@/stores/game-data-store'

let store: ReturnType<typeof createGameDataStore>

const DS = 'ds'

function setItem(id: string, opts: { name?: string; isTag?: boolean } = {}) {
  store.setRow('items', id, {
    id,
    datasetId: DS,
    name: opts.name ?? id,
    isTag: opts.isTag ?? false,
  })
}

function setRecipe(id: string, opts: { name?: string } = {}) {
  store.setRow('recipes', id, {
    id,
    datasetId: DS,
    name: opts.name ?? id,
  })
}

function setIngredient(
  reId: string,
  recipeId: string,
  itemOrTagId: string,
  qty: number,
  index = 0
) {
  store.setRow('recipeElements', reId, {
    id: reId,
    datasetId: DS,
    recipeId,
    itemOrTagId,
    isProduct: false,
    baseQuantity: qty,
    index,
  })
}

function setProduct(reId: string, recipeId: string, itemOrTagId: string, qty: number, index = 0) {
  store.setRow('recipeElements', reId, {
    id: reId,
    datasetId: DS,
    recipeId,
    itemOrTagId,
    isProduct: true,
    baseQuantity: qty,
    index,
  })
}

function setTagMember(tiId: string, tagId: string, itemId: string) {
  store.setRow('tagItems', tiId, { id: tiId, datasetId: DS, tagId, itemId })
}

const idGetName = (entityType: string, entityId: string): string => `${entityType}:${entityId}`

beforeEach(() => {
  store = createGameDataStore()
  clearGameDataIndexesCache(store)
})

describe('buildDependencyTree', () => {
  it('returns a recipe root with empty children when the recipe has no ingredients', () => {
    setRecipe('r1')
    setItem('out')
    setProduct('re1', 'r1', 'out', 1)
    clearGameDataIndexesCache(store)

    const { root } = buildDependencyTree(
      store,
      { type: 'recipe', recipeId: 'r1' },
      new Map(),
      idGetName
    )
    expect(root.kind).toBe('root-recipe')
    if (root.kind !== 'root-recipe') return
    expect(root.recipeId).toBe('r1')
    expect(root.primaryItemId).toBe('out')
    expect(root.children).toEqual([])
  })

  it('exposes a leaf item child when the ingredient has no producing recipe', () => {
    setItem('out')
    setItem('iron-ore')
    setRecipe('r1')
    setProduct('rp1', 'r1', 'out', 1)
    setIngredient('ri1', 'r1', 'iron-ore', 3)
    clearGameDataIndexesCache(store)

    const { root } = buildDependencyTree(
      store,
      { type: 'recipe', recipeId: 'r1' },
      new Map(),
      idGetName
    )
    expect(root.children.length).toBe(1)
    const child = root.children[0] as DepItemNode
    expect(child.kind).toBe('item')
    expect(child.itemId).toBe('iron-ore')
    expect(child.availableRecipeIds).toEqual([])
    expect(child.selectedRecipeId).toBeNull()
    expect(child.children).toEqual([])
  })

  it('auto-expands an item with a single primary recipe', () => {
    setItem('iron-bar')
    setItem('iron-ore')
    setItem('out')
    setRecipe('r-out')
    setProduct('rpa', 'r-out', 'out', 1)
    setIngredient('ria', 'r-out', 'iron-bar', 2)

    setRecipe('r-bar')
    setProduct('rpb', 'r-bar', 'iron-bar', 1)
    setIngredient('rib', 'r-bar', 'iron-ore', 4)
    clearGameDataIndexesCache(store)

    const { root } = buildDependencyTree(
      store,
      { type: 'recipe', recipeId: 'r-out' },
      new Map(),
      idGetName
    )
    expect(root.children.length).toBe(1)
    const bar = root.children[0] as DepItemNode
    expect(bar.itemId).toBe('iron-bar')
    expect(bar.selectedRecipeId).toBe('r-bar')
    expect(bar.children.length).toBe(1)
    const ore = bar.children[0] as DepItemNode
    expect(ore.itemId).toBe('iron-ore')
  })

  it('defaults to first alphabetical recipe when an item has multiple, honours selections override', () => {
    setItem('out')
    setItem('mat')
    setItem('a-mat')
    setItem('b-mat')
    setRecipe('r-out')
    setProduct('rpo', 'r-out', 'out', 1)
    setIngredient('rio', 'r-out', 'mat', 1)

    // Two recipes producing 'mat' as primary.
    setRecipe('r-mat-zebra', { name: 'Zebra Process' })
    setProduct('rpz', 'r-mat-zebra', 'mat', 1)
    setIngredient('riz', 'r-mat-zebra', 'a-mat', 5)

    setRecipe('r-mat-alpha', { name: 'Alpha Process' })
    setProduct('rpa', 'r-mat-alpha', 'mat', 1)
    setIngredient('ria', 'r-mat-alpha', 'b-mat', 7)
    clearGameDataIndexesCache(store)

    const localized = (entityType: string, entityId: string): string => {
      if (entityType === 'recipe' && entityId === 'r-mat-zebra') return 'Zebra Process'
      if (entityType === 'recipe' && entityId === 'r-mat-alpha') return 'Alpha Process'
      return idGetName(entityType, entityId)
    }

    // Default: alphabetically first (Alpha Process) wins.
    const { root: defaultRoot } = buildDependencyTree(
      store,
      { type: 'recipe', recipeId: 'r-out' },
      new Map(),
      localized
    )
    const matNode = defaultRoot.children[0] as DepItemNode
    expect(matNode.availableRecipeIds).toEqual(['r-mat-alpha', 'r-mat-zebra'])
    expect(matNode.selectedRecipeId).toBe('r-mat-alpha')
    expect((matNode.children[0] as DepItemNode).itemId).toBe('b-mat')

    // Override: pick zebra explicitly via selections map.
    const sel = new Map<string, string>([[`recipe:${matNode.nodeId}`, 'r-mat-zebra']])
    const { root: overrideRoot } = buildDependencyTree(
      store,
      { type: 'recipe', recipeId: 'r-out' },
      sel,
      localized
    )
    const matOverride = overrideRoot.children[0] as DepItemNode
    expect(matOverride.selectedRecipeId).toBe('r-mat-zebra')
    expect((matOverride.children[0] as DepItemNode).itemId).toBe('a-mat')
  })

  it('renders tag ingredients with a sorted member list, picks first by default, recurses into the resolved member', () => {
    setItem('out')
    setItem('wood', { isTag: true })
    setItem('oak')
    setItem('birch')
    setItem('saw')
    setRecipe('r-out')
    setProduct('rpo', 'r-out', 'out', 1)
    setIngredient('rio', 'r-out', 'wood', 2)

    setTagMember('ti1', 'wood', 'oak')
    setTagMember('ti2', 'wood', 'birch')

    setRecipe('r-oak')
    setProduct('rpoak', 'r-oak', 'oak', 1)
    setIngredient('rioak', 'r-oak', 'saw', 3)

    setRecipe('r-birch')
    setProduct('rpbirch', 'r-birch', 'birch', 1)
    setIngredient('ribirch', 'r-birch', 'saw', 9)
    clearGameDataIndexesCache(store)

    const localized = (entityType: string, entityId: string): string => {
      if (entityType === 'item' && entityId === 'oak') return 'Oak'
      if (entityType === 'item' && entityId === 'birch') return 'Birch'
      return idGetName(entityType, entityId)
    }

    const { root } = buildDependencyTree(
      store,
      { type: 'recipe', recipeId: 'r-out' },
      new Map(),
      localized
    )
    const woodNode = root.children[0] as DepItemNode
    expect(woodNode.isTag).toBe(true)
    expect(woodNode.tagItemIds).toEqual(['birch', 'oak'])
    expect(woodNode.selectedTagItemId).toBe('birch')
    expect(woodNode.selectedRecipeId).toBe('r-birch')
    expect((woodNode.children[0] as DepItemNode).itemId).toBe('saw')

    // Override the tag member to oak — children should now come from r-oak.
    const sel = new Map<string, string>([[`tag-item:${woodNode.nodeId}`, 'oak']])
    const { root: overrideRoot } = buildDependencyTree(
      store,
      { type: 'recipe', recipeId: 'r-out' },
      sel,
      localized
    )
    const woodOverride = overrideRoot.children[0] as DepItemNode
    expect(woodOverride.selectedTagItemId).toBe('oak')
    expect(woodOverride.selectedRecipeId).toBe('r-oak')
    expect((woodOverride.children[0] as DepItemNode).itemId).toBe('saw')
  })

  it('emits a cycle shortcut edge instead of duplicating when an item recurs on the DFS path', () => {
    // A ↔ B cycle: r-a produces A from B; r-b produces B from A.
    setItem('A')
    setItem('B')
    setRecipe('r-a')
    setProduct('rpa', 'r-a', 'A', 1)
    setIngredient('ria', 'r-a', 'B', 1)
    setRecipe('r-b')
    setProduct('rpb', 'r-b', 'B', 1)
    setIngredient('rib', 'r-b', 'A', 1)
    clearGameDataIndexesCache(store)

    const { root, shortcutEdges } = buildDependencyTree(
      store,
      { type: 'recipe', recipeId: 'r-a' },
      new Map(),
      idGetName
    )
    // Root recipe r-a, whose primary product is A. Its ingredient B expands
    // to r-b, whose ingredient A would loop — so r-b's expansion has no
    // children, and a cycle-flagged shortcut edge points B's node back to
    // the root.
    const bNode = root.children[0] as DepItemNode
    expect(bNode.itemId).toBe('B')
    expect(bNode.children).toEqual([])
    expect(shortcutEdges).toHaveLength(1)
    expect(shortcutEdges[0]).toEqual({
      fromNodeId: bNode.nodeId,
      toNodeId: root.nodeId,
      isCycle: true,
    })
  })

  it('deduplicates a shared ingredient — single node, second parent gets a non-cycle shortcut edge', () => {
    setItem('out')
    setItem('A')
    setItem('B')
    setItem('Z')
    setRecipe('r-out')
    setProduct('rpo', 'r-out', 'out', 1)
    setIngredient('rio1', 'r-out', 'A', 1, 0)
    setIngredient('rio2', 'r-out', 'B', 1, 1)

    // Both A and B depend on Z (a shared raw material).
    setRecipe('r-A')
    setProduct('rpa', 'r-A', 'A', 1)
    setIngredient('ria', 'r-A', 'Z', 2)
    setRecipe('r-B')
    setProduct('rpb', 'r-B', 'B', 1)
    setIngredient('rib', 'r-B', 'Z', 4)
    clearGameDataIndexesCache(store)

    const { root, shortcutEdges } = buildDependencyTree(
      store,
      { type: 'recipe', recipeId: 'r-out' },
      new Map(),
      idGetName
    )
    const a = root.children[0] as DepItemNode
    const b = root.children[1] as DepItemNode
    // A is visited first → A creates the Z node as its only child.
    expect(a.children.length).toBe(1)
    expect((a.children[0] as DepItemNode).itemId).toBe('Z')
    // B is visited second → Z is already in the graph, so B has no children
    // and there's a shared-shortcut edge from B to the existing Z.
    expect(b.children).toEqual([])
    expect(shortcutEdges).toHaveLength(1)
    expect(shortcutEdges[0]).toEqual({
      fromNodeId: b.nodeId,
      toNodeId: 'i:Z',
      isCycle: false,
    })
  })

  it('uses globally-unique node ids — same item id always produces the same nodeId', () => {
    setItem('out')
    setItem('A')
    setRecipe('r-out')
    setProduct('rpo', 'r-out', 'out', 1)
    setIngredient('rio', 'r-out', 'A', 1)
    clearGameDataIndexesCache(store)

    const { root } = buildDependencyTree(
      store,
      { type: 'recipe', recipeId: 'r-out' },
      new Map(),
      idGetName
    )
    const a = root.children[0] as DepItemNode
    expect(a.nodeId).toBe('i:A')
    expect(root.nodeId).toBe('r:r-out')
  })

  it('treats items with a raw-leaf tag (NaturalFiber/Crop/Harvestable/Excavatable) as leaves regardless of producing recipes', () => {
    setItem('out')
    setItem('cotton')
    setItem('wheat')
    setItem('berries')
    setItem('stone')
    setItem('iron-ore')
    setItem('mystery-leaf')
    // Tags are items with isTag: true.
    setItem('NaturalFiber-tag', { name: 'NaturalFiber', isTag: true })
    setItem('Crop-tag', { name: 'Crop', isTag: true })
    setItem('Harvestable-tag', { name: 'Harvestable', isTag: true })
    setItem('Excavatable-tag', { name: 'Excavatable', isTag: true })
    setItem('CrushedRock-tag', { name: 'CrushedRock', isTag: true })

    setTagMember('tm-cotton', 'NaturalFiber-tag', 'cotton')
    setTagMember('tm-wheat', 'Crop-tag', 'wheat')
    setTagMember('tm-berries', 'Harvestable-tag', 'berries')
    setTagMember('tm-iron-ore', 'Excavatable-tag', 'iron-ore')
    // Stone is Excavatable AND CrushedRock — should NOT be a leaf.
    setTagMember('tm-stone-exc', 'Excavatable-tag', 'stone')
    setTagMember('tm-stone-crushed', 'CrushedRock-tag', 'stone')

    setRecipe('r-out')
    setProduct('rpo', 'r-out', 'out', 1)
    setIngredient('ri-cot', 'r-out', 'cotton', 1, 0)
    setIngredient('ri-whe', 'r-out', 'wheat', 1, 1)
    setIngredient('ri-ber', 'r-out', 'berries', 1, 2)
    setIngredient('ri-iro', 'r-out', 'iron-ore', 1, 3)
    setIngredient('ri-sto', 'r-out', 'stone', 1, 4)
    setIngredient('ri-mys', 'r-out', 'mystery-leaf', 1, 5)

    // All five raw materials have a "producing" recipe — but the policy
    // should kick in before the recipe is selected, so children stay empty.
    setRecipe('r-cotton-fake')
    setProduct('rp-cotton-fake', 'r-cotton-fake', 'cotton', 1)
    setIngredient('ri-cotton-fake', 'r-cotton-fake', 'mystery-leaf', 1)
    setRecipe('r-wheat-fake')
    setProduct('rp-wheat-fake', 'r-wheat-fake', 'wheat', 1)
    setIngredient('ri-wheat-fake', 'r-wheat-fake', 'mystery-leaf', 1)
    setRecipe('r-berries-fake')
    setProduct('rp-berries-fake', 'r-berries-fake', 'berries', 1)
    setIngredient('ri-berries-fake', 'r-berries-fake', 'mystery-leaf', 1)
    setRecipe('r-iron-ore-fake')
    setProduct('rp-iron-ore-fake', 'r-iron-ore-fake', 'iron-ore', 1)
    setIngredient('ri-iron-ore-fake', 'r-iron-ore-fake', 'mystery-leaf', 1)
    // Stone has a real recipe and is NOT a raw-leaf (CrushedRock excludes it).
    setRecipe('r-stone-real')
    setProduct('rp-stone-real', 'r-stone-real', 'stone', 1)
    setIngredient('ri-stone-real', 'r-stone-real', 'mystery-leaf', 1)
    clearGameDataIndexesCache(store)

    const { root, shortcutEdges } = buildDependencyTree(
      store,
      { type: 'recipe', recipeId: 'r-out' },
      new Map(),
      idGetName
    )
    // Raw-leaves: no recipe selection, no children — even though each has
    // a fake recipe producing it.
    const [cottonNode, wheatNode, berriesNode, ironNode, stoneNode] = root.children as DepItemNode[]
    for (const leaf of [cottonNode, wheatNode, berriesNode, ironNode]) {
      expect(leaf.availableRecipeIds).toEqual([])
      expect(leaf.selectedRecipeId).toBeNull()
      expect(leaf.children).toEqual([])
    }
    // Stone is Excavatable + CrushedRock → falls through to the normal
    // recipe-expansion path.
    expect(stoneNode.selectedRecipeId).toBe('r-stone-real')
    // mystery-leaf is reached first via stone's recipe expansion (DFS
    // order), so it appears as stone's child node — not as an
    // independent root child. The 6th root-ingredient (mystery-leaf)
    // becomes a shortcut edge to the existing node.
    const mysteryNode = stoneNode.children[0] as DepItemNode
    expect(mysteryNode.itemId).toBe('mystery-leaf')
    expect(mysteryNode.availableRecipeIds).toEqual([])
    expect(shortcutEdges.some((e) => e.toNodeId === mysteryNode.nodeId)).toBe(true)
  })

  it('builds an item-rooted tree for the MaterialDialog case', () => {
    setItem('iron-bar')
    setItem('iron-ore')
    setRecipe('r-bar')
    setProduct('rpb', 'r-bar', 'iron-bar', 1)
    setIngredient('rib', 'r-bar', 'iron-ore', 4)
    clearGameDataIndexesCache(store)

    const { root } = buildDependencyTree(
      store,
      { type: 'item', itemId: 'iron-bar' },
      new Map(),
      idGetName
    )
    expect(root.kind).toBe('item')
    if (root.kind !== 'item') return
    expect(root.itemId).toBe('iron-bar')
    expect(root.selectedRecipeId).toBe('r-bar')
    expect((root.children[0] as DepItemNode).itemId).toBe('iron-ore')
  })
})
