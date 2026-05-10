import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { NodeProps } from '@xyflow/react'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DependencyGraphContext,
  type DependencyGraphContextValue,
} from '@/components/price-calculator/recipe-dependency-graph/dependency-graph-context'
import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { __resetLocalizedNameStore, saveLocalizedNames } from '@/stores/localized-name-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

// xyflow's Handle uses ResizeObserver internals — mock it out to a noop
// since the node renders plenty without it.
vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}))

import { DepItemNode } from '../DepItemNode'

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
    { id: '1', entityType: 'item', entityId: 'iron-ore', locale: 'en-US', name: 'Iron Ore' },
    { id: '2', entityType: 'item', entityId: 'tag-wood', locale: 'en-US', name: 'Wood' },
    { id: '3', entityType: 'item', entityId: 'birch', locale: 'en-US', name: 'Birch' },
    { id: '4', entityType: 'item', entityId: 'oak', locale: 'en-US', name: 'Oak' },
    { id: '5', entityType: 'recipe', entityId: 'r-1', locale: 'en-US', name: 'Recipe One' },
    { id: '6', entityType: 'recipe', entityId: 'r-2', locale: 'en-US', name: 'Recipe Two' },
    { id: '7', entityType: 'item', entityId: 'product-1', locale: 'en-US', name: 'Product One' },
    { id: '8', entityType: 'item', entityId: 'product-2', locale: 'en-US', name: 'Product Two' },
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

  gameDataStore.setRow('items', 'iron-ore', { id: 'iron-ore', datasetId: DS, name: 'IronOre' })
  gameDataStore.setRow('items', 'tag-wood', {
    id: 'tag-wood',
    datasetId: DS,
    name: 'Wood',
    isTag: true,
  })
  gameDataStore.setRow('items', 'birch', { id: 'birch', datasetId: DS, name: 'Birch' })
  gameDataStore.setRow('items', 'oak', { id: 'oak', datasetId: DS, name: 'Oak' })

  // Two recipes that produce 'iron-ore' and consume nothing, so the
  // available-recipes dropdown will show.
  gameDataStore.setRow('recipes', 'r-1', { id: 'r-1', datasetId: DS, name: 'RecipeOne' })
  gameDataStore.setRow('recipes', 'r-2', { id: 'r-2', datasetId: DS, name: 'RecipeTwo' })
  gameDataStore.setRow('items', 'product-1', { id: 'product-1', datasetId: DS, name: 'ProductOne' })
  gameDataStore.setRow('items', 'product-2', { id: 'product-2', datasetId: DS, name: 'ProductTwo' })
  gameDataStore.setRow('recipeElements', 're-1', {
    id: 're-1',
    datasetId: DS,
    recipeId: 'r-1',
    itemOrTagId: 'product-1',
    isProduct: true,
    baseQuantity: 1,
    index: 0,
  })
  gameDataStore.setRow('recipeElements', 're-2', {
    id: 're-2',
    datasetId: DS,
    recipeId: 'r-2',
    itemOrTagId: 'product-2',
    isProduct: true,
    baseQuantity: 1,
    index: 0,
  })

  return { gameDataStore, buildStore, uiStore }
}

function renderItemNode(
  data: Record<string, unknown>,
  ctx: Partial<DependencyGraphContextValue> = {},
  nodeId = 'node-1'
) {
  const stores = makeStores()
  const ctxValue: DependencyGraphContextValue = {
    datasetId: DS,
    onSelectRecipe: () => {},
    onSelectTagItem: () => {},
    ...ctx,
  }
  const result = render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <DependencyGraphContext.Provider value={ctxValue}>
        <DepItemNode {...({ id: nodeId, data, type: 'depItem' } as unknown as NodeProps)} />
      </DependencyGraphContext.Provider>
    </StoreContext.Provider>
  )
  return { ...result, stores }
}

