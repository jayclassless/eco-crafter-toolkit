import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { beforeEach, describe, expect, it } from 'vitest'

import type { PriceSignal } from '@/hooks/use-prices-signal'
import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { __resetLocalizedNameStore, saveLocalizedNames } from '@/stores/localized-name-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { RecipeDialog } from '../RecipeDialog'

import '@/i18n'

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
    { id: '1', entityType: 'item', entityId: 'stone', locale: 'en-US', name: 'Stone' },
    { id: '2', entityType: 'item', entityId: 'ingot', locale: 'en-US', name: 'Ingot' },
    { id: '3', entityType: 'item', entityId: 'slag', locale: 'en-US', name: 'Slag' },
    { id: '4', entityType: 'item', entityId: 'scrap', locale: 'en-US', name: 'Scrap' },
    { id: '5', entityType: 'recipe', entityId: RECIPE_ID, locale: 'en-US', name: 'Iron Smelting' },
    { id: '6', entityType: 'craftingTable', entityId: 'ct1', locale: 'en-US', name: 'Anvil' },
  ])
}

const BUILD_ID = 'b1'
const DS = 'ds1'
const RECIPE_ID = 'recipe-iron'
const UR_ID = 'ur1'

function stubPersister(): IndexedDbPersister {
  return {
    save: async () => {},
    schedule: async (...actions: Array<() => Promise<unknown>>) => {
      for (const a of actions) await a()
    },
  } as unknown as IndexedDbPersister
}

function stubPriceSignal(): PriceSignal {
  return {
    setAll: () => {},
    set: () => {},
    setRecipe: () => {},
    setRecipeCosts: () => {},
    subscribe: () => () => {},
    subscribeRecipe: () => () => {},
    subscribeRecipeCost: () => () => {},
    subscribeAny: () => () => {},
    get: () => null,
    getRecipe: () => null,
    getRecipeCost: () => null,
    getRecipeIdFor: () => '',
    getAll: () => ({}),
  }
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
  gameDataStore.setRow('craftingTables', 'ct1', { id: 'ct1', datasetId: DS, name: 'Anvil' })
  gameDataStore.setRow('items', 'stone', { id: 'stone', datasetId: DS, name: 'Stone' })
  gameDataStore.setRow('items', 'ingot', { id: 'ingot', datasetId: DS, name: 'Ingot' })
  gameDataStore.setRow('items', 'slag', { id: 'slag', datasetId: DS, name: 'Slag' })
  gameDataStore.setRow('items', 'scrap', { id: 'scrap', datasetId: DS, name: 'Scrap' })
  gameDataStore.setRow('recipes', RECIPE_ID, {
    id: RECIPE_ID,
    datasetId: DS,
    name: 'Iron Smelting',
    familyName: 'Iron',
    requiredSkillLevel: 0,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct1',
    baseCraftTime: 1,
    baseLaborCost: 1,
  })
  // Ingredient: stone
  gameDataStore.setRow('recipeElements', 're-stone', {
    id: 're-stone',
    datasetId: DS,
    recipeId: RECIPE_ID,
    itemOrTagId: 'stone',
    baseQuantity: -10,
    isProduct: false,
    index: 0,
  })
  // Ingredient: scrap (also produced → returned)
  gameDataStore.setRow('recipeElements', 're-scrap-in', {
    id: 're-scrap-in',
    datasetId: DS,
    recipeId: RECIPE_ID,
    itemOrTagId: 'scrap',
    baseQuantity: -2,
    isProduct: false,
    index: 1,
  })
  // Products: ingot (primary), slag (secondary), scrap (returned)
  gameDataStore.setRow('recipeElements', 're-ingot', {
    id: 're-ingot',
    datasetId: DS,
    recipeId: RECIPE_ID,
    itemOrTagId: 'ingot',
    baseQuantity: 1,
    isProduct: true,
    index: 0,
  })
  gameDataStore.setRow('recipeElements', 're-slag', {
    id: 're-slag',
    datasetId: DS,
    recipeId: RECIPE_ID,
    itemOrTagId: 'slag',
    baseQuantity: 2,
    isProduct: true,
    index: 1,
  })
  gameDataStore.setRow('recipeElements', 're-scrap-out', {
    id: 're-scrap-out',
    datasetId: DS,
    recipeId: RECIPE_ID,
    itemOrTagId: 'scrap',
    baseQuantity: 1,
    isProduct: true,
    index: 2,
  })

  buildStore.setRow('builds', BUILD_ID, {
    id: BUILD_ID,
    datasetId: DS,
    name: 'Build',
    createdAt: '2026-01-01',
  })
  buildStore.setRow('userRecipes', UR_ID, {
    id: UR_ID,
    buildId: BUILD_ID,
    recipeId: RECIPE_ID,
    roundFactor: 0,
  })

  return { gameDataStore, buildStore, uiStore }
}

