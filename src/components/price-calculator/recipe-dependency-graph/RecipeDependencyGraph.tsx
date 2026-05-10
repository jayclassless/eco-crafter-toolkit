import '@xyflow/react/dist/style.css'
import './RecipeDependencyGraph.css'
import { applyNodeChanges, Background, Controls, type NodeChange, ReactFlow } from '@xyflow/react'
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  DependencyGraphContext,
  type DependencyGraphContextValue,
} from '@/components/price-calculator/recipe-dependency-graph/dependency-graph-context'
import { DepItemNode } from '@/components/price-calculator/recipe-dependency-graph/DepItemNode'
import { DepRecipeNode } from '@/components/price-calculator/recipe-dependency-graph/DepRecipeNode'
import { DepShortcutEdge } from '@/components/price-calculator/recipe-dependency-graph/DepShortcutEdge'
import { layoutTree } from '@/components/price-calculator/recipe-dependency-graph/recipe-dependency-layout'
import { useLocalizedName } from '@/hooks/use-localized-name'
import { useStoreRevision } from '@/hooks/use-store-revision'
import { buildDependencyTree, type DependencyTreeStart } from '@/lib/recipe-dependency-tree'
import { useStores } from '@/stores/providers'

interface Props {
  target: DependencyTreeStart
  buildId: string
  datasetId: string
  onOpenRecipe?: (recipeId: string) => void
  onOpenMaterial?: (itemId: string) => void
}

const NODE_TYPES = { depRecipe: DepRecipeNode, depItem: DepItemNode }
const EDGE_TYPES = { depShortcut: DepShortcutEdge }
const GAME_TABLES = ['recipes', 'recipeElements', 'items', 'tagItems'] as const

function targetKey(target: DependencyTreeStart): string {
  return target.type === 'recipe' ? `r:${target.recipeId}` : `i:${target.itemId}`
}

export function RecipeDependencyGraph({ target, datasetId, onOpenRecipe, onOpenMaterial }: Props) {
  const { gameDataStore } = useStores()
  const { getName } = useLocalizedName(datasetId)
  const gameRev = useStoreRevision(gameDataStore, GAME_TABLES)

  const [selections, setSelections] = useState<Map<string, string>>(() => new Map())
  const tKey = targetKey(target)

  // Reset selections (and any user-dragged positions) when the target changes —
  // selections from one recipe's tree don't apply to another's.
  useEffect(() => {
    setSelections(new Map())
  }, [tKey])

  const onSelectRecipe = useCallback((nodeId: string, recipeId: string) => {
    setSelections((prev) => {
      const next = new Map(prev)
      next.set(`recipe:${nodeId}`, recipeId)
      return next
    })
  }, [])

  const onSelectTagItem = useCallback((nodeId: string, itemId: string) => {
    setSelections((prev) => {
      const next = new Map(prev)
      next.set(`tag-item:${nodeId}`, itemId)
      return next
    })
  }, [])

  const layout = useMemo(
    () => {
      const { root, shortcutEdges } = buildDependencyTree(
        gameDataStore,
        target,
        selections,
        getName
      )
      return layoutTree(root, shortcutEdges)
    },
    // gameRev forces recomputation when game-data tables change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameDataStore, tKey, selections, getName, gameRev]
  )

  // Local copy of nodes so users can drag — reset whenever the layout
  // changes (target / selections / dataset).
  const [nodes, setNodes] = useState(layout.nodes)
  useEffect(() => {
    setNodes(layout.nodes)
  }, [layout])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current) as typeof current)
  }, [])

  const ctxValue = useMemo<DependencyGraphContextValue>(
    () => ({ datasetId, onOpenRecipe, onOpenMaterial, onSelectRecipe, onSelectTagItem }),
    [datasetId, onOpenRecipe, onOpenMaterial, onSelectRecipe, onSelectTagItem]
  )

  // When the host PrimeReact Dialog is maximized, the graph wrapper's
  // default 60vh fallback caps it at 60% of the viewport — wasted space.
  // Threading a flex chain through PrimeReact's nested DOM is fragile (it
  // breaks the moment any internal class name changes), so we measure the
  // dialog content ourselves: walk to the .p-dialog ancestor, watch it
  // with a ResizeObserver, and override `height` inline whenever
  // `.p-dialog-maximized` is on. Falls back to 60vh otherwise.
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [maximizedHeight, setMaximizedHeight] = useState<number | null>(null)
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const dialog = wrapper.closest('.p-dialog') as HTMLElement | null
    if (!dialog) return

    const measure = () => {
      if (!dialog.classList.contains('p-dialog-maximized')) {
        setMaximizedHeight(null)
        return
      }
      const content = dialog.querySelector('.p-dialog-content') as HTMLElement | null
      const tabNav = dialog.querySelector('.p-tabview-nav-container') as HTMLElement | null
      if (!content) return
      // Subtract the tab nav (it lives inside .p-dialog-content) and a
      // small bottom padding allowance so the graph doesn't push past the
      // dialog edge.
      const navHeight = tabNav ? tabNav.offsetHeight : 0
      setMaximizedHeight(Math.max(0, content.clientHeight - navHeight - 16))
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(dialog)
    // Also watch the maximized class itself (it toggles without resizing
    // the dialog when the maximize button is clicked at the same window
    // size — e.g. between maximized and a fitted dialog at the same vh).
    const mo = new MutationObserver(measure)
    mo.observe(dialog, { attributes: true, attributeFilter: ['class'] })
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [])

  const wrapperStyle: CSSProperties | undefined =
    maximizedHeight !== null ? { height: maximizedHeight } : undefined

  return (
    <DependencyGraphContext.Provider value={ctxValue}>
      <div ref={wrapperRef} className="dependency-graph-wrapper" style={wrapperStyle}>
        <ReactFlow<(typeof nodes)[number]>
          nodes={nodes}
          edges={layout.edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={onNodesChange}
          fitView
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </DependencyGraphContext.Provider>
  )
}
