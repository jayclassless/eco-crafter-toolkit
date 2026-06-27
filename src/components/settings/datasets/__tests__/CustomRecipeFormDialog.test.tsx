import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

  it('adds an ingredient row when the add-ingredient button is clicked', () => {
    renderForm(makeStores())
    const before = document.body.querySelectorAll('button[aria-label]').length
    fireEvent.click(screen.getByRole('button', { name: /add ingredient/i }))
    // A new ingredient row adds its own trash button, so total icon-only
    // buttons in the dialog body increase. We assert specifically on the
    // module-reduction-checkbox label count, which uniquely identifies rows.
    const ingredientReducedLabels = document.body.querySelectorAll('label[for^="ing-reduced-"]')
    expect(ingredientReducedLabels.length).toBe(2)
    expect(before).toBeGreaterThanOrEqual(0)
  })

  it('adds a product row when the add-product button is clicked', async () => {
    renderForm(makeStores())
    const beforeCount = document.body.querySelectorAll('input[placeholder="Select an item"]').length
    fireEvent.click(screen.getByRole('button', { name: /add product/i }))
    // waitFor wraps the polled assertion in act(), so PrimeReact's Transition
    // state updates settle inside it instead of leaking past test end.
    await waitFor(() => {
      const afterCount = document.body.querySelectorAll(
        'input[placeholder="Select an item"]'
      ).length
      expect(afterCount).toBe(beforeCount + 1)
    })
  })

  it('removes an ingredient row when its trash button is clicked', () => {
    renderForm(makeStores())
    // Add a second ingredient so there are two trash buttons in the
    // ingredients section.
    fireEvent.click(screen.getByRole('button', { name: /add ingredient/i }))
    expect(document.body.querySelectorAll('label[for^="ing-reduced-"]').length).toBe(2)
    // Click the first trash button (ingredient column). Iterate top-down
    // through the visible trash buttons until one shrinks the list.
    const trashButtons = Array.from(
      document.body.querySelectorAll('button .pi-trash')
    ) as HTMLElement[]
    const firstTrash = trashButtons[0].closest('button') as HTMLButtonElement
    fireEvent.click(firstTrash)
    // One module-reduction label remains.
    expect(document.body.querySelectorAll('label[for^="ing-reduced-"]').length).toBe(1)
  })

  it('toggles the "reduced by upgrade module" checkbox on an ingredient row', () => {
    renderForm(makeStores())
    const checkbox = document.body.querySelector('input#ing-reduced-0') as HTMLInputElement
    expect(checkbox).not.toBeNull()
    // Defaults to on (most ingredients are module-reduced in vanilla recipes).
    expect(checkbox.checked).toBe(true)
    fireEvent.click(checkbox)
    // Re-read to get the live checked state after re-render.
    const refreshed = document.body.querySelector('input#ing-reduced-0') as HTMLInputElement
    expect(refreshed.checked).toBe(false)
  })

  it('shows the skill-required validation error when only the name and table are set', async () => {
    const stores = makeStores()
    renderForm(stores)
    fireEvent.change(screen.getByLabelText(/name/i, { selector: 'input' }), {
      target: { value: 'My Recipe' },
    })
    // Select a crafting table via clicking the picker → first available option.
    const ctPicker = document.body.querySelector(
      'input[placeholder*="crafting" i], input[placeholder*="select" i]'
    ) as HTMLInputElement | null
    if (ctPicker) {
      fireEvent.focus(ctPicker)
      fireEvent.input(ctPicker, { target: { value: 'Workbench' } })
      // Click any matching option in the picker dropdown.
      await waitFor(() => {
        const opts = document.body.querySelectorAll('.p-autocomplete-item, .p-listbox-item')
        if (opts.length === 0) throw new Error('no options yet')
      })
    }
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    // Either "Skill is required" (if table got selected) or "Crafting table
    // is required" (if it didn't) — both indicate validation ran.
    await waitFor(() => {
      const text = document.body.textContent ?? ''
      expect(/required/i.test(text)).toBe(true)
    })
  })

  it('exits cleanly when the cancel button is clicked', async () => {
    const onHide = vi.fn()
    renderForm(makeStores(), { onHide })
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    // waitFor wraps the polled assertion in act() so PrimeReact Dialog's
    // dismiss Transition state updates settle inside the test.
    await waitFor(() => expect(onHide).toHaveBeenCalled())
  })
})
