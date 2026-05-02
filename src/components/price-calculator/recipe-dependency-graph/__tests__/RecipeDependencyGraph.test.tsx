import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { __resetLocalizedNameStore, saveLocalizedNames } from '@/stores/localized-name-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

// xyflow uses ResizeObserver, getBoundingClientRect, and other DOM APIs
// that don't fully work in jsdom. Mock the package down to a passthrough
// that just renders the resolved nodes — that's enough for the smoke test
// to verify the graph wires through tree → layout → custom node components.
vi.mock('@xyflow/react', () => {
  const passThroughComponent = (name: string) =>
    function Mock({ children }: { children?: React.ReactNode }) {
      return <div data-testid={name}>{children}</div>
    }
  interface MockNode {
    id: string
    type?: string
    data: Record<string, unknown>
  }
  interface MockReactFlowProps {
    nodes: MockNode[]
    nodeTypes?: Record<string, React.ComponentType<{ id: string; data: unknown }>>
    children?: React.ReactNode
  }
  function MockReactFlow({ nodes, nodeTypes, children }: MockReactFlowProps) {
    return (
      <div data-testid="react-flow">
        {nodes.map((n) => {
          const Comp = nodeTypes?.[n.type ?? 'default']
          return Comp ? <Comp key={n.id} id={n.id} data={n.data} /> : null
        })}
        {children}
      </div>
    )
  }
  enum Position {
    Left = 'left',
    Right = 'right',
    Top = 'top',
    Bottom = 'bottom',
  }
  return {
    ReactFlow: MockReactFlow,
    Background: passThroughComponent('react-flow-background'),
    Controls: passThroughComponent('react-flow-controls'),
    Handle: () => null,
    Position,
    applyNodeChanges: <T,>(_changes: unknown, nodes: T) => nodes,
  }
})

import { RecipeDependencyGraph } from '../RecipeDependencyGraph'

const BUILD_ID = 'b1'
const DS = 'ds1'

async function deleteLocalizedNameDb(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('eco-crafter-localized-names')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

async function seedNames(): Promise<void> {
  await saveLocalizedNames(DS, [
    { id: '1', entityType: 'item', entityId: 'iron-bar', locale: 'en-US', name: 'Iron Bar' },
    { id: '2', entityType: 'item', entityId: 'iron-ore', locale: 'en-US', name: 'Iron Ore' },
    { id: '3', entityType: 'recipe', entityId: 'r-bar', locale: 'en-US', name: 'Smelt Bar' },
  ])
}

function stubPersister(): IndexedDbPersister {
  return {
    save: async () => {},
    schedule: async (...actions: Array<() => Promise<unknown>>) => {
      for (const a of actions) await a()
    },
  } as unknown as IndexedDbPersister
}

function makeStores() {
  const gameDataStore = createGameDataStore()
  const buildStore = createBuildStore()
  const uiStore = createUIStore()

  gameDataStore.setRow('datasets', DS, {
    id: DS,
    name: 'DS',
    version: 1,
    bundledId: '',
    installedRevision: 0,
    importedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    isCustom: false,
  })
  gameDataStore.setRow('items', 'iron-bar', { id: 'iron-bar', datasetId: DS, name: 'Iron Bar' })
  gameDataStore.setRow('items', 'iron-ore', { id: 'iron-ore', datasetId: DS, name: 'Iron Ore' })
  gameDataStore.setRow('recipes', 'r-bar', { id: 'r-bar', datasetId: DS, name: 'Smelt Bar' })
  gameDataStore.setRow('recipeElements', 'rp', {
    id: 'rp',
    datasetId: DS,
    recipeId: 'r-bar',
    itemOrTagId: 'iron-bar',
    isProduct: true,
    baseQuantity: 1,
    index: 0,
  })
  gameDataStore.setRow('recipeElements', 'ri', {
    id: 'ri',
    datasetId: DS,
    recipeId: 'r-bar',
    itemOrTagId: 'iron-ore',
    isProduct: false,
    baseQuantity: 4,
    index: 0,
  })

  return { gameDataStore, buildStore, uiStore }
}

describe('RecipeDependencyGraph', () => {
  let stores: ReturnType<typeof makeStores>

  beforeEach(async () => {
    await __resetLocalizedNameStore()
    await deleteLocalizedNameDb()
    await seedNames()
    stores = makeStores()
  })

  it('renders the recipe root and its ingredient child via custom node renderers', async () => {
    render(
      <StoreContext.Provider
        value={{
          ...stores,
          gameDataPersister: stubPersister(),
          buildPersister: stubPersister(),
          uiPersister: stubPersister(),
        }}
      >
        <RecipeDependencyGraph
          target={{ type: 'recipe', recipeId: 'r-bar' }}
          buildId={BUILD_ID}
          datasetId={DS}
        />
      </StoreContext.Provider>
    )

    await waitFor(() => {
      expect(screen.getByText('Smelt Bar')).toBeTruthy()
      expect(screen.getByText('Iron Ore')).toBeTruthy()
    })
  })

  it("fires onOpenRecipe when the root recipe node's open icon is clicked", async () => {
    const onOpenRecipe = vi.fn()
    render(
      <StoreContext.Provider
        value={{
          ...stores,
          gameDataPersister: stubPersister(),
          buildPersister: stubPersister(),
          uiPersister: stubPersister(),
        }}
      >
        <RecipeDependencyGraph
          target={{ type: 'recipe', recipeId: 'r-bar' }}
          buildId={BUILD_ID}
          datasetId={DS}
          onOpenRecipe={onOpenRecipe}
        />
      </StoreContext.Provider>
    )

    await waitFor(() => {
      expect(screen.getByText('Smelt Bar')).toBeTruthy()
    })

    // The recipe-name aria-labelled "Open Recipe Details" button on the root.
    const openButtons = screen.getAllByLabelText('Open Recipe Details')
    fireEvent.click(openButtons[0])
    expect(onOpenRecipe).toHaveBeenCalledWith('r-bar')
  })
})
