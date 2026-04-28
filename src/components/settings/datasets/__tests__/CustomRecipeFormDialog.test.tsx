import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { __resetLocalizedNameStore } from '@/stores/localized-name-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { CustomRecipeFormDialog } from '../CustomRecipeFormDialog'

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
    importedAt: '',
    updatedAt: '',
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
  gameDataStore.setRow('items', 'item-wood', {
    datasetId: DS,
    name: 'Wood',
    isTag: false,
    isPart: false,
    isCustom: false,
  })
  gameDataStore.setRow('items', 'item-plank', {
    datasetId: DS,
    name: 'Plank',
    isTag: false,
    isPart: false,
    isCustom: false,
  })
  return { gameDataStore, buildStore, uiStore }
}

function renderForm(
  stores: ReturnType<typeof makeStores>,
  opts: { recipeId?: string; visible?: boolean; onHide?: () => void } = {}
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
      <CustomRecipeFormDialog
        visible={opts.visible ?? true}
        onHide={opts.onHide ?? (() => {})}
        datasetId={DS}
        recipeId={opts.recipeId}
      />
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

describe('CustomRecipeFormDialog', () => {
  it('opens in create mode with the New Custom Recipe header', () => {
    renderForm(makeStores())
    expect(screen.getByText(/new custom recipe/i)).toBeInTheDocument()
  })

  it('shows a validation error when saving without a name', async () => {
    const stores = makeStores()
    renderForm(stores)
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByText(/name is required/i)).toBeInTheDocument())
    expect(stores.gameDataStore.getRowIds('recipes')).toHaveLength(0)
  })

  it('shows a validation error when saving without a crafting table', async () => {
    const stores = makeStores()
    renderForm(stores)
    fireEvent.change(screen.getByLabelText(/name/i, { selector: 'input' }), {
      target: { value: 'My Recipe' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByText(/crafting table is required/i)).toBeInTheDocument())
  })

  it('opens in edit mode with the recipe form prefilled', () => {
    const stores = makeStores()
    stores.gameDataStore.setRow('recipes', 'r-existing', {
      datasetId: DS,
      name: 'Existing Recipe',
      familyName: 'Existing Recipe',
      skillId: 'skill-mining',
      requiredSkillLevel: 3,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: 'ct1',
      baseCraftTime: 7,
      baseLaborCost: 42,
      isCustom: true,
    })
    stores.gameDataStore.setRow('recipeElements', 're-in', {
      datasetId: DS,
      recipeId: 'r-existing',
      itemOrTagId: 'item-wood',
      baseQuantity: -2,
      isProduct: false,
      index: 0,
    })
    stores.gameDataStore.setRow('recipeElements', 're-out', {
      datasetId: DS,
      recipeId: 'r-existing',
      itemOrTagId: 'item-plank',
      baseQuantity: 1,
      isProduct: true,
      index: 1,
    })

    renderForm(stores, { recipeId: 'r-existing' })

    expect(screen.getByText(/edit custom recipe/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Existing Recipe')).toBeInTheDocument()
    // Numeric fields render as InputText with formatted numeric values.
    expect(screen.getByDisplayValue('42')).toBeInTheDocument() // labor
    expect(screen.getByDisplayValue('7')).toBeInTheDocument() // craft time
    expect(screen.getByDisplayValue('3')).toBeInTheDocument() // required skill level
  })

  it('does not render the dialog body when visible=false', () => {
    renderForm(makeStores(), { visible: false })
    expect(screen.queryByText(/new custom recipe/i)).toBeNull()
  })
})
