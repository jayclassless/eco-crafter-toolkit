import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { describe, expect, it } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { ProductionPlannerDialog } from '../ProductionPlannerDialog'

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

  gameDataStore.setRow('craftingTables', 'ct1', { id: 'ct1', datasetId: DS, name: 'Workbench' })
  gameDataStore.setRow('items', 'it-wood', {
    id: 'it-wood',
    datasetId: DS,
    name: 'WoodItem',
    isTag: false,
  })
  gameDataStore.setRow('items', 'it-plank', {
    id: 'it-plank',
    datasetId: DS,
    name: 'PlankItem',
    isTag: false,
  })
  gameDataStore.setRow('recipes', 'r-plank', {
    id: 'r-plank',
    datasetId: DS,
    name: 'PlankRecipe',
    familyName: 'Plank',
    skillId: '',
    requiredSkillLevel: 0,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct1',
    baseCraftTime: 0,
    baseLaborCost: 0,
  })
  gameDataStore.setRow('recipeElements', 're-plank-prod', {
    id: 're-plank-prod',
    datasetId: DS,
    recipeId: 'r-plank',
    itemOrTagId: 'it-plank',
    baseQuantity: 1,
    isProduct: true,
    index: 0,
  })
  gameDataStore.setRow('recipeElements', 're-plank-ing', {
    id: 're-plank-ing',
    datasetId: DS,
    recipeId: 'r-plank',
    itemOrTagId: 'it-wood',
    baseQuantity: -5,
    isProduct: false,
    index: 1,
  })

  buildStore.setRow('builds', BUILD, {
    id: BUILD,
    datasetId: DS,
    name: 'TestBuild',
    createdAt: '2026-01-01',
  })
  buildStore.setRow('userRecipes', 'ur1', {
    id: 'ur1',
    buildId: BUILD,
    recipeId: 'r-plank',
    roundFactor: 0,
  })
  buildStore.setRow('userSettings', 'us1', {
    id: 'us1',
    buildId: BUILD,
    marginType: 'markup',
    calorieCost: 0,
    applyMarginBetweenSkills: false,
    defaultShareForSecondaryItems: 20,
  })

  return { gameDataStore, buildStore, uiStore }
}

function renderDialog(stores: { gameDataStore: Store; buildStore: Store; uiStore: Store }) {
  return render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <ProductionPlannerDialog
        visible
        onHide={() => {}}
        buildId={BUILD}
        datasetId={DS}
        solverOutput={null}
      />
    </StoreContext.Provider>
  )
}

/** Type into a type-ahead picker (by placeholder) and click the suggestion. */
async function selectFromPicker(placeholder: RegExp, optionText: string) {
  const input = screen.getByPlaceholderText(placeholder)
  fireEvent.change(input, { target: { value: optionText } })
  fireEvent.input(input, { target: { value: optionText } })
  const option = await waitFor(() => {
    const match = Array.from(document.querySelectorAll('.p-autocomplete-item')).find((el) =>
      el.textContent?.includes(optionText)
    )
    if (!match) throw new Error(`option ${optionText} not shown`)
    return match
  })
  fireEvent.click(option)
}

describe('ProductionPlannerDialog', () => {
  it('prompts the user to pick a product before planning', () => {
    renderDialog(makeStores())
    expect(screen.getByText(/Pick a product/i)).toBeInTheDocument()
  })

  it('computes how many of the target can be produced from inventory', async () => {
    renderDialog(makeStores())

    // Choose the target product.
    await selectFromPicker(/Search for a product/i, 'PlankItem')

    // Add 100 wood to the inventory.
    await selectFromPicker(/Search for an item/i, 'WoodItem')
    const qtyInput = screen.getByPlaceholderText(/Qty/i)
    fireEvent.change(qtyInput, { target: { value: '100' } })
    fireEvent.blur(qtyInput)

    // 100 wood / 5 per plank => 20 planks.
    expect(await screen.findByText(/You can produce 20 PlankItem/i)).toBeInTheDocument()
    // And a crafting step for the plank recipe is listed.
    const stepsTable = screen.getByRole('table')
    expect(within(stepsTable).getByText('PlankRecipe')).toBeInTheDocument()
  })

  it('reports missing materials when nothing is on hand', async () => {
    renderDialog(makeStores())
    await selectFromPicker(/Search for a product/i, 'PlankItem')
    expect(await screen.findByText(/can't produce any/i)).toBeInTheDocument()
    expect(screen.getByText(/Missing materials/i)).toBeInTheDocument()
  })
})
