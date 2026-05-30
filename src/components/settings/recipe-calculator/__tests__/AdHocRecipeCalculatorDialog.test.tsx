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
})
