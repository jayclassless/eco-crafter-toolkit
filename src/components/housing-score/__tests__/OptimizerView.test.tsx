import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { createTestStores, makeWrapper, type TestStores } from '@/hooks/__tests__/store-wrapper'
import { clearGameDataIndexesCache } from '@/lib/game-data-indexes'

import { OptimizerView } from '../OptimizerView'

import '@/i18n'

let stores: TestStores

beforeEach(() => {
  stores = createTestStores()
})

/** A Bedroom that can actually be a room, plus Seating support so the support
 * cap is exercised, and a tier table with a real soft cap. */
function seedHousing() {
  const { gameDataStore } = stores
  gameDataStore.setRow('roomCategories', 'c1', {
    id: 'c1',
    datasetId: 'ds1',
    name: 'Bedroom',
    color: '#00B4A5',
    index: 0,
    affectsPropertyTypes: JSON.stringify(['Residence']),
    supportingRoomCategoryNames: JSON.stringify(['Seating']),
    maxSupportPercentOfPrimaryPerCategory: '{}',
  })
  gameDataStore.setRow('roomCategories', 'c2', {
    id: 'c2',
    datasetId: 'ds1',
    name: 'Seating',
    color: '#E5956E',
    index: 1,
    affectsPropertyTypes: JSON.stringify(['Residence']),
    supportingRoomCategoryNames: JSON.stringify([]),
    maxSupportPercentOfPrimaryPerCategory: '{}',
    maxSupportPercentOfPrimary: 0.3,
    canBeRoomCategory: false,
  })
  for (const [tierVal, softCap, hardCap] of [
    [3, 15, 30],
    [5, 25, 50],
  ]) {
    gameDataStore.setRow('roomTiers', `t${tierVal}`, {
      id: `t${tierVal}`,
      datasetId: 'ds1',
      tierVal,
      softCap,
      hardCap,
      diminishingReturnPercent: 0.65,
    })
  }
  gameDataStore.setRow('items', 'bed', {
    id: 'bed',
    datasetId: 'ds1',
    name: 'CastIronBedItem',
    isTag: false,
    housingCategory: 'Bedroom',
    housingBaseValue: 10,
    housingTypeForRoomLimit: 'Bed',
    housingDiminishingReturnMultiplier: 0.5,
  })
  gameDataStore.setRow('items', 'lamp', {
    id: 'lamp',
    datasetId: 'ds1',
    name: 'ElectricLampItem',
    isTag: false,
    housingCategory: 'Bedroom',
    housingBaseValue: 8,
    housingTypeForRoomLimit: 'Lights',
    housingDiminishingReturnMultiplier: 0.5,
    housingPowerType: 'Electric',
    housingPowerWatts: 60,
  })
  clearGameDataIndexesCache(gameDataStore)
}

function renderView() {
  const Wrapper = makeWrapper(stores)
  return render(
    <Wrapper>
      <OptimizerView datasetId="ds1" />
    </Wrapper>
  )
}

describe('OptimizerView', () => {
  it('shows the update-your-dataset state when there is no housing data', () => {
    renderView()
    expect(screen.getByText(/no housing data/i)).toBeInTheDocument()
  })

  it('scores a house and lists what to put in it', () => {
    seedHousing()
    renderView()
    expect(screen.getByText('Total Housing Score')).toBeInTheDocument()
    expect(screen.getByText('CastIronBedItem')).toBeInTheDocument()
    // Electricity is off by default, so the powered lamp is not in the plan.
    expect(screen.queryByText('ElectricLampItem')).not.toBeInTheDocument()
  })

  it('recomputes when a persisted assumption changes', () => {
    seedHousing()
    renderView()
    const before = screen.getByText('Total Housing Score').parentElement?.textContent
    act(() => {
      stores.uiStore.setCell('uiState', 'main', 'housingOptimizerTier', 3)
    })
    const after = screen.getByText('Total Housing Score').parentElement?.textContent
    expect(after).not.toEqual(before)
  })

  it('brings powered furnishings in once their grid is available', () => {
    seedHousing()
    renderView()
    expect(screen.queryByText('ElectricLampItem')).not.toBeInTheDocument()
    act(() => {
      stores.uiStore.setCell('uiState', 'main', 'housingOptimizerPower', 'Heat,Mechanical,Electric')
    })
    expect(screen.getByText('ElectricLampItem')).toBeInTheDocument()
  })

  it('names interchangeable alternatives in alphabetical order', () => {
    seedHousing()
    // Three fireplaces with identical scoring stats. Only one is placed; the
    // other two are offered as swaps. The ids deliberately run opposite to the
    // names, because the solver orders equivalents by item id — so an unsorted
    // tooltip would come out as Shale, Basalt.
    for (const [id, name] of [
      ['f1', 'Ashlar Zircon Fireplace'],
      ['f2', 'Ashlar Shale Fireplace'],
      ['f3', 'Ashlar Basalt Fireplace'],
    ]) {
      stores.gameDataStore.setRow('items', id, {
        id,
        datasetId: 'ds1',
        name,
        isTag: false,
        housingCategory: 'Bedroom',
        housingBaseValue: 9,
        housingTypeForRoomLimit: 'Fireplace',
        housingDiminishingReturnMultiplier: 0.1,
      })
    }
    clearGameDataIndexesCache(stores.gameDataStore)
    renderView()

    // The lowest id is the one placed, so the other two are the alternatives.
    expect(screen.getByText('Ashlar Zircon Fireplace')).toBeInTheDocument()

    const marker = document.querySelector('.optimizer-alternatives')
    expect(marker).not.toBeNull()
    const lines = marker!.getAttribute('data-pr-tooltip')!.split('\n').slice(1)
    expect(lines).toEqual(['Ashlar Basalt Fireplace', 'Ashlar Shale Fireplace'])
  })

  it('persists the unlocked-skill selection as stable skill names', () => {
    seedHousing()
    // A skill row plus the recipe that links it to the bed.
    stores.gameDataStore.setRow('skills', 's1', {
      id: 's1',
      datasetId: 'ds1',
      name: 'CarpentrySkill',
    })
    stores.gameDataStore.setRow('recipes', 'r1', {
      id: 'r1',
      datasetId: 'ds1',
      name: 'BedRecipe',
      skillId: 's1',
    })
    stores.gameDataStore.setRow('recipeElements', 'e1', {
      id: 'e1',
      datasetId: 'ds1',
      recipeId: 'r1',
      itemOrTagId: 'bed',
      isProduct: true,
      baseQuantity: 1,
      index: 0,
    })
    clearGameDataIndexesCache(stores.gameDataStore)
    renderView()
    expect(screen.getByText('CastIronBedItem')).toBeInTheDocument()

    // Deselecting the only crafting skill drops the bed from the plan, and the
    // store records the game name rather than the dataset-scoped row id.
    act(() => {
      stores.uiStore.setCell('uiState', 'main', 'housingOptimizerSkills', '!unskilled')
    })
    expect(screen.queryByText('CastIronBedItem')).not.toBeInTheDocument()

    act(() => {
      stores.uiStore.setCell('uiState', 'main', 'housingOptimizerSkills', 'CarpentrySkill')
    })
    expect(screen.getByText('CastIronBedItem')).toBeInTheDocument()
  })

  it('says so plainly when the constraints leave nothing to build', () => {
    seedHousing()
    renderView()
    // No room may contribute less than this, so nothing qualifies.
    act(() => {
      stores.uiStore.setCell('uiState', 'main', 'housingOptimizerMinRoomContribution', 10_000)
    })
    expect(screen.getByText(/no rooms scored/i)).toBeInTheDocument()
  })
})
