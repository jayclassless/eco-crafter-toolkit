import { fireEvent, render, screen } from '@testing-library/react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { describe, expect, it } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { AddRecipeDialog } from '../AddRecipeDialog'

import '@/i18n'

const DS = 'ds1'
const BUILD = 'b1'

function stubPersister(): IndexedDbPersister {
  return { save: async () => {}, schedule: async () => {} } as unknown as IndexedDbPersister
}

function makeStores(includeUserSkill = true) {
  const gameDataStore = createGameDataStore()
  const buildStore = createBuildStore()
  const uiStore = createUIStore()

  // Skill + recipe
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
  if (includeUserSkill) {
    buildStore.setRow('userSkills', 'us-mine', {
      id: 'us-mine',
      buildId: BUILD,
      skillId: 'sk-mine',
      level: 1,
    })
  }

  return { gameDataStore, buildStore, uiStore }
}

function renderDialog(
  stores: { gameDataStore: Store; buildStore: Store; uiStore: Store },
  options: { existingRecipeIds?: Set<string>; visible?: boolean } = {}
) {
  return render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <AddRecipeDialog
        visible={options.visible ?? true}
        onHide={() => {}}
        buildId={BUILD}
        datasetId={DS}
        existingRecipeIds={options.existingRecipeIds ?? new Set()}
      />
    </StoreContext.Provider>
  )
}

describe('AddRecipeDialog', () => {
  it('renders the dialog with the mode toggle and search input', () => {
    const stores = makeStores()
    renderDialog(stores)
    expect(screen.getByText('Add Recipe')).toBeInTheDocument()
    expect(screen.getByText("Recipes from Build's Skills")).toBeInTheDocument()
    expect(screen.getByText('Any Standard Recipe')).toBeInTheDocument()
    expect(screen.getByText('Custom Recipes')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Search recipes/i)).toBeInTheDocument()
  })

  it('starts in standard-mode when no skill recipes are available', () => {
    const stores = makeStores(false)
    renderDialog(stores)
    // When no userSkills exist, "Recipes from Build's Skills" is disabled and
    // the dialog defaults to "Any Standard Recipe".
    const skillBtn = screen.getByText("Recipes from Build's Skills").closest('div')
    expect(skillBtn?.className).toContain('p-disabled')
  })

  it('shows a hint when in any-mode but the build has no skills', () => {
    const stores = makeStores(false)
    renderDialog(stores)
    expect(screen.getByText(/No more skill-matched recipes to add/i)).toBeInTheDocument()
  })

  it('Add button is disabled when nothing is selected', () => {
    const stores = makeStores()
    renderDialog(stores)
    const addBtn = screen.getByRole('button', { name: /^Add$/i })
    expect(addBtn).toBeDisabled()
  })

  it('does not render the dialog when visible is false', () => {
    const stores = makeStores()
    renderDialog(stores, { visible: false })
    expect(screen.queryByText('Add Recipe')).not.toBeInTheDocument()
  })

  it('switching modes clears the selection so Add stays disabled', () => {
    const stores = makeStores(false)
    renderDialog(stores)
    fireEvent.click(screen.getByText('Any Standard Recipe'))
    expect(screen.getByRole('button', { name: /^Add$/i })).toBeDisabled()
  })

  it('opening the autocomplete dropdown surfaces searchable recipes (any mode)', () => {
    const stores = makeStores(false)
    renderDialog(stores)
    const dropdown = document.body.querySelector('.p-autocomplete-dropdown') as HTMLButtonElement
    fireEvent.click(dropdown)
    expect(dropdown).toBeInTheDocument()
  })

  it('does not show the Manage Custom button outside of the Custom Recipes mode', () => {
    const stores = makeStores()
    renderDialog(stores)
    expect(screen.queryByRole('button', { name: /manage custom recipes/i })).toBeNull()
  })

  it('shows the Manage Custom button when in Custom Recipes mode', () => {
    const stores = makeStores()
    // Add a custom recipe so the Custom Recipes option is meaningful.
    stores.gameDataStore.setRow('recipes', 'r-custom', {
      id: 'r-custom',
      datasetId: DS,
      name: 'CustomRecipe',
      familyName: 'Custom',
      skillId: 'sk-mine',
      requiredSkillLevel: 0,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: 'ct1',
      baseCraftTime: 0,
      baseLaborCost: 0,
      isCustom: true,
    })
    renderDialog(stores)
    fireEvent.click(screen.getByText('Custom Recipes'))
    expect(screen.getByRole('button', { name: /manage custom recipes/i })).toBeInTheDocument()
  })

  it('Custom Recipes mode shows an empty hint when no custom recipes exist', () => {
    const stores = makeStores()
    renderDialog(stores)
    fireEvent.click(screen.getByText('Custom Recipes'))
    expect(screen.getByText(/no custom recipes yet/i)).toBeInTheDocument()
  })

  it("shows each recipe's skill name alongside the recipe in the suggestions", () => {
    const stores = makeStores()
    renderDialog(stores)
    const dropdown = document.body.querySelector('.p-autocomplete-dropdown') as HTMLButtonElement
    fireEvent.click(dropdown)
    // The recipe and its owning skill name both appear in the option row.
    expect(screen.getByText('IronRecipe')).toBeInTheDocument()
    expect(screen.getByText('MiningSkill')).toBeInTheDocument()
  })

  it('Any Standard Recipe mode excludes custom recipes', () => {
    const stores = makeStores()
    stores.gameDataStore.setRow('recipes', 'r-custom', {
      id: 'r-custom',
      datasetId: DS,
      name: 'CustomRecipe',
      familyName: 'Custom',
      skillId: 'sk-mine',
      requiredSkillLevel: 0,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: 'ct1',
      baseCraftTime: 0,
      baseLaborCost: 0,
      isCustom: true,
    })
    renderDialog(stores)
    fireEvent.click(screen.getByText('Any Standard Recipe'))
    const dropdown = document.body.querySelector('.p-autocomplete-dropdown') as HTMLButtonElement
    fireEvent.click(dropdown)
    // Standard recipe is in the suggestions list.
    expect(screen.getByText('IronRecipe')).toBeInTheDocument()
    // Custom recipe must not appear.
    expect(screen.queryByText('CustomRecipe')).toBeNull()
  })
})
