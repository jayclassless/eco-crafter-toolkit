import { fireEvent, render, screen } from '@testing-library/react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { describe, expect, it } from 'vitest'

import { usePriceSignal } from '@/hooks/use-prices-signal'
import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { AdHocRecipeCalculatorDialog } from '../AdHocRecipeCalculatorDialog'

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

  gameDataStore.setRow('skills', 'sk-mine', {
    id: 'sk-mine',
    datasetId: DS,
    name: 'MiningSkill',
    profession: '',
    maxLevel: 7,
    laborReducePercent: '[1]',
  })
  gameDataStore.setRow('craftingTables', 'ct1', { id: 'ct1', datasetId: DS, name: 'Workbench' })
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
    craftingTableId: 'ct1',
    baseCraftTime: 1,
    baseLaborCost: 0,
  })
  gameDataStore.setRow('recipeElements', 're-p', {
    id: 're-p',
    datasetId: DS,
    recipeId: 'r-iron',
    itemOrTagId: 'it-iron',
    baseQuantity: 1,
    isProduct: true,
    index: 0,
  })

  buildStore.setRow('builds', BUILD, {
    id: BUILD,
    datasetId: DS,
    name: 'TestBuild',
    createdAt: '2026-01-01',
  })

  return { gameDataStore, buildStore, uiStore }
}

/** Give the recipe a module-reducible ingredient and put a Basic-slot module on
 * its table, so the slot picker has something to change. */
function addModuleAndIngredient(gameDataStore: Store) {
  gameDataStore.setRow('items', 'it-ore', {
    id: 'it-ore',
    datasetId: DS,
    name: 'IronOreItem',
    isTag: false,
  })
  gameDataStore.setRow('recipeElements', 're-i', {
    id: 're-i',
    datasetId: DS,
    recipeId: 'r-iron',
    itemOrTagId: 'it-ore',
    baseQuantity: -10,
    isProduct: false,
    index: 0,
  })
  // A `Module` modifier is what marks an element as module-reducible; static
  // ingredients carry none and are correctly left alone.
  gameDataStore.setRow('modifiers', 'mod-elem', {
    id: 'mod-elem',
    datasetId: DS,
    targetType: 'elementQuantity',
    targetId: 're-i',
    dynamicType: 'Module',
    refName: 'Mining',
  })
  gameDataStore.setRow('pluginModules', 'pm-basic', {
    id: 'pm-basic',
    datasetId: DS,
    name: 'BasicUpgradeItem',
    slot: 'Basic',
  })
  gameDataStore.setRow('pluginModuleBonuses', 'pmb-basic', {
    id: 'pmb-basic',
    datasetId: DS,
    pluginModuleId: 'pm-basic',
    bonusIndex: 0,
    action: 'ResourceCost',
    effectType: 'AdditivePercent',
    value: -0.1,
    skillIds: '[]',
  })
  gameDataStore.setRow('craftingTablePluginModules', 'ctpm-basic', {
    id: 'ctpm-basic',
    datasetId: DS,
    craftingTableId: 'ct1',
    pluginModuleId: 'pm-basic',
  })
}

function Harness({
  stores,
}: {
  stores: { gameDataStore: Store; buildStore: Store; uiStore: Store }
}) {
  const priceSignal = usePriceSignal()
  return (
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <AdHocRecipeCalculatorDialog
        visible
        onHide={() => {}}
        buildId={BUILD}
        datasetId={DS}
        priceSignal={priceSignal}
      />
    </StoreContext.Provider>
  )
}

describe('AdHocRecipeCalculatorDialog', () => {
  it("shows each recipe's skill name alongside the recipe in the lookup", () => {
    const stores = makeStores()
    render(<Harness stores={stores} />)
    const dropdown = document.body.querySelector('.p-autocomplete-dropdown') as HTMLButtonElement
    fireEvent.click(dropdown)
    // The recipe and its owning skill name both appear in the option row.
    expect(screen.getByText('IronRecipe')).toBeInTheDocument()
    expect(screen.getByText('MiningSkill')).toBeInTheDocument()
  })

  it('keeps the typed text visible in the lookup until a recipe is chosen', () => {
    const stores = makeStores()
    render(<Harness stores={stores} />)
    const input = screen.getByPlaceholderText(/search/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'iro' } })
    expect(input.value).toBe('iro')
    fireEvent.change(input, { target: { value: 'iron' } })
    expect(input.value).toBe('iron')
  })

  it('reprices the recipe when a module is installed via the slot picker', async () => {
    // The dialog shares `CraftingTableModulesCell` with the Crafting Tables
    // panel, so the two pickers cannot drift apart. This asserts the shared
    // picker actually reaches `computeAdHocRecipe`: 10 ore at -10% is 9.
    const stores = makeStores()
    addModuleAndIngredient(stores.gameDataStore)
    render(<Harness stores={stores} />)

    fireEvent.click(document.body.querySelector('.p-autocomplete-dropdown') as HTMLButtonElement)
    fireEvent.click(screen.getByText('IronRecipe'))

    expect(await screen.findByText('10')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Upgrade Modules'))
    // The Basic slot has a single candidate, so the popover offers a checkbox.
    // Ticking it also blurs the recipe lookup, which re-fires its onChange with
    // the already-selected recipe — `handleSelect` must not treat that as a new
    // selection and reset the controls.
    fireEvent.click(await screen.findByLabelText('BasicUpgradeItem'))

    expect(await screen.findByText('9')).toBeInTheDocument()
  })

  it('keeps the controls when the recipe lookup re-fires for the same recipe', async () => {
    // Regression: PrimeReact's AutoComplete re-emits onChange with the current
    // option on blur (forceSelection). `handleSelect` used to reset skill level,
    // modules, talents and every edited ingredient price unconditionally, so
    // the first click on any control below the lookup silently undid itself.
    const stores = makeStores()
    addModuleAndIngredient(stores.gameDataStore)
    render(<Harness stores={stores} />)

    fireEvent.click(document.body.querySelector('.p-autocomplete-dropdown') as HTMLButtonElement)
    fireEvent.click(screen.getByText('IronRecipe'))

    fireEvent.click(await screen.findByLabelText('Upgrade Modules'))
    fireEvent.click(await screen.findByLabelText('BasicUpgradeItem'))
    expect(await screen.findByText('9')).toBeInTheDocument()

    // Re-selecting the same recipe must be a no-op, not a reset back to 10.
    fireEvent.click(document.body.querySelector('.p-autocomplete-dropdown') as HTMLButtonElement)
    fireEvent.click(screen.getByText('IronRecipe'))
    expect(screen.getByText('9')).toBeInTheDocument()
  })
})
