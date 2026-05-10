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

interface NodeBounds {
  x: number
  y: number
  width: number
  height: number
}

/** Margin between an obstructing node and the peak of a shortcut edge's
 * arc. Big enough that the edge is visually separated from the node,
 * small enough that the arc isn't gratuitously tall. */
const SHORTCUT_CLEARANCE = 30
/** Inflation of the source-target y band when picking obstructing nodes
 * — a node touching the smoothstep's horizontal segment by 1px isn't
 * really obstructing, but a node within a few pixels reads as a near
 * miss visually. */
const SHORTCUT_BAND_MARGIN = 4

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
  const bounds = new Map<string, NodeBounds>()
  place(root, 0, 0, meta, nodes, edges, bounds)

  for (const se of shortcutEdges) {
    const peakY = computeShortcutPeakY(se.fromNodeId, se.toNodeId, bounds)
    // peakY === null means no intermediate node sits in the smoothstep's
    // y-band — a regular smoothstep routes around fine, no arc needed.
    const type = peakY === null ? 'smoothstep' : 'depShortcut'
    const data = peakY === null ? undefined : { peakY }
    if (se.isCycle) {
      edges.push({
        id: `cycle:${se.fromNodeId}->${se.toNodeId}`,
        source: se.fromNodeId,
        target: se.toNodeId,
        sourceHandle: 'right',
        targetHandle: 'left',
        type,
        animated: true,
        data,
        style: { stroke: 'var(--orange-500)', strokeDasharray: '6 4' },
      })
    } else {
      edges.push({
        id: `share:${se.fromNodeId}->${se.toNodeId}`,
        source: se.fromNodeId,
        target: se.toNodeId,
        sourceHandle: 'right',
        targetHandle: 'left',
        type,
        data,
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
  edges: Edge[],
  bounds: Map<string, NodeBounds>
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
  bounds.set(node.nodeId, { x, y, width: NODE_WIDTH, height: own })

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
    place(child, x + NODE_WIDTH + H_GAP, cy, meta, nodes, edges, bounds)
    const childHeight = meta.get(child.nodeId)?.height ?? nodeHeight(child)
    cy += childHeight + V_GAP
  }
}

/**
 * Pick a `y` for a shortcut edge's arc, OR return null if a regular
 * smoothstep would already route cleanly between source and target.
 *
 * A smoothstep edge crosses intermediate columns at the source's y
 * (between source and the kink) and the target's y (between the kink
 * and target). A node only obstructs if its y-range overlaps the band
 * spanned by [sourceCenterY, targetCenterY]. When that happens, we arc
 * over (above) or under (below) the obstruction — whichever side is
 * the shorter detour from the band's center.
 */
function computeShortcutPeakY(
  srcId: string,
  tgtId: string,
  bounds: Map<string, NodeBounds>
): number | null {
  const src = bounds.get(srcId)
  const tgt = bounds.get(tgtId)
  if (!src || !tgt) return null

  // Arc / smoothstep traverses the x-strip from just past the leftmost
  // endpoint's right side to just before the rightmost endpoint's left
  // side. For forward edges that's (src.x_right, tgt.x_left); for back
  // edges (cycle) it's (tgt.x_right, src.x_left). The min/max forms here
  // produce the narrower interpretation, which is what we want — only
  // strictly-between nodes obstruct.
  const xMin = Math.min(src.x + src.width, tgt.x + tgt.width)
  const xMax = Math.max(src.x, tgt.x)
  if (xMin >= xMax) return null

  const srcCenter = src.y + src.height / 2
  const tgtCenter = tgt.y + tgt.height / 2
  const bandMin = Math.min(srcCenter, tgtCenter) - SHORTCUT_BAND_MARGIN
  const bandMax = Math.max(srcCenter, tgtCenter) + SHORTCUT_BAND_MARGIN

  let topMost = Number.POSITIVE_INFINITY
  let bottomMost = Number.NEGATIVE_INFINITY
  for (const [id, b] of bounds) {
    if (id === srcId || id === tgtId) continue
    const xOverlap = b.x + b.width > xMin && b.x < xMax
    if (!xOverlap) continue
    const yOverlap = b.y < bandMax && b.y + b.height > bandMin
    if (!yOverlap) continue
    if (b.y < topMost) topMost = b.y
    if (b.y + b.height > bottomMost) bottomMost = b.y + b.height
  }
  if (topMost === Number.POSITIVE_INFINITY) return null

  const minST = Math.min(srcCenter, tgtCenter)
  const maxST = Math.max(srcCenter, tgtCenter)
  const overPeak = topMost - SHORTCUT_CLEARANCE
  const underPeak = bottomMost + SHORTCUT_CLEARANCE
  // Score each direction by how far the peak strays OUTSIDE the natural
  // source-target y range. A peak that sits between src and tgt scores 0
  // (no detour beyond the line); above min(src, tgt) or below max(src,
  // tgt) costs the distance. This prefers routing through the gap
  // between obstructions and the source/target rather than over the
  // entire diagram.
  const overOutside = Math.max(0, minST - overPeak)
  const underOutside = Math.max(0, underPeak - maxST)
  // Tie -> over (matches the original fix's behaviour for symmetric
  // small-recipe cases).
  return overOutside <= underOutside ? overPeak : underPeak
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
