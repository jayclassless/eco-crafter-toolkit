import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { describe, expect, it } from 'vitest'

import { usePriceSignal } from '@/hooks/use-prices-signal'
import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { GatheringCalculatorDialog } from '../GatheringCalculatorDialog'

import '@/i18n'

const DS = 'ds1'
const BUILD = 'b1'

function stubPersister(): IndexedDbPersister {
  return { save: async () => {}, schedule: async () => {} } as unknown as IndexedDbPersister
}

function makeStores(opts: { withGatheringData?: boolean } = {}) {
  const { withGatheringData = true } = opts
  const gameDataStore = createGameDataStore()
  const buildStore = createBuildStore()
  const uiStore = createUIStore()

  gameDataStore.setRow('skills', 'sk-mine', {
    id: 'sk-mine',
    datasetId: DS,
    name: 'MiningSkill',
    maxLevel: 7,
    laborReducePercent: '[1]',
  })
  gameDataStore.setRow('skills', 'sk-log', {
    id: 'sk-log',
    datasetId: DS,
    name: 'LoggingSkill',
    maxLevel: 7,
    laborReducePercent: '[1]',
  })
  gameDataStore.setRow('skills', 'sk-hunt', {
    id: 'sk-hunt',
    datasetId: DS,
    name: 'HuntingSkill',
    maxLevel: 7,
    laborReducePercent: '[1]',
  })
  gameDataStore.setRow('talents', 'tal-eff', {
    id: 'tal-eff',
    datasetId: DS,
    skillId: 'sk-mine',
    name: 'MiningToolEfficiencyTalent',
    talentGroupName: 'g',
    value: 0.8,
    level: 3,
  })

  if (withGatheringData) {
    const item = (id: string, name: string, extra: Record<string, unknown> = {}) =>
      gameDataStore.setRow('items', id, { id, datasetId: DS, name, isTag: false, ...extra })
    const tool = (
      id: string,
      itemId: string,
      kind: string,
      tier: number,
      extra: Record<string, unknown> = {}
    ) =>
      gameDataStore.setRow('gatheringTools', id, {
        id,
        datasetId: DS,
        itemId,
        kind,
        tier,
        baseCalories: 20,
        calorieSkillId: 'sk-mine',
        baseDamage: tier,
        damageUsesToolCurve: false,
        efficiencyTalentId: '',
        strengthTalentId: '',
        maxTake: 0,
        ...extra,
      })

    item('it-granite', 'GraniteItem', {
      minableHardness: 3,
      rubbleItemsPerBlock: 4,
      rubbleMaxItemsPerBlock: 4,
      rubbleExtraHitsPerBlock: 0.75,
    })
    item('it-dirt', 'DirtItem', { requiresShovel: true })
    item('it-spruce-log', 'SpruceLogItem')
    item('it-deer', 'DeerCarcassItem', { animalHealth: 6 })
    item('it-arrow', 'ArrowItem')
    item('it-boots', 'BuilderBootsItem', { clothingCalorieRate: -0.3 })
    item('it-pack', 'WorkBackpackItem', { clothingCalorieRate: -0.1 })
    item('it-stone-pick', 'StonePickaxeItem')
    item('it-steel-pick', 'SteelPickaxeItem')
    item('it-axe', 'SteelAxeItem')
    item('it-bow', 'WoodenBowItem')
    item('it-shovel', 'WoodenShovelItem')

    // Two pickaxe tiers so the tool dropdown has something to switch between.
    tool('gt-stone-pick', 'it-stone-pick', 'Pickaxe', 1, { efficiencyTalentId: 'tal-eff' })
    tool('gt-steel-pick', 'it-steel-pick', 'Pickaxe', 3, {
      baseDamage: 3,
      efficiencyTalentId: 'tal-eff',
    })
    tool('gt-axe', 'it-axe', 'Axe', 3, {
      calorieSkillId: 'sk-log',
      baseDamage: 2,
      damageUsesToolCurve: true,
    })
    tool('gt-shovel', 'it-shovel', 'Shovel', 1, { baseDamage: 1 })
    tool('gt-bow', 'it-bow', 'Bow', 1, {
      calorieSkillId: 'sk-hunt',
      baseDamage: 1,
      damageUsesToolCurve: true,
    })

    // Two species behind one log item, so the species picker has to appear.
    gameDataStore.setRow('treeSpecies', 'sp-spruce', {
      id: 'sp-spruce',
      datasetId: DS,
      name: 'Spruce',
      logItemId: 'it-spruce-log',
      treeHealth: 15,
      logsPerTreeMin: 0,
      logsPerTreeMax: 75,
    })
    gameDataStore.setRow('treeSpecies', 'sp-old-spruce', {
      id: 'sp-old-spruce',
      datasetId: DS,
      name: 'Titan Spruce',
      logItemId: 'it-spruce-log',
      treeHealth: 300,
      logsPerTreeMin: 700,
      logsPerTreeMax: 800,
    })
  }

  buildStore.setRow('builds', BUILD, { id: BUILD, datasetId: DS, name: 'TestBuild' })
  buildStore.setRow('userSettings', 'us1', { id: 'us1', buildId: BUILD, calorieCost: 20 })

  return { gameDataStore, buildStore, uiStore }
}

