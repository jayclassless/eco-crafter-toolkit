import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { __resetLocalizedNameStore } from '@/stores/localized-name-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { CustomRecipesTab } from '../CustomRecipesTab'

import '@/i18n'

const DS = 'ds1'

function stubPersister(): IndexedDbPersister {
  return { save: async () => {}, schedule: async () => {} } as unknown as IndexedDbPersister
}

function makeStores() {
  const gameDataStore = createGameDataStore()
  const buildStore = createBuildStore()
  const uiStore = createUIStore()

  gameDataStore.setRow('datasets', DS, {
    id: DS,
    name: 'Test',
    version: 1,
    bundledId: '',
    installedRevision: 0,
    importedAt: '2026-04-01',
    updatedAt: '2026-04-01',
    isCustom: false,
  })
  gameDataStore.setRow('skills', 'skill-mining', {
    datasetId: DS,
    name: 'MiningSkill',
    profession: 'Mining',
    maxLevel: 7,
    laborReducePercent: '[]',
    specialtyCost: 1,
  })
  gameDataStore.setRow('craftingTables', 'ct1', {
    datasetId: DS,
    name: 'Workbench',
  })
  gameDataStore.setRow('items', 'item-out', {
    datasetId: DS,
    name: 'OutputItem',
    isTag: false,
    isPart: false,
    isCustom: false,
  })

  // Two custom recipes: one with a primary product, one without products.
  gameDataStore.setRow('recipes', 'r-cust-1', {
    datasetId: DS,
    name: 'Smelt Ore',
    familyName: 'Smelt Ore',
    skillId: 'skill-mining',
    requiredSkillLevel: 0,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct1',
    baseCraftTime: 0,
    baseLaborCost: 0,
    isCustom: true,
  })
  gameDataStore.setRow('recipeElements', 're-1', {
    datasetId: DS,
    recipeId: 'r-cust-1',
    itemOrTagId: 'item-out',
    baseQuantity: 1,
    isProduct: true,
    index: 0,
  })

  // Standard recipe — should NOT appear in the custom list.
  gameDataStore.setRow('recipes', 'r-std', {
    datasetId: DS,
    name: 'Standard',
    familyName: 'Standard',
    skillId: 'skill-mining',
    requiredSkillLevel: 0,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct1',
    baseCraftTime: 0,
    baseLaborCost: 0,
    isCustom: false,
  })

  return { gameDataStore, buildStore, uiStore }
}

function renderTab(stores: ReturnType<typeof makeStores>) {
  return render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <CustomRecipesTab datasetId={DS} />
    </StoreContext.Provider>
  )
}

async function deleteDb(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('eco-crafter-localized-names')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  await __resetLocalizedNameStore()
  await deleteDb()
})

afterEach(async () => {
  await __resetLocalizedNameStore()
})

describe('CustomRecipesTab', () => {
  it('lists custom recipes only (excludes standard ones)', () => {
    renderTab(makeStores())
    expect(screen.getByText('Smelt Ore')).toBeInTheDocument()
    expect(screen.queryByText('Standard')).toBeNull()
  })

  it('opens the form dialog when "New Recipe" is clicked', () => {
    renderTab(makeStores())
    fireEvent.click(screen.getByRole('button', { name: /new recipe/i }))
    expect(screen.getByText(/new custom recipe/i)).toBeInTheDocument()
  })

  it('opens the form in edit mode when the pencil button is clicked', () => {
    renderTab(makeStores())
    const pencil = document.querySelector('button .pi.pi-pencil')!.closest('button')!
    fireEvent.click(pencil)
    expect(screen.getByText(/edit custom recipe/i)).toBeInTheDocument()
  })

  it('deletes the recipe after the trash confirm dialog is accepted', async () => {
    const stores = makeStores()
    renderTab(stores)

    const trash = document.querySelector('button .pi.pi-trash')!.closest('button')!
    fireEvent.click(trash)

    // Confirm dialog appears.
    expect(screen.getByText(/delete custom recipe\?/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => expect(stores.gameDataStore.hasRow('recipes', 'r-cust-1')).toBe(false))
  })

  it('shows the empty-state message when no custom recipes exist', () => {
    const stores = makeStores()
    stores.gameDataStore.delRow('recipes', 'r-cust-1')
    renderTab(stores)
    expect(screen.getByText(/no custom recipes yet/i)).toBeInTheDocument()
  })
})
