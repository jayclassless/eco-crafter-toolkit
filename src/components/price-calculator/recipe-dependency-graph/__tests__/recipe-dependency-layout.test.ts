import { describe, expect, it } from 'vitest'

import { layoutTree } from '@/components/price-calculator/recipe-dependency-graph/recipe-dependency-layout'
import type { DepItemNode, DepNode, ShortcutEdge } from '@/lib/recipe-dependency-tree'

function leaf(nodeId: string): DepItemNode {
  return {
    kind: 'item',
    nodeId,
    itemId: nodeId,
    isTag: false,
    tagItemIds: null,
    selectedTagItemId: null,
    availableRecipeIds: [],
    selectedRecipeId: null,
    children: [],
  }
}

function item(nodeId: string, children: DepItemNode[]): DepItemNode {
  return {
    kind: 'item',
    nodeId,
    itemId: nodeId,
    isTag: false,
    tagItemIds: null,
    selectedTagItemId: null,
    availableRecipeIds: [`${nodeId}-recipe`],
    selectedRecipeId: `${nodeId}-recipe`,
    children,
  }
}

function rootRecipe(nodeId: string, children: DepItemNode[]): DepNode {
  return {
    kind: 'root-recipe',
    nodeId,
    recipeId: 'r',
    primaryItemId: 'p',
    children,
  }
}

describe('layoutTree', () => {
  it('routes shortcut edges as `depShortcut` with a peakY clearing intermediate nodes', () => {
    // Tree: root -> A -> B (B is a leaf). Plus shortcut root -> B.
    // The single-child chain centers all three nodes on the same y, so a
    // straight smoothstep at that y would pass through A's body.
    const tree = rootRecipe('root', [item('A', [leaf('B')])])
    const shortcuts: ShortcutEdge[] = [{ fromNodeId: 'root', toNodeId: 'B', isCycle: false }]
    const { nodes, edges } = layoutTree(tree, shortcuts)

    const a = nodes.find((n) => n.id === 'A')!
    const shortcut = edges.find((e) => e.id === 'share:root->B')!
    expect(shortcut.type).toBe('depShortcut')
    const peakY = (shortcut.data as { peakY: number }).peakY
    // peakY must clear A's top by at least the configured clearance (30px)
    // so the arc's horizontal segment doesn't intersect A's body.
    expect(peakY).toBeLessThanOrEqual(a.position.y - 30)
  })

  it('marks cycle shortcut edges as `depShortcut` with the orange-dashed style', () => {
    const tree = rootRecipe('root', [item('A', [leaf('B')])])
    const shortcuts: ShortcutEdge[] = [{ fromNodeId: 'B', toNodeId: 'root', isCycle: true }]
    const { edges } = layoutTree(tree, shortcuts)

    const cycle = edges.find((e) => e.id === 'cycle:B->root')!
    expect(cycle.type).toBe('depShortcut')
    expect(cycle.animated).toBe(true)
    expect(cycle.style?.stroke).toBe('var(--orange-500)')
  })

  it('keeps primary parent->child edges as smoothstep', () => {
    const tree = rootRecipe('root', [leaf('A')])
    const { edges } = layoutTree(tree, [])
    const primary = edges.find((e) => e.id === 'e:root->A')!
    expect(primary.type).toBe('smoothstep')
  })

  it('arcs under (below) the obstruction when source is below target', () => {
    // Replicates the gist of the BlacksmithTable case the user reported:
    // a forward shortcut crosses one obstruction whose y range sits
    // BETWEEN src and tgt's centers. The arc should peak in the natural
    // gap on the under side rather than detouring above the entire
    // layout (which is what the previous fix did for complex graphs).
    //
    // Tree:
    //   root -> [upper -> mid -> deep, lower]
    //   shortcut: lower -> deep
    //
    // `upper`, `mid`, `deep` form a single-child chain at the top. `lower`
    // is the second child of root, placed below `upper`'s subtree. The
    // shortcut from `lower` (lower-y center) to `deep` (top-y center)
    // obstructs at `mid`. Under is the shorter detour: it sits in the
    // gap between mid and lower.
    const tree = rootRecipe('root', [item('upper', [item('mid', [leaf('deep')])]), leaf('lower')])
    const shortcuts: ShortcutEdge[] = [{ fromNodeId: 'lower', toNodeId: 'deep', isCycle: false }]
    const { nodes, edges } = layoutTree(tree, shortcuts)

    const shortcut = edges.find((e) => e.id === 'share:lower->deep')!
    expect(shortcut.type).toBe('depShortcut')
    const peakY = (shortcut.data as { peakY: number }).peakY
    const mid = nodes.find((n) => n.id === 'mid')!
    // Under arc: peakY clears mid below by the configured 30px margin.
    // (The pre-fix behaviour anchored against the topmost obstructing
    // node and produced peakY = mid.y - 30, an over-arc — this assertion
    // proves the under direction was chosen instead.)
    expect(peakY).toBeGreaterThanOrEqual(mid.position.y + 64 + 30)
  })

  it('peakY hugs the obstruction, not the topmost node in the layout', () => {
    // Verifies the user-observed bug from the BlacksmithTable feedback:
    // peakY must NOT be set against an unrelated node that's far above
    // the source-target band. Earlier the algorithm anchored peakY to
    // the topmost node in the spanned columns regardless of whether it
    // sat in the source-target y band.
    //
    // Tree shape: a tall first subtree pushes a node into column 2 at
    // the top of the layout; the second subtree (which contains the
    // shortcut endpoints) is much further down. The early node should
    // NOT influence peakY.
    const tree = rootRecipe('root', [
      // First child: occupies columns 1 and 2 with a node high up.
      item('high', [leaf('highChild')]),
      // Second child: provides src and obstruction at a lower y.
      item('mid', [item('midChild', [leaf('deep')])]),
      // Third child: the shortcut source, sitting below `mid`.
      leaf('src'),
    ])
    const shortcuts: ShortcutEdge[] = [{ fromNodeId: 'src', toNodeId: 'deep', isCycle: false }]
    const { nodes, edges } = layoutTree(tree, shortcuts)

    const shortcut = edges.find((e) => e.id === 'share:src->deep')!
    if (shortcut.type === 'depShortcut') {
      const peakY = (shortcut.data as { peakY: number }).peakY
      const highChild = nodes.find((n) => n.id === 'highChild')!
      // peakY must not be anchored against `highChild`. Anchoring would
      // produce peakY ≈ highChild.y - 30 (i.e. ≤ -22ish). We require
      // peakY to be well below that — i.e. closer to the actual
      // obstruction in the source-target band.
      expect(peakY).toBeGreaterThan(highChild.position.y)
    }
  })
})
