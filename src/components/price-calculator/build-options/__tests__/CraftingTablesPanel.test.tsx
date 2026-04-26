import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { describe, expect, it } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { CraftingTablesPanel } from '../CraftingTablesPanel'

import '@/i18n'

const DS = 'ds1'
const BUILD = 'b1'

function stubPersister(): IndexedDbPersister {
  return { save: async () => {}, schedule: async () => {} } as unknown as IndexedDbPersister
}

function makeStores(opts: { withModules?: boolean } = {}) {
  const gameDataStore = createGameDataStore()
  const buildStore = createBuildStore()
  const uiStore = createUIStore()

  gameDataStore.setRow('craftingTables', 'ct-anvil', {
    id: 'ct-anvil',
    datasetId: DS,
    name: 'AnvilItem',
  })

  if (opts.withModules) {
    gameDataStore.setRow('pluginModules', 'pm-basic', {
      id: 'pm-basic',
      datasetId: DS,
      name: 'BasicUpgrade',
      pluginType: 'Resource',
      percent: 0.9,
    })
    gameDataStore.setRow('craftingTablePluginModules', 'ctpm1', {
      id: 'ctpm1',
      datasetId: DS,
      craftingTableId: 'ct-anvil',
      pluginModuleId: 'pm-basic',
    })
  }

  buildStore.setRow('builds', BUILD, {
    id: BUILD,
    datasetId: DS,
    name: 'TestBuild',
    createdAt: '2026-01-01',
  })
  buildStore.setRow('userCraftingTables', 'uct-anvil', {
    id: 'uct-anvil',
    buildId: BUILD,
    craftingTableId: 'ct-anvil',
    pluginModuleId: '',
    costPerMinute: 0.05,
  })

  return { gameDataStore, buildStore, uiStore }
}

function renderPanel(stores: { gameDataStore: Store; buildStore: Store; uiStore: Store }) {
  return render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <CraftingTablesPanel buildId={BUILD} datasetId={DS} />
    </StoreContext.Provider>
  )
}

