import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { describe, expect, it } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { OptionsPanel } from '../OptionsPanel'

import '@/i18n'

const BUILD = 'b1'

function stubPersister(): IndexedDbPersister {
  return { save: async () => {}, schedule: async () => {} } as unknown as IndexedDbPersister
}

function makeStores() {
  const gameDataStore = createGameDataStore()
  const buildStore = createBuildStore()
  const uiStore = createUIStore()

  buildStore.setRow('builds', BUILD, {
    id: BUILD,
    datasetId: 'ds1',
    name: 'TestBuild',
    createdAt: '2026-01-01',
  })
  buildStore.setRow('userSettings', 'st1', {
    id: 'st1',
    buildId: BUILD,
    marginType: 'markup',
    calorieCost: 50,
    applyMarginBetweenSkills: true,
  })
  buildStore.setRow('userMargins', 'm1', {
    id: 'm1',
    buildId: BUILD,
    name: 'Default',
    percent: 20,
    isDefault: true,
  })
  buildStore.setRow('userMargins', 'm2', {
    id: 'm2',
    buildId: BUILD,
    name: 'Premium',
    percent: 50,
    isDefault: false,
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
      <OptionsPanel buildId={BUILD} />
    </StoreContext.Provider>
  )
}

describe('OptionsPanel (smoke)', () => {
  it('renders one row per user margin', () => {
    const stores = makeStores()
    renderPanel(stores)
    const rows = document.body.querySelectorAll('.p-datatable-tbody tr')
    // 2 margins
    expect(rows.length).toBeGreaterThanOrEqual(2)
  })

  it('renders the calorie cost value', () => {
    const stores = makeStores()
    renderPanel(stores)
    const inputs = Array.from(document.body.querySelectorAll('input')) as HTMLInputElement[]
    expect(inputs.some((i) => i.value === '50')).toBe(true)
  })

  it('renders the names of the margins', () => {
    const stores = makeStores()
    renderPanel(stores)
    expect(screen.getByDisplayValue('Default')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Premium')).toBeInTheDocument()
  })

  it('renames a margin via its name input', () => {
    const stores = makeStores()
    renderPanel(stores)
    const nameInput = screen.getByDisplayValue('Default') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Standard' } })
    expect(stores.buildStore.getCell('userMargins', 'm1', 'name')).toBe('Standard')
  })

  it('clicking the trash on a non-default margin (no recipes) deletes it immediately', () => {
    const stores = makeStores()
    renderPanel(stores)
    expect(stores.buildStore.hasRow('userMargins', 'm2')).toBe(true)
    // The row for "Premium" has the trash button; the "Default" row's trash
    // button is disabled. Find the second tbody trash icon.
    const trashes = document.body.querySelectorAll('tbody .pi-trash')
    const enabled = Array.from(trashes)
      .map((i) => i.closest('button') as HTMLButtonElement)
      .filter((b) => !b.disabled)
    fireEvent.click(enabled[0])
    expect(stores.buildStore.hasRow('userMargins', 'm2')).toBe(false)
  })

  it('clicking the + Add margin button creates a new margin row', () => {
    const stores = makeStores()
    renderPanel(stores)
    const before = stores.buildStore
      .getRowIds('userMargins')
      .filter((id) => stores.buildStore.getCell('userMargins', id, 'buildId') === BUILD).length
    fireEvent.click(screen.getByText(/Add margin/i))
    const after = stores.buildStore
      .getRowIds('userMargins')
      .filter((id) => stores.buildStore.getCell('userMargins', id, 'buildId') === BUILD).length
    expect(after).toBe(before + 1)
  })

  it('toggles applyMarginBetweenSkills via the labeled checkbox', () => {
    const stores = makeStores()
    renderPanel(stores)
    const cb = document.body.querySelector('#marginBetweenSkills') as HTMLInputElement
    fireEvent.click(cb)
    expect(stores.buildStore.getCell('userSettings', 'st1', 'applyMarginBetweenSkills')).toBe(false)
  })

  it('disables the trash button on the only remaining margin', () => {
    const stores = makeStores()
    stores.buildStore.delRow('userMargins', 'm2')
    renderPanel(stores)
    const trash = document.body
      .querySelector('tbody .pi-trash')!
      .closest('button') as HTMLButtonElement
    expect(trash.disabled).toBe(true)
  })

  it('opens the delete-margin confirm dialog when removing a margin attached to recipes', async () => {
    const stores = makeStores()
    stores.buildStore.setRow('userRecipes', 'ur1', {
      id: 'ur1',
      buildId: BUILD,
      recipeId: 'r1',
      roundFactor: 0,
    })
    stores.buildStore.setRow('userRecipeMargins', 'urm1', {
      id: 'urm1',
      buildId: BUILD,
      userRecipeId: 'ur1',
      userMarginId: 'm2',
    })
    renderPanel(stores)
    const trashes = document.body.querySelectorAll('tbody .pi-trash')
    const enabled = Array.from(trashes)
      .map((i) => i.closest('button') as HTMLButtonElement)
      .filter((b) => !b.disabled)
    fireEvent.click(enabled[0])
    const dialog = await waitFor(() => screen.getByRole('dialog'))
    const ok = within(dialog).getByText(/Ok/i).closest('button') as HTMLButtonElement
    fireEvent.click(ok)
    await waitFor(() => {
      expect(stores.buildStore.hasRow('userMargins', 'm2')).toBe(false)
    })
  })

  it('changes the margin type via the dropdown', async () => {
    const stores = makeStores()
    renderPanel(stores)
    const dropdown = document.body.querySelector('.p-dropdown') as HTMLElement
    fireEvent.click(dropdown)
    const grossOption = await waitFor(() => screen.getByText(/Gross Margin/i))
    fireEvent.click(grossOption)
    expect(stores.buildStore.getCell('userSettings', 'st1', 'marginType')).toBe('grossMargin')
  })
})