/** Opens a PrimeReact Dropdown and clicks the option with the given label. */
async function pickFromDropdown(root: Element, label: string | RegExp) {
  fireEvent.click(root)
  const option = await waitFor(() => {
    const found = [...document.body.querySelectorAll('.p-dropdown-item')].find((el) =>
      typeof label === 'string' ? el.textContent === label : label.test(el.textContent ?? '')
    )
    expect(found).toBeTruthy()
    return found!
  })
  fireEvent.click(option)
}

/** Dropdowns are found by accessible name — the species one only renders for a
 * log with more than one species, so positional lookup is not stable. */
function dropdownByLabel(label: string): HTMLElement {
  // PrimeReact puts aria-label on the focusable input, not the wrapper.
  const labelled = document.body.querySelector(`.p-dialog [aria-label="${label}"]`)
  return labelled!.closest('.p-dropdown') as HTMLElement
}

function Harness({
  stores,
  visible = true,
  initialItemId,
}: {
  stores: { gameDataStore: Store; buildStore: Store; uiStore: Store }
  visible?: boolean
  initialItemId?: string
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
      <GatheringCalculatorDialog
        visible={visible}
        onHide={() => {}}
        buildId={BUILD}
        datasetId={DS}
        priceSignal={priceSignal}
        initialItemId={initialItemId}
      />
    </StoreContext.Provider>
  )
}

describe('GatheringCalculatorDialog', () => {
  it('renders nothing when hidden', () => {
    render(<Harness stores={makeStores()} visible={false} />)
    expect(screen.queryByText('Gathering Calculator')).toBeNull()
  })

  it('shows a breakdown for a preselected item with no interaction', () => {
    render(<Harness stores={makeStores()} initialItemId="it-granite" />)
    expect(screen.getByText('Break the block')).toBeTruthy()
    expect(screen.getByText('Pick up rubble')).toBeTruthy()
    // Defaults to the lowest tier (Stone Pickaxe, damage 1), so a hardness-3
    // block takes 3 swings, +0.75 expected split swings, at 20 cal each over 4
    // items, plus 1 cal per rubble picked up = 19.75 cal per Granite.
    expect(screen.getByText(/19\.75/)).toBeTruthy()
  })

  it('applies the estimate as a manual price', () => {
    const stores = makeStores()
    render(<Harness stores={stores} initialItemId="it-granite" />)
    fireEvent.click(screen.getByRole('button', { name: /Apply as price/i }))

    const rowIds = stores.buildStore.getRowIds('userPrices')
    expect(rowIds).toHaveLength(1)
    const row = stores.buildStore.getRow('userPrices', rowIds[0])
    expect(row.itemOrTagId).toBe('it-granite')
    // Manual mode is what makes the solver treat the value as authoritative.
    expect(row.priceMode).toBe('manual')
    expect(row.price).toBeCloseTo(19.75 * 0.02, 6)
  })

  it('updates an existing price row in place', () => {
    const stores = makeStores()
    stores.buildStore.setRow('userPrices', 'up1', {
      id: 'up1',
      buildId: BUILD,
      itemOrTagId: 'it-granite',
      price: 999,
      priceMode: 'min',
    })
    render(<Harness stores={stores} initialItemId="it-granite" />)
    fireEvent.click(screen.getByRole('button', { name: /Apply as price/i }))

    expect(stores.buildStore.getRowIds('userPrices')).toEqual(['up1'])
    expect(stores.buildStore.getCell('userPrices', 'up1', 'price')).not.toBe(999)
    expect(stores.buildStore.getCell('userPrices', 'up1', 'priceMode')).toBe('manual')
  })

  it('warns when the build has no calorie cost', () => {
    // Every gathered price is calories x $/1000cal, so a zero rate silently
    // makes the whole estimate zero.
    const stores = makeStores()
    stores.buildStore.setCell('userSettings', 'us1', 'calorieCost', 0)
    render(<Harness stores={stores} initialItemId="it-granite" />)
    expect(screen.getByText(/Calorie Cost is 0 in this build/i)).toBeTruthy()
  })

  it('tells the user to update a dataset with no gathering data', () => {
    render(<Harness stores={makeStores({ withGatheringData: false })} />)
    expect(screen.getByText(/no gathering data/i)).toBeTruthy()
    expect(screen.queryByText('Break the block')).toBeNull()
  })

  it('keeps a talent toggle when the tool changes', async () => {
    render(<Harness stores={makeStores()} initialItemId="it-granite" />)
    const efficiency = document.body.querySelector(
      '#gathering-talent-efficiency'
    ) as HTMLInputElement
    fireEvent.click(efficiency)
    await waitFor(() => expect(screen.getByText(/16 cal per action/)).toBeTruthy()) // 20 x 0.8

    await pickFromDropdown(dropdownByLabel('Tool'), /SteelPickaxe/)
    expect(screen.getByText(/16 cal per action/)).toBeTruthy()
  })

  it('re-reads the skill level when the tool switches to a different skill', async () => {
    // Changing target moves between kinds, and a new kind means a new calorie
    // skill, so the level must come from the build again rather than persist.
    const stores = makeStores()
    stores.buildStore.setRow('userSkills', 'us-log', {
      id: 'us-log',
      buildId: BUILD,
      skillId: 'sk-log',
      level: 4,
    })
    render(<Harness stores={stores} initialItemId="it-spruce-log" />)
    // Logging 4 => 20 x 0.88 = 17.6
    expect(screen.getByText(/17.6 cal per action/)).toBeTruthy()
  })
})