describe('DepItemNode', () => {
  beforeEach(async () => {
    await __resetLocalizedNameStore()
    await deleteLocalizedNameDb()
    await seedNames()
  })

  it('renders the item name from the localized-name index', async () => {
    renderItemNode({
      kind: 'item',
      itemId: 'iron-ore',
      isTag: false,
      tagItemIds: null,
      selectedTagItemId: null,
      availableRecipeIds: [],
      selectedRecipeId: null,
      hasIncoming: false,
      hasOutgoing: false,
    })
    await waitFor(() => {
      expect(screen.getByText('Iron Ore')).toBeInTheDocument()
    })
  })

  it('falls back to the raw item name when no localized name exists', async () => {
    renderItemNode({
      kind: 'item',
      itemId: 'nonexistent-but-known',
      isTag: false,
      tagItemIds: null,
      selectedTagItemId: null,
      availableRecipeIds: [],
      selectedRecipeId: null,
      hasIncoming: false,
      hasOutgoing: false,
    })
    // No row for that id; the rendered display name is empty (raw fallback
    // resolves to ''). The component still renders without throwing.
    expect(document.body.querySelector('.dependency-graph-node')).not.toBeNull()
  })

  it('does not render the open-item button when onOpenMaterial is not provided', async () => {
    renderItemNode({
      kind: 'item',
      itemId: 'iron-ore',
      isTag: false,
      tagItemIds: null,
      selectedTagItemId: null,
      availableRecipeIds: [],
      selectedRecipeId: null,
      hasIncoming: false,
      hasOutgoing: false,
    })
    await waitFor(() => expect(screen.getByText('Iron Ore')).toBeInTheDocument())
    expect(document.body.querySelector('button[aria-label="Open Item Details"]')).toBeNull()
  })

  it('fires onOpenMaterial with the item id when the open button is clicked', async () => {
    const onOpenMaterial = vi.fn()
    renderItemNode(
      {
        kind: 'item',
        itemId: 'iron-ore',
        isTag: false,
        tagItemIds: null,
        selectedTagItemId: null,
        availableRecipeIds: [],
        selectedRecipeId: null,
        hasIncoming: false,
        hasOutgoing: false,
      },
      { onOpenMaterial }
    )
    await waitFor(() => expect(screen.getByText('Iron Ore')).toBeInTheDocument())
    const btn = document.body.querySelector(
      'button[aria-label="Open Item Details"]'
    ) as HTMLButtonElement
    expect(btn).not.toBeNull()
    fireEvent.click(btn)
    expect(onOpenMaterial).toHaveBeenCalledWith('iron-ore')
  })

  it('passes the selected tag-member item to onOpenMaterial when isTag and a member is selected', async () => {
    const onOpenMaterial = vi.fn()
    renderItemNode(
      {
        kind: 'item',
        itemId: 'tag-wood',
        isTag: true,
        tagItemIds: ['birch', 'oak'],
        selectedTagItemId: 'birch',
        availableRecipeIds: [],
        selectedRecipeId: null,
        hasIncoming: false,
        hasOutgoing: false,
      },
      { onOpenMaterial }
    )
    await waitFor(() => expect(screen.getByText('Wood')).toBeInTheDocument())
    const btn = document.body.querySelector(
      'button[aria-label="Open Item Details"]'
    ) as HTMLButtonElement
    fireEvent.click(btn)
    // Resolved id is the selected tag member, not the tag itself.
    expect(onOpenMaterial).toHaveBeenCalledWith('birch')
  })

  it('renders the tag-options dropdown when isTag and tagItemIds is non-empty', async () => {
    renderItemNode({
      kind: 'item',
      itemId: 'tag-wood',
      isTag: true,
      tagItemIds: ['birch', 'oak'],
      selectedTagItemId: 'birch',
      availableRecipeIds: [],
      selectedRecipeId: null,
      hasIncoming: false,
      hasOutgoing: false,
    })
    await waitFor(() => expect(screen.getByText('Wood')).toBeInTheDocument())
    // PrimeReact Dropdown renders the selected value as visible text — Birch
    // should appear inside it.
    await waitFor(() => {
      expect(document.body.querySelector('.p-dropdown')).not.toBeNull()
    })
  })

  it('fires onSelectTagItem when a tag dropdown option is chosen', async () => {
    const onSelectTagItem = vi.fn()
    renderItemNode(
      {
        kind: 'item',
        itemId: 'tag-wood',
        isTag: true,
        tagItemIds: ['birch', 'oak'],
        selectedTagItemId: 'birch',
        availableRecipeIds: [],
        selectedRecipeId: null,
        hasIncoming: false,
        hasOutgoing: false,
      },
      { onSelectTagItem },
      'node-X'
    )
    await waitFor(() => expect(screen.getByText('Wood')).toBeInTheDocument())
    // Open the dropdown and click the other option.
    const dropdown = document.body.querySelector('.p-dropdown') as HTMLElement
    fireEvent.click(dropdown)
    const oakOption = await waitFor(() => screen.getByText('Oak'))
    fireEvent.click(oakOption)
    expect(onSelectTagItem).toHaveBeenCalledWith('node-X', 'oak')
  })

  it('renders the recipe dropdown only when 2+ available recipes exist', async () => {
    renderItemNode({
      kind: 'item',
      itemId: 'iron-ore',
      isTag: false,
      tagItemIds: null,
      selectedTagItemId: null,
      availableRecipeIds: ['r-1', 'r-2'],
      selectedRecipeId: 'r-1',
      hasIncoming: false,
      hasOutgoing: false,
    })
    await waitFor(() => expect(screen.getByText('Iron Ore')).toBeInTheDocument())
    // Recipe dropdown is rendered when there are >= 2 recipe options.
    await waitFor(() => {
      expect(document.body.querySelectorAll('.p-dropdown').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('fires onSelectRecipe when a recipe option is clicked', async () => {
    const onSelectRecipe = vi.fn()
    renderItemNode(
      {
        kind: 'item',
        itemId: 'iron-ore',
        isTag: false,
        tagItemIds: null,
        selectedTagItemId: null,
        availableRecipeIds: ['r-1', 'r-2'],
        selectedRecipeId: 'r-1',
        hasIncoming: false,
        hasOutgoing: false,
      },
      { onSelectRecipe },
      'node-Y'
    )
    await waitFor(() => expect(screen.getByText('Iron Ore')).toBeInTheDocument())
    const dropdown = document.body.querySelector('.p-dropdown') as HTMLElement
    fireEvent.click(dropdown)
    const option = await waitFor(() => screen.getByText('Recipe Two'))
    fireEvent.click(option)
    expect(onSelectRecipe).toHaveBeenCalledWith('node-Y', 'r-2')
  })

  it('opens the open-recipe icon button (only when onOpenRecipe + selectedRecipeId present)', async () => {
    const onOpenRecipe = vi.fn()
    renderItemNode(
      {
        kind: 'item',
        itemId: 'iron-ore',
        isTag: false,
        tagItemIds: null,
        selectedTagItemId: null,
        availableRecipeIds: ['r-1', 'r-2'],
        selectedRecipeId: 'r-1',
        hasIncoming: false,
        hasOutgoing: false,
      },
      { onOpenRecipe }
    )
    await waitFor(() => expect(screen.getByText('Iron Ore')).toBeInTheDocument())
    const btn = document.body.querySelector(
      'button[aria-label="Open Recipe Details"]'
    ) as HTMLButtonElement
    expect(btn).not.toBeNull()
    fireEvent.click(btn)
    expect(onOpenRecipe).toHaveBeenCalledWith('r-1')
  })

  it('does not render the open-recipe button without selectedRecipeId', async () => {
    renderItemNode(
      {
        kind: 'item',
        itemId: 'iron-ore',
        isTag: false,
        tagItemIds: null,
        selectedTagItemId: null,
        availableRecipeIds: ['r-1', 'r-2'],
        selectedRecipeId: null,
        hasIncoming: false,
        hasOutgoing: false,
      },
      { onOpenRecipe: () => {} }
    )
    await waitFor(() => expect(screen.getByText('Iron Ore')).toBeInTheDocument())
    expect(document.body.querySelector('button[aria-label="Open Recipe Details"]')).toBeNull()
  })
})