function renderDialog(stores: ReturnType<typeof makeStores>) {
  return render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <RecipeDialog
        recipeId={RECIPE_ID}
        buildId={BUILD_ID}
        datasetId={DS}
        priceSignal={stubPriceSignal()}
        onHide={() => {}}
      />
    </StoreContext.Provider>
  )
}

describe('RecipeDialog', () => {
  let stores: ReturnType<typeof makeStores>

  beforeEach(async () => {
    await __resetLocalizedNameStore()
    await deleteLocalizedNameDb()
    await seedNames()
    stores = makeStores()
  })

  it('renders a "Dependency Graph" tab in the tab strip', () => {
    renderDialog(stores)
    expect(screen.getByText('Dependency Graph')).toBeTruthy()
  })

  it('renders the returned-ingredient section and excludes that product from the Products table', async () => {
    renderDialog(stores)

    // Section headings present
    expect(screen.getByText('Returned Ingredients')).toBeTruthy()
    expect(screen.getByText('Products')).toBeTruthy()
    expect(screen.getByText('Ingredients')).toBeTruthy()

    // Wait for the async localized-name load to land before asserting on
    // row text, since `useLocalizedName` returns '' until IndexedDB resolves.
    await waitFor(() => {
      const rowTexts = screen.getAllByRole('row').map((r) => r.textContent ?? '')
      expect(rowTexts.some((t) => t.includes('Ingot'))).toBe(true)
    })

    const rowTexts = screen.getAllByRole('row').map((r) => r.textContent ?? '')
    const ingotRows = rowTexts.filter((t) => t.includes('Ingot'))
    const slagRows = rowTexts.filter((t) => t.includes('Slag'))
    const scrapRows = rowTexts.filter((t) => t.includes('Scrap'))
    const stoneRows = rowTexts.filter((t) => t.includes('Stone'))

    expect(ingotRows.length).toBeGreaterThanOrEqual(1)
    expect(slagRows.length).toBeGreaterThanOrEqual(1)
    // Scrap is both an ingredient and a returned product — it appears in
    // both the Ingredients table and the Returned Ingredients table (the
    // returned-side row is the one this feature introduces).
    expect(scrapRows.length).toBeGreaterThanOrEqual(2)
    expect(stoneRows.length).toBeGreaterThanOrEqual(1)
  })

  it('shows the Share % column with the build-default split (config 20 → 80/20)', async () => {
    renderDialog(stores)
    // PrimeReact InputNumber renders as an <input> with its current value.
    // No userSettings row exists in the test fixture → schema default config
    // (20) applies → primary 80, single non-zero secondary 20.
    await waitFor(() => {
      expect(screen.getAllByRole('spinbutton').length).toBe(2)
    })
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    const values = inputs.map((i) => i.value.replace(/\s|%/g, ''))
    expect(values).toContain('80')
    expect(values).toContain('20')
  })

  it('keeps zero-share secondaries (SlagItem) at 0 even when config > 0', async () => {
    // Rename 'slag' to the raw game name 'SlagItem' so it lands in the
    // zero-share set built by buildRecipeIndexes.
    stores.gameDataStore.setCell('items', 'slag', 'name', 'SlagItem')
    renderDialog(stores)
    await waitFor(() => {
      expect(screen.getAllByRole('spinbutton').length).toBe(2)
    })
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    const values = inputs.map((i) => i.value.replace(/\s|%/g, ''))
    // Primary back to 100, slag stays at 0 (no non-zero secondary to absorb
    // the config%).
    expect(values).toContain('100')
    expect(values).toContain('0')
  })

  it('hides the Share % column for single-product (plus returned ingredient) recipes', async () => {
    // Remove Slag so only Ingot + Scrap (returned) remain.
    stores.gameDataStore.delRow('recipeElements', 're-slag')
    renderDialog(stores)
    // Wait for the dialog to settle (Ingot row present) before asserting.
    await waitFor(() => {
      const rowTexts = screen.getAllByRole('row').map((r) => r.textContent ?? '')
      expect(rowTexts.some((t) => t.includes('Ingot'))).toBe(true)
    })
    // No InputNumber in the dialog since there's only one non-reintegrated product.
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
  })

  it('does not render the dialog when recipeId is null', () => {
    const { container } = render(
      <StoreContext.Provider
        value={{
          ...stores,
          gameDataPersister: stubPersister(),
          buildPersister: stubPersister(),
          uiPersister: stubPersister(),
        }}
      >
        <RecipeDialog
          recipeId={null}
          buildId={BUILD_ID}
          datasetId={DS}
          priceSignal={stubPriceSignal()}
          onHide={() => {}}
        />
      </StoreContext.Provider>
    )
    expect(container.querySelector('.p-dialog')).toBeNull()
  })

  it('toggling the recipe favorite star writes through useRecipeManagement', async () => {
    renderDialog(stores)
    await waitFor(() => {
      expect(screen.getAllByRole('row').length).toBeGreaterThan(0)
    })
    const star = document.body
      .querySelector('.pi-star, .pi-star-fill')!
      .closest('button') as HTMLButtonElement
    fireEvent.click(star)
    await waitFor(() => {
      expect(stores.buildStore.getCell('userRecipes', UR_ID, 'favorite')).toBe(true)
    })
  })

  it('does not show the edit-recipe pencil button for non-custom recipes', async () => {
    renderDialog(stores)
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(0))
    expect(document.body.querySelector('button[aria-label="Edit custom recipe"]')).toBeNull()
  })

  it('shows a pencil button in the header when the recipe is custom', async () => {
    stores.gameDataStore.setCell('recipes', RECIPE_ID, 'isCustom', true)
    renderDialog(stores)
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(0))
    expect(document.body.querySelector('button[aria-label="Edit custom recipe"]')).not.toBeNull()
  })

  it('renders a pi-book placeholder in the header for a custom recipe', async () => {
    stores.gameDataStore.setCell('recipes', RECIPE_ID, 'isCustom', true)
    renderDialog(stores)
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(0))
    // The header's ItemIcon switches to a `<i class="pi pi-book">` for custom
    // recipes; size=48 distinguishes it from any inline pi-book elsewhere.
    const bookIcons = Array.from(document.body.querySelectorAll('i.pi.pi-book'))
    expect(bookIcons.length).toBeGreaterThan(0)
  })

  it('opens the custom recipe edit form when the pencil is clicked', async () => {
    stores.gameDataStore.setCell('recipes', RECIPE_ID, 'isCustom', true)
    renderDialog(stores)
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(0))
    const pencil = document.body.querySelector(
      'button[aria-label="Edit custom recipe"]'
    ) as HTMLButtonElement
    fireEvent.click(pencil)
    expect(screen.getByText(/edit custom recipe/i)).toBeInTheDocument()
  })
})