describe('GatheringCalculatorDialog — log targets', () => {
  it('shows felling and slicing with per-tree and per-log figures', () => {
    render(<Harness stores={makeStores()} initialItemId="it-spruce-log" />)
    expect(screen.getByText('Fell the tree')).toBeTruthy()
    expect(screen.getByText('Slice the trunk')).toBeTruthy()
    // Steel axe damage 2 fells a 15 HP spruce in 8 swings at 20 cal = 160 cal,
    // which is the figure a player can count — not the amortized per-log share.
    expect(screen.getByText('160')).toBeTruthy()
  })

  it('defaults logs per tree to the mature yield and shows the range', () => {
    render(<Harness stores={makeStores()} initialItemId="it-spruce-log" />)
    expect(screen.getByText(/A fully grown tree yields 75/)).toBeTruthy()
    const logsField = screen.getByText('Logs per tree').parentElement!
    expect((logsField.querySelector('input') as HTMLInputElement).value).toBe('75')
  })

  it('offers a species picker and switches the trunk health with it', async () => {
    // Two species behind one log item is the case that forced TreeSpecies into
    // its own table rather than flat columns on the item.
    render(<Harness stores={makeStores()} initialItemId="it-spruce-log" />)
    await pickFromDropdown(dropdownByLabel('Species'), 'Titan Spruce')
    // 300 HP at damage 2 => 150 swings to fell.
    await waitFor(() => expect(screen.getByText('150')).toBeTruthy())
  })
})

describe('GatheringCalculatorDialog — carcass targets', () => {
  it('shows shots and arrows, and prices the arrows', () => {
    render(<Harness stores={makeStores()} initialItemId="it-deer" />)
    expect(screen.getByText('Shots fired')).toBeTruthy()
    expect(screen.getByText('Arrows consumed')).toBeTruthy()
    expect(screen.getByText('Hit rate')).toBeTruthy()
    expect(screen.getByText('Aim for the head')).toBeTruthy()
  })

  it('cuts the arrow count when aiming for the head', async () => {
    render(<Harness stores={makeStores()} initialItemId="it-deer" />)
    const shotsCount = () =>
      screen.getByText('Shots fired').parentElement!.querySelectorAll('td')[1].textContent
    // Deer 6 HP, wooden bow damage 1 => 6 shots.
    expect(shotsCount()).toBe('6')
    fireEvent.click(document.body.querySelector('#gathering-headshot') as HTMLInputElement)
    // ceil(6 / 1.5) = 4
    await waitFor(() => expect(shotsCount()).toBe('4'))
  })
})

describe('GatheringCalculatorDialog — excavatable targets', () => {
  it('charges one dig and nothing else', () => {
    render(<Harness stores={makeStores()} initialItemId="it-dirt" />)
    expect(screen.getByText('Dig the block')).toBeTruthy()
    expect(screen.queryByText('Pick up rubble')).toBeNull()
    expect(screen.queryByText('Logs per tree')).toBeNull()
  })
})
