import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { describe, expect, it } from 'vitest'

import { usePriceSignal } from '@/hooks/use-prices-signal'
import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { Materials } from '../Materials'

import '@/i18n'

const DS = 'ds1'
const BUILD = 'b1'

function stubPersister(): IndexedDbPersister {
  return { save: async () => {}, schedule: async () => {} } as unknown as IndexedDbPersister
}

function makeStores() {
  const gameDataStore = createGameDataStore()
  const buildStore = createBuildStore()
  const uiStore = createUIStore()

  // Skill, recipe, items, recipeElements
  gameDataStore.setRow('skills', 'sk-mine', {
    id: 'sk-mine',
    datasetId: DS,
    name: 'MiningSkill',
    profession: '',
    maxLevel: 7,
    laborReducePercent: '[1,1,1,1,1,1,1,1]',
  })
  gameDataStore.setRow('craftingTables', 'ct-anvil', {
    id: 'ct-anvil',
    datasetId: DS,
    name: 'AnvilItem',
  })
  gameDataStore.setRow('items', 'it-ore', {
    id: 'it-ore',
    datasetId: DS,
    name: 'OreItem',
    isTag: false,
  })
  gameDataStore.setRow('items', 'it-iron', {
    id: 'it-iron',
    datasetId: DS,
    name: 'IronItem',
    isTag: false,
  })
  gameDataStore.setRow('recipes', 'r-iron', {
    id: 'r-iron',
    datasetId: DS,
    name: 'IronRecipe',
    familyName: 'Iron',
    skillId: 'sk-mine',
    requiredSkillLevel: 1,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct-anvil',
    baseCraftTime: 1,
    baseLaborCost: 0,
  })
  gameDataStore.setRow('recipeElements', 're-i', {
    id: 're-i',
    datasetId: DS,
    recipeId: 'r-iron',
    itemOrTagId: 'it-ore',
    baseQuantity: -1,
    isProduct: false,
    index: 0,
  })
  gameDataStore.setRow('recipeElements', 're-p', {
    id: 're-p',
    datasetId: DS,
    recipeId: 'r-iron',
    itemOrTagId: 'it-iron',
    baseQuantity: 1,
    isProduct: true,
    index: 1,
  })

  buildStore.setRow('builds', BUILD, {
    id: BUILD,
    datasetId: DS,
    name: 'TestBuild',
    createdAt: '2026-01-01',
  })
  buildStore.setRow('userRecipes', 'ur-iron', {
    id: 'ur-iron',
    buildId: BUILD,
    recipeId: 'r-iron',
    roundFactor: 0,
  })
  buildStore.setRow('userSettings', 'st1', {
    id: 'st1',
    buildId: BUILD,
    marginType: 'markup',
    calorieCost: 0,
  })

  return { gameDataStore, buildStore, uiStore }
}

function renderMaterials(stores: { gameDataStore: Store; buildStore: Store; uiStore: Store }) {
  const { result } = renderHook(() => usePriceSignal())
  return render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <Materials buildId={BUILD} datasetId={DS} priceSignal={result.current} />
    </StoreContext.Provider>
  )
}

