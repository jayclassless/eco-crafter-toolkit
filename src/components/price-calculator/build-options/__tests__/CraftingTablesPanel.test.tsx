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
      slot: 'Specialty',
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
    specialtyModuleId: '',
    costPerMinute: 0.05,
  })

  return { gameDataStore, buildStore, uiStore }
}

/** The Upgrade cell's button, which opens the module popover. It's the only
 * button in the table body that isn't the row's delete action. */
function moduleTrigger(): HTMLButtonElement {
  const btn = Array.from(document.body.querySelectorAll('tbody button')).find(
    (b) => !b.querySelector('.pi-trash')
  )
  expect(btn, 'no module popover trigger rendered').toBeTruthy()
  return btn as HTMLButtonElement
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

  it('renders a module popover trigger instead of N/A when modules are available', () => {
    const stores = makeStores({ withModules: true })
    renderPanel(stores)
    expect(moduleTrigger()).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/N\/A/i)
  })

  it('shows the installed modules as icons in the cell', () => {
    const stores = makeStores({ withModules: true })
    stores.buildStore.setCell('userCraftingTables', 'uct-anvil', 'specialtyModuleId', 'pm-basic')
    renderPanel(stores)
    const icons = Array.from(document.body.querySelectorAll('tbody img')).map((i) =>
      i.getAttribute('alt')
    )
    expect(icons).toContain('BasicUpgrade')
  })

  it('scopes the module list to the row dataset', () => {
    // The join-table scan this replaced matched on craftingTableId alone. Row
    // ids are UUIDs so a collision is unlikely, but several datasets stay
    // installed side by side and the filter is what makes it correct.
    const stores = makeStores({ withModules: true })
    stores.gameDataStore.setCell('pluginModules', 'pm-basic', 'datasetId', 'other-ds')
    renderPanel(stores)
    expect(document.body.textContent).toMatch(/N\/A/i)
  })

  it('installs a module via the popover checkbox and clears it again', async () => {
    // The table's one Specialty candidate makes this a single-candidate slot,
    // so the popover renders a checkbox rather than a dropdown. Installation is
    // permanent in game, but the planner's controls are deliberately reversible
    // — comparing configurations before spending stars is the whole point.
    const stores = makeStores({ withModules: true })
    renderPanel(stores)
    fireEvent.click(moduleTrigger())
    const label = await waitFor(() => screen.getByText(/BasicUpgrade/i))
    fireEvent.click(label)
    expect(stores.buildStore.getCell('userCraftingTables', 'uct-anvil', 'specialtyModuleId')).toBe(
      'pm-basic'
    )

    fireEvent.click(screen.getByText(/BasicUpgrade/i))
    expect(stores.buildStore.getCell('userCraftingTables', 'uct-anvil', 'specialtyModuleId')).toBe(
      ''
    )
  })

  it('renders one popover row per slot the table exposes, with star costs', async () => {
    const stores = makeStores({ withModules: true })
    // A v14-shaped table: a Basic module alongside the Specialty one. The slot
    // set is DERIVED from the modules the table accepts, because the game's
    // table->slot wiring lives in compiled code with no dataset representation.
    stores.gameDataStore.setRow('pluginModules', 'pm-generic', {
      id: 'pm-generic',
      datasetId: DS,
      name: 'BasicUpgradeItem',
      slot: 'Basic',
    })
    stores.gameDataStore.setRow('craftingTablePluginModules', 'ctpm-generic', {
      id: 'ctpm-generic',
      datasetId: DS,
      craftingTableId: 'ct-anvil',
      pluginModuleId: 'pm-generic',
    })
    renderPanel(stores)
    fireEvent.click(moduleTrigger())
    const panel = await waitFor(() => {
      const el = document.body.querySelector('.p-overlaypanel')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    // Basic before Specialty, matching the game's core-slot order.
    expect(panel.textContent).toMatch(/Basic[\s\S]*Specialty/)
    // Basic costs 1 star; Specialty is free and shows no star chip.
    expect(panel.querySelectorAll('.pi-star-fill')).toHaveLength(1)

    fireEvent.click(within(panel).getByText('BasicUpgradeItem'))
    expect(stores.buildStore.getCell('userCraftingTables', 'uct-anvil', 'basicModuleId')).toBe(
      'pm-generic'
    )
    // The Specialty slot is untouched — slots are independent.
    expect(stores.buildStore.getCell('userCraftingTables', 'uct-anvil', 'specialtyModuleId')).toBe(
      ''
    )
  })

  it('hides deprecated modules, and the slot they were the only candidate for', async () => {
    const stores = makeStores({ withModules: true })
    stores.gameDataStore.setRow('pluginModules', 'pm-dead', {
      id: 'pm-dead',
      datasetId: DS,
      name: 'DeprecatedUpgradeItem',
      slot: 'Modern',
      isDeprecated: true,
    })
    stores.gameDataStore.setRow('craftingTablePluginModules', 'ctpm-dead', {
      id: 'ctpm-dead',
      datasetId: DS,
      craftingTableId: 'ct-anvil',
      pluginModuleId: 'pm-dead',
    })
    renderPanel(stores)
    fireEvent.click(moduleTrigger())
    const panel = await waitFor(() => {
      const el = document.body.querySelector('.p-overlaypanel')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    expect(panel.textContent).not.toMatch(/DeprecatedUpgradeItem/)
    // No player can obtain it, so it must not conjure a Modern slot either.
    expect(panel.textContent).not.toMatch(/Modern/)
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

  it('opens the autocomplete via the dropdown button to drive completeMethod with profession grouping', async () => {
    const stores = makeStores()
    // Add a skill linked to a profession, plus two tables that share that
    // profession, so the grouped output paths run.
    stores.gameDataStore.setRow('skills', 'sk-smith', {
      id: 'sk-smith',
      datasetId: DS,
      name: 'BlacksmithSkill',
      profession: 'Blacksmith',
      maxLevel: 7,
      laborReducePercent: '[1,1,1,1,1,1,1,1]',
    })
    stores.gameDataStore.setRow('craftingTables', 'ct-pottery', {
      id: 'ct-pottery',
      datasetId: DS,
      name: 'PotteryWheel',
    })
    stores.gameDataStore.setRow('craftingTables', 'ct-anvil2', {
      id: 'ct-anvil2',
      datasetId: DS,
      name: 'AnvilItem2',
    })
    // Recipes linking tables to a skill / profession.
    stores.gameDataStore.setRow('recipes', 'r-smith', {
      id: 'r-smith',
      datasetId: DS,
      name: 'SmithRecipe',
      familyName: 'Smith',
      skillId: 'sk-smith',
      requiredSkillLevel: 0,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: 'ct-anvil2',
      baseCraftTime: 0,
      baseLaborCost: 0,
    })
    renderPanel(stores)
    // Clicking the dropdown trigger fires completeMethod with empty query —
    // the search builds the grouped list internally.
    const dropdownTrigger = document.body.querySelector(
      '.p-autocomplete-dropdown'
    ) as HTMLButtonElement
    expect(dropdownTrigger).not.toBeNull()
    fireEvent.click(dropdownTrigger)
    await waitFor(() => {
      // The grouped output paths produced "Other" (no profession for some
      // tables) and "Blacksmith" labels in the suggestions panel — that's
      // proof that searchTables ran and grouped at least one table by
      // profession.
      const text = document.body.textContent ?? ''
      expect(text).toMatch(/Blacksmith/)
      expect(text).toMatch(/Other/)
    })
  })

  it('renders a dropdown, not a checkbox, when a slot has more than one candidate', async () => {
    const stores = makeStores()
    // Two plugin modules: one vanilla (no skill), one specialized.
    stores.gameDataStore.setRow('pluginModules', 'pm-vanilla', {
      id: 'pm-vanilla',
      datasetId: DS,
      name: 'VanillaUpgrade',
      slot: 'Specialty',
    })
    // Unscoped bonus -> "vanilla" (general purpose), sorted first.
    stores.gameDataStore.setRow('pluginModuleBonuses', 'pmb-v', {
      id: 'pmb-v',
      datasetId: DS,
      pluginModuleId: 'pm-vanilla',
      bonusIndex: 0,
      action: 'ResourceCost',
      effectType: 'Multiplicative',
      value: 0.9,
      skillIds: '[]',
    })
    stores.gameDataStore.setRow('pluginModules', 'pm-special', {
      id: 'pm-special',
      datasetId: DS,
      name: 'SpecialUpgrade',
      slot: 'Specialty',
    })
    // Skill-scoped bonus -> specialized, sorted after the vanilla ones.
    stores.gameDataStore.setRow('pluginModuleBonuses', 'pmb-s', {
      id: 'pmb-s',
      datasetId: DS,
      pluginModuleId: 'pm-special',
      bonusIndex: 0,
      action: 'ResourceCost',
      effectType: 'Multiplicative',
      value: 0.5,
      skillIds: '["sk-smith"]',
    })
    stores.gameDataStore.setRow('craftingTablePluginModules', 'ctpm-v', {
      id: 'ctpm-v',
      datasetId: DS,
      craftingTableId: 'ct-anvil',
      pluginModuleId: 'pm-vanilla',
    })
    stores.gameDataStore.setRow('craftingTablePluginModules', 'ctpm-s', {
      id: 'ctpm-s',
      datasetId: DS,
      craftingTableId: 'ct-anvil',
      pluginModuleId: 'pm-special',
    })
    renderPanel(stores)
    fireEvent.click(moduleTrigger())
    const dropdown = await waitFor(() => {
      const el = document.body.querySelector('.p-overlaypanel .p-dropdown')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    fireEvent.click(dropdown)
    await waitFor(() => {
      expect(screen.getByText(/VanillaUpgrade/)).toBeInTheDocument()
      expect(screen.getByText(/SpecialUpgrade/)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText(/SpecialUpgrade/))
    expect(stores.buildStore.getCell('userCraftingTables', 'uct-anvil', 'specialtyModuleId')).toBe(
      'pm-special'
    )
  })

  it('skips userCraftingTables rows belonging to other builds', () => {
    const stores = makeStores()
    // Add a userCraftingTables row from another build — must NOT render.
    stores.buildStore.setRow('userCraftingTables', 'uct-other', {
      id: 'uct-other',
      buildId: 'other-build',
      craftingTableId: 'ct-anvil',
      specialtyModuleId: '',
      costPerMinute: 0.99,
    })
    renderPanel(stores)
    const inputs = Array.from(document.body.querySelectorAll('input')) as HTMLInputElement[]
    // Only the original build's costPerMinute (0.05) appears, not 0.99.
    expect(inputs.some((i) => i.value === '0.99')).toBe(false)
  })

  it('skips plugin modules whose name is empty', () => {
    const stores = makeStores()
    // pluginModule without a name should be filtered out.
    stores.gameDataStore.setRow('pluginModules', 'pm-nameless', {
      id: 'pm-nameless',
      datasetId: DS,
      name: '',
      slot: 'Specialty',
    })
    stores.gameDataStore.setRow('craftingTablePluginModules', 'ctpm-x', {
      id: 'ctpm-x',
      datasetId: DS,
      craftingTableId: 'ct-anvil',
      pluginModuleId: 'pm-nameless',
    })
    renderPanel(stores)
    // Since the nameless module is the only one, the table still falls back
    // to the N/A indicator.
    expect(document.body.textContent).toMatch(/N\/A/i)
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