describe('CraftingTablesPanel (smoke)', () => {
  it('renders one row per user crafting table', () => {
    const stores = makeStores()
    renderPanel(stores)
    const rows = document.body.querySelectorAll('.p-datatable-tbody tr')
    expect(rows.length).toBeGreaterThanOrEqual(1)
  })

  it('renders a costPerMinute input pre-filled with the stored value', () => {
    const stores = makeStores()
    renderPanel(stores)
    const inputs = Array.from(document.body.querySelectorAll('input')) as HTMLInputElement[]
    expect(inputs.some((i) => i.value === '0.05')).toBe(true)
  })

  it('removes a table without recipes immediately when trash is clicked', () => {
    const stores = makeStores()
    renderPanel(stores)
    expect(stores.buildStore.hasRow('userCraftingTables', 'uct-anvil')).toBe(true)
    const trash = document.body
      .querySelector('tbody .pi-trash')!
      .closest('button') as HTMLButtonElement
    fireEvent.click(trash)
    expect(stores.buildStore.hasRow('userCraftingTables', 'uct-anvil')).toBe(false)
  })

  it('updates costPerMinute when the input is committed', async () => {
    const stores = makeStores()
    renderPanel(stores)
    const input = Array.from(document.body.querySelectorAll('input')).find(
      (i) => (i as HTMLInputElement).value === '0.05'
    ) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '0.10' } })
    fireEvent.blur(input)
    await waitFor(() => {
      expect(stores.buildStore.getCell('userCraftingTables', 'uct-anvil', 'costPerMinute')).toBe(
        0.1
      )
    })
  })

  it('renders a "N/A" badge for a table with no plugin modules available', () => {
    const stores = makeStores()
    renderPanel(stores)
    expect(document.body.textContent).toMatch(/N\/A/i)
  })

  it('opens the confirm dialog when removing a table that has dependent recipes', async () => {
    const stores = makeStores()
    // Add a recipe attached to this table.
    stores.gameDataStore.setRow('recipes', 'r1', {
      id: 'r1',
      datasetId: DS,
      name: 'IronRecipe',
      familyName: 'Iron',
      skillId: '',
      requiredSkillLevel: 0,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: 'ct-anvil',
      baseCraftTime: 1,
      baseLaborCost: 0,
    })
    stores.buildStore.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD,
      recipeId: 'r1',
      roundFactor: 0,
    })
    renderPanel(stores)
    const trash = document.body
      .querySelector('tbody .pi-trash')!
      .closest('button') as HTMLButtonElement
    fireEvent.click(trash)
    // Confirm dialog now visible. Find the confirm button inside the dialog's
    // footer, not the trash icon button (which is also danger-styled).
    const dialog = await waitFor(() => screen.getByRole('dialog'))
    const dangerInDialog = dialog.querySelector('button.p-button-danger') as HTMLButtonElement
    expect(dangerInDialog).toBeInTheDocument()
    fireEvent.click(dangerInDialog)
    await waitFor(() => {
      expect(stores.buildStore.hasRow('userCraftingTables', 'uct-anvil')).toBe(false)
    })
    // The recipe row was deleted along with the table.
    expect(stores.buildStore.hasRow('userRecipes', 'ur1')).toBe(false)
  })

  it('renders the plugin module dropdown when modules are available', () => {
    const stores = makeStores({ withModules: true })
    renderPanel(stores)
    // The dropdown is rendered with `.p-dropdown` class. It replaces the N/A span.
    expect(document.body.querySelector('.p-dropdown')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/N\/A/i)
  })

  it('changes the selected plugin module via the dropdown', async () => {
    const stores = makeStores({ withModules: true })
    renderPanel(stores)
    const dropdown = document.body.querySelector('.p-dropdown') as HTMLElement
    fireEvent.click(dropdown)
    // Wait for the dropdown panel to open and click an option labeled "Basic Upgrade".
    const moduleOpt = await waitFor(() => screen.getByText(/BasicUpgrade/i))
    fireEvent.click(moduleOpt)
    expect(stores.buildStore.getCell('userCraftingTables', 'uct-anvil', 'pluginModuleId')).toBe(
      'pm-basic'
    )
  })

  it('searchTables is exercised when typing into the autocomplete', () => {
    const stores = makeStores()
    // Add an unadded crafting table so suggestions can include it.
    stores.gameDataStore.setRow('craftingTables', 'ct-pottery', {
      id: 'ct-pottery',
      datasetId: DS,
      name: 'PotteryWheel',
    })
    renderPanel(stores)
    const input = document.body.querySelector('.p-autocomplete-input') as HTMLInputElement
    fireEvent.input(input, { target: { value: 'pott' } })
    expect(input.value).toBe('pott')
  })

  it('clicking the cancel button in the delete dialog closes it without deleting', async () => {
    const stores = makeStores()
    stores.gameDataStore.setRow('recipes', 'r1', {
      id: 'r1',
      datasetId: DS,
      name: 'IronRecipe',
      familyName: 'Iron',
      skillId: '',
      requiredSkillLevel: 0,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: 'ct-anvil',
      baseCraftTime: 1,
      baseLaborCost: 0,
    })
    stores.buildStore.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD,
      recipeId: 'r1',
      roundFactor: 0,
    })
    renderPanel(stores)
    const trash = document.body
      .querySelector('tbody .pi-trash')!
      .closest('button') as HTMLButtonElement
    fireEvent.click(trash)
    const dialog = await waitFor(() => screen.getByRole('dialog'))
    const cancel = within(dialog)
      .getByText(/Cancel/i)
      .closest('button') as HTMLButtonElement
    fireEvent.click(cancel)
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(stores.buildStore.hasRow('userCraftingTables', 'uct-anvil')).toBe(true)
  })
})