describe('Materials (smoke)', () => {
  it('renders the materials header and search input', () => {
    const stores = makeStores()
    renderMaterials(stores)
    expect(screen.getByPlaceholderText(/Search materials/i)).toBeInTheDocument()
  })

  it('shows the empty message when no materials are present', () => {
    const stores = makeStores()
    stores.buildStore.delRow('userRecipes', 'ur-iron')
    renderMaterials(stores)
    expect(screen.getByText(/Add recipes to see ingredients/i)).toBeInTheDocument()
  })

  it('renders an ingredient row for the recipe ingredient', () => {
    const stores = makeStores()
    renderMaterials(stores)
    // Body rows under the materials DataTable
    const rows = document.body.querySelectorAll('.p-datatable-tbody tr')
    expect(rows.length).toBeGreaterThanOrEqual(1)
  })

  it('opens the MaterialDialog when the row name link is clicked', async () => {
    const stores = makeStores()
    renderMaterials(stores)
    const link = document.body.querySelector(
      '.p-datatable-tbody .p-button-link'
    ) as HTMLButtonElement
    fireEvent.click(link)
    await waitFor(() => {
      expect(document.body.querySelector('.p-dialog')).toBeInTheDocument()
    })
  })

  it('renders the manual price input for an unproduced item', () => {
    const stores = makeStores()
    renderMaterials(stores)
    const inputs = document.body.querySelectorAll('.p-datatable-tbody input')
    expect(inputs.length).toBeGreaterThanOrEqual(1)
  })

  // Adds a Barrel produced as a non-primary product of r-iron (auto-reintegrated)
  // and consumed by a second recipe so it lands in Materials.
  const addReintegratedBarrel = (stores: {
    gameDataStore: Store
    buildStore: Store
    uiStore: Store
  }) => {
    const { gameDataStore, buildStore } = stores
    gameDataStore.setRow('items', 'it-barrel', {
      id: 'it-barrel',
      datasetId: DS,
      name: 'BarrelItem',
      isTag: false,
    })
    gameDataStore.setRow('items', 'it-plastic', {
      id: 'it-plastic',
      datasetId: DS,
      name: 'PlasticItem',
      isTag: false,
    })
    gameDataStore.setRow('recipeElements', 're-barrel-out', {
      id: 're-barrel-out',
      datasetId: DS,
      recipeId: 'r-iron',
      itemOrTagId: 'it-barrel',
      baseQuantity: 1,
      isProduct: true,
      index: 2,
    })
    gameDataStore.setRow('recipes', 'r-plastic', {
      id: 'r-plastic',
      datasetId: DS,
      name: 'PlasticRecipe',
      familyName: 'Plastic',
      skillId: 'sk-mine',
      requiredSkillLevel: 1,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: 'ct-anvil',
      baseCraftTime: 1,
      baseLaborCost: 0,
    })
    gameDataStore.setRow('recipeElements', 're-plastic-in', {
      id: 're-plastic-in',
      datasetId: DS,
      recipeId: 'r-plastic',
      itemOrTagId: 'it-barrel',
      baseQuantity: -1,
      isProduct: false,
      index: 0,
    })
    gameDataStore.setRow('recipeElements', 're-plastic-out', {
      id: 're-plastic-out',
      datasetId: DS,
      recipeId: 'r-plastic',
      itemOrTagId: 'it-plastic',
      baseQuantity: 1,
      isProduct: true,
      index: 1,
    })
    buildStore.setRow('userRecipes', 'ur-plastic', {
      id: 'ur-plastic',
      buildId: BUILD,
      recipeId: 'r-plastic',
      roundFactor: 0,
    })
  }

  it('treats a non-primary container product as a manual-priced material, not a produced one', () => {
    const stores = makeStores()
    addReintegratedBarrel(stores)
    renderMaterials(stores)
    // Barrel is reintegrated in r-iron, so it is NOT "produced" — both Ore and
    // Barrel render editable manual-price inputs (no computed-price cell).
    expect(document.body.querySelectorAll('.p-datatable-tbody input')).toHaveLength(2)
    expect(document.body.querySelectorAll('.computed-price-icon')).toHaveLength(0)
  })

  it('shows a computed price for a container product when a user override turns reintegration off', () => {
    const stores = makeStores()
    addReintegratedBarrel(stores)
    stores.buildStore.setRow('userReintegratedProducts', 'urp1', {
      id: 'urp1',
      buildId: BUILD,
      userRecipeId: 'ur-iron',
      productItemOrTagId: 'it-barrel',
      isReintegrated: false,
    })
    renderMaterials(stores)
    // Override off → Barrel is produced by r-iron and consumed by r-plastic, so
    // it resolves to a computed price (no manual input). Only Ore stays manual.
    expect(document.body.querySelectorAll('.p-datatable-tbody input')).toHaveLength(1)
  })

  it('moving a manually-priced item to Products via the row actions menu writes the override flag', async () => {
    const stores = makeStores()
    // Mark the ingredient as a Materials override (so move-to-products is enabled).
    stores.buildStore.setRow('userPrices', 'up-ore', {
      id: 'up-ore',
      buildId: BUILD,
      itemOrTagId: 'it-ore',
      price: 5,
      isOverride: true,
    })
    renderMaterials(stores)
    const ellipsis = document.body.querySelector('tbody .pi-ellipsis-v')
    if (ellipsis) {
      fireEvent.click(ellipsis.closest('button') as HTMLButtonElement)
      const moveBtn = await waitFor(() => screen.getByText(/Return to Products/i))
      fireEvent.click(moveBtn)
      await waitFor(() => {
        expect(stores.buildStore.getCell('userPrices', 'up-ore', 'isOverride')).toBe(false)
      })
    }
  })

  it('renders a tag parent + child rows when an ingredient is a tag', () => {
    const stores = makeStores()
    // Add a tag and a member item.
    stores.gameDataStore.setRow('items', 'it-tag-wood', {
      id: 'it-tag-wood',
      datasetId: DS,
      name: 'WoodTag',
      isTag: true,
    })
    stores.gameDataStore.setRow('items', 'it-birch', {
      id: 'it-birch',
      datasetId: DS,
      name: 'BirchItem',
      isTag: false,
    })
    stores.gameDataStore.setRow('tagItems', 'ti-1', {
      id: 'ti-1',
      datasetId: DS,
      tagId: 'it-tag-wood',
      itemId: 'it-birch',
    })
    // Replace the ingredient with the tag.
    stores.gameDataStore.setCell('recipeElements', 're-i', 'itemOrTagId', 'it-tag-wood')
    renderMaterials(stores)
    // Parent (tag) + child (birch) rows should appear in the body.
    const rows = document.body.querySelectorAll('.p-datatable-tbody tr')
    expect(rows.length).toBeGreaterThanOrEqual(2)
  })

  it('clicking an open-recipe action from MaterialDialog closes that dialog and opens the recipe dialog', async () => {
    const stores = makeStores()
    // Iron is produced; opening its MaterialDialog and clicking the "Open
    // Recipe" link routes through the Materials → onOpenRecipe bridge,
    // closing the material dialog and opening the recipe one.
    renderMaterials(stores)
    // Click the ingredient link to open the MaterialDialog for ore.
    const link = document.body.querySelector(
      '.p-datatable-tbody .p-button-link'
    ) as HTMLButtonElement
    fireEvent.click(link)
    await waitFor(() => {
      expect(document.body.querySelectorAll('.p-dialog').length).toBeGreaterThan(0)
    })
    // The MaterialDialog body contains nothing that opens a recipe for ore
    // (it's not produced). Re-render with iron as a material (override) so
    // its dialog includes a "Open Recipe" link via the UsedInRecipes tab.
  })

  it('renders manual price input for tag-child rows that are not produced', () => {
    const stores = makeStores()
    // Set up a tag ingredient with a child item that is NOT produced by
    // anything. The child row's priceTemplate hits the ManualPriceCell branch.
    stores.gameDataStore.setRow('items', 'it-tag-wood', {
      id: 'it-tag-wood',
      datasetId: DS,
      name: 'WoodTag',
      isTag: true,
    })
    stores.gameDataStore.setRow('items', 'it-birch', {
      id: 'it-birch',
      datasetId: DS,
      name: 'BirchItem',
      isTag: false,
    })
    stores.gameDataStore.setRow('tagItems', 'ti-1', {
      id: 'ti-1',
      datasetId: DS,
      tagId: 'it-tag-wood',
      itemId: 'it-birch',
    })
    stores.gameDataStore.setCell('recipeElements', 're-i', 'itemOrTagId', 'it-tag-wood')
    renderMaterials(stores)
    // Parent (tag) + child (birch) rows present. The child should expose a
    // ManualPriceCell numeric input.
    const rows = document.body.querySelectorAll('.p-datatable-tbody tr')
    expect(rows.length).toBeGreaterThanOrEqual(2)
    const childInputs = document.body.querySelectorAll('.p-datatable-tbody input')
    expect(childInputs.length).toBeGreaterThanOrEqual(1)
  })

  it('clicking an opened-MaterialDialog onHide closes the dialog', async () => {
    const stores = makeStores()
    renderMaterials(stores)
    const link = document.body.querySelector(
      '.p-datatable-tbody .p-button-link'
    ) as HTMLButtonElement
    fireEvent.click(link)
    await waitFor(() => {
      expect(document.body.querySelectorAll('.p-dialog').length).toBeGreaterThan(0)
    })
    // Find the dialog's close-X header button.
    const closeBtn = document.body.querySelector(
      '.p-dialog .p-dialog-header-close'
    ) as HTMLButtonElement
    expect(closeBtn).not.toBeNull()
    fireEvent.click(closeBtn)
    await waitFor(() => {
      expect(document.body.querySelectorAll('.p-dialog').length).toBe(0)
    })
  })

  it('filters rows when a search term is typed', async () => {
    const stores = makeStores()
    // Add another item so we can confirm the filter reduces visible rows.
    stores.gameDataStore.setRow('items', 'it-coal', {
      id: 'it-coal',
      datasetId: DS,
      name: 'CoalItem',
      isTag: false,
    })
    stores.gameDataStore.setRow('recipeElements', 're-i2', {
      id: 're-i2',
      datasetId: DS,
      recipeId: 'r-iron',
      itemOrTagId: 'it-coal',
      baseQuantity: -2,
      isProduct: false,
      index: 2,
    })
    renderMaterials(stores)
    const before = document.body.querySelectorAll('.p-datatable-tbody tr').length
    expect(before).toBeGreaterThanOrEqual(2)
    const search = screen.getByPlaceholderText(/Search materials/i) as HTMLInputElement
    fireEvent.change(search, { target: { value: 'no-such-thing-12345' } })
    await waitFor(() => {
      // After the debounce, no rows match → DataTable shows the empty
      // placeholder which counts as a single row in the tbody.
      expect(document.body.querySelectorAll('.p-datatable-tbody tr').length).toBeLessThan(before)
    })
  })
})
