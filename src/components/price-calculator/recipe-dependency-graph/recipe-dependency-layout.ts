import type { Edge, Node } from '@xyflow/react'

import type { DepNode, ShortcutEdge } from '@/lib/recipe-dependency-tree'

const NODE_WIDTH = 260
/** Height of a leaf-style node (header row + padding). Item nodes with
 * dropdowns are taller — see `nodeHeight()`. */
const BASE_NODE_HEIGHT = 64
const DROPDOWN_HEIGHT = 44
const H_GAP = 80
const V_GAP = 16

/**
 * Per-node rendered height. Dropdown rows stack below the header inside
 * an item node; the layout has to account for them or the next sibling
 * gets positioned overlapping the bottom of the previous one.
 */
function nodeHeight(node: DepNode): number {
  if (node.kind === 'root-recipe') return BASE_NODE_HEIGHT
  let h = BASE_NODE_HEIGHT
  if (node.isTag && node.tagItemIds && node.tagItemIds.length > 0) h += DROPDOWN_HEIGHT
  if (node.availableRecipeIds.length >= 2) h += DROPDOWN_HEIGHT
  return h
}

export interface DepRecipeNodeData extends Record<string, unknown> {
  kind: 'root-recipe'
  recipeId: string
  primaryItemId: string
  hasOutgoing: boolean
}

export interface DepItemNodeData extends Record<string, unknown> {
  kind: 'item'
  itemId: string
  isTag: boolean
  tagItemIds: string[] | null
  selectedTagItemId: string | null
  availableRecipeIds: string[]
  selectedRecipeId: string | null
  hasIncoming: boolean
  hasOutgoing: boolean
}

type DepNodeData = DepRecipeNodeData | DepItemNodeData

interface LayoutResult {
  nodes: Node<DepNodeData>[]
  edges: Edge[]
}

interface SubtreeMeta {
  height: number
}

/**
 * Compute a horizontal tree layout for a `DepNode` plus its shortcut
 * edges.
 *
 * Nodes are placed depth-by-depth using only the primary children link
 * (each node appears once, at the position established by its first
 * parent). Shortcut edges from later parents are appended after the
 * layout — solid for shared dependencies, dashed/animated/orange for
 * cycles.
 */
export function layoutTree(root: DepNode, shortcutEdges: ShortcutEdge[]): LayoutResult {
  const meta = new Map<string, SubtreeMeta>()
  measure(root, meta)

  const nodes: Node<DepNodeData>[] = []
  const edges: Edge[] = []
  place(root, 0, 0, meta, nodes, edges)

  for (const se of shortcutEdges) {
    if (se.isCycle) {
      edges.push({
        id: `cycle:${se.fromNodeId}->${se.toNodeId}`,
        source: se.fromNodeId,
        target: se.toNodeId,
        sourceHandle: 'right',
        targetHandle: 'left',
        type: 'smoothstep',
        animated: true,
        style: { stroke: 'var(--orange-500)', strokeDasharray: '6 4' },
      })
    } else {
      edges.push({
        id: `share:${se.fromNodeId}->${se.toNodeId}`,
        source: se.fromNodeId,
        target: se.toNodeId,
        sourceHandle: 'right',
        targetHandle: 'left',
        type: 'smoothstep',
      })
    }
  }

  // Determine which nodes actually have edges attached to each side, so
  // the renderer can hide unused handle dots — the leading handle on the
  // root (no parent) and the trailing handle on every leaf (no children
  // and no shortcut originating).
  const hasIncoming = new Set<string>()
  const hasOutgoing = new Set<string>()
  for (const e of edges) {
    hasOutgoing.add(e.source)
    hasIncoming.add(e.target)
  }
  for (const n of nodes) {
    n.data = {
      ...n.data,
      hasIncoming: hasIncoming.has(n.id),
      hasOutgoing: hasOutgoing.has(n.id),
    } as DepNodeData
  }

  return { nodes, edges }
}

function measure(node: DepNode, meta: Map<string, SubtreeMeta>): number {
  const own = nodeHeight(node)
  if (node.children.length === 0) {
    meta.set(node.nodeId, { height: own })
    return own
  }
  let total = 0
  for (const child of node.children) {
    total += measure(child, meta)
  }
  total += V_GAP * (node.children.length - 1)
  const height = Math.max(own, total)
  meta.set(node.nodeId, { height })
  return height
}

function place(
  node: DepNode,
  x: number,
  yTop: number,
  meta: Map<string, SubtreeMeta>,
  nodes: Node<DepNodeData>[],
  edges: Edge[]
): void {
  const own = nodeHeight(node)
  const subtreeHeight = meta.get(node.nodeId)?.height ?? own
  const y = yTop + (subtreeHeight - own) / 2

  nodes.push({
    id: node.nodeId,
    type: node.kind === 'root-recipe' ? 'depRecipe' : 'depItem',
    position: { x, y },
    data: toNodeData(node),
  })

  let cy = yTop
  for (const child of node.children) {
    edges.push({
      id: `e:${node.nodeId}->${child.nodeId}`,
      source: node.nodeId,
      target: child.nodeId,
      sourceHandle: 'right',
      targetHandle: 'left',
      type: 'smoothstep',
    })
    place(child, x + NODE_WIDTH + H_GAP, cy, meta, nodes, edges)
    const childHeight = meta.get(child.nodeId)?.height ?? nodeHeight(child)
    cy += childHeight + V_GAP
  }
}

function toNodeData(node: DepNode): DepNodeData {
  // hasIncoming / hasOutgoing are filled in by `layoutTree` after all
  // edges (primary + shortcuts) have been collected — they're false here
  // as a placeholder.
  if (node.kind === 'root-recipe') {
    return {
      kind: 'root-recipe',
      recipeId: node.recipeId,
      primaryItemId: node.primaryItemId,
      hasOutgoing: false,
    }
  }
  return {
    kind: 'item',
    itemId: node.itemId,
    isTag: node.isTag,
    tagItemIds: node.tagItemIds,
    selectedTagItemId: node.selectedTagItemId,
    availableRecipeIds: node.availableRecipeIds,
    selectedRecipeId: node.selectedRecipeId,
    hasIncoming: false,
    hasOutgoing: false,
  }
}
