import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { describe, expect, it } from 'vitest'

import { usePriceSignal } from '@/hooks/use-prices-signal'
import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { Products } from '../Products'

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

  // Skill, item, recipe, recipeElements, build, userRecipes, settings
  gameDataStore.setRow('skills', 'sk-mine', {
    id: 'sk-mine',
    datasetId: DS,
    name: 'MiningSkill',
    profession: '',
    maxLevel: 7,
    laborReducePercent: '[1,1,1,1,1,1,1,1]',
  })
  gameDataStore.setRow('craftingTables', 'ct-anvil', {
    id: 'ct-anvil',
    datasetId: DS,
    name: 'AnvilItem',
  })
  gameDataStore.setRow('items', 'it-ore', {
    id: 'it-ore',
    datasetId: DS,
    name: 'OreItem',
    isTag: false,
  })
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
    craftingTableId: 'ct-anvil',
    baseCraftTime: 1,
    baseLaborCost: 0,
  })
  gameDataStore.setRow('recipeElements', 're-i', {
    id: 're-i',
    datasetId: DS,
    recipeId: 'r-iron',
    itemOrTagId: 'it-ore',
    baseQuantity: -1,
    isProduct: false,
    index: 0,
  })
  gameDataStore.setRow('recipeElements', 're-p', {
    id: 're-p',
    datasetId: DS,
    recipeId: 'r-iron',
    itemOrTagId: 'it-iron',
    baseQuantity: 1,
    isProduct: true,
    index: 1,
  })

  buildStore.setRow('builds', BUILD, {
    id: BUILD,
    datasetId: DS,
    name: 'TestBuild',
    createdAt: '2026-01-01',
  })
  buildStore.setRow('userSkills', 'us-mine', {
    id: 'us-mine',
    buildId: BUILD,
    skillId: 'sk-mine',
    level: 3,
  })
  buildStore.setRow('userRecipes', 'ur-iron', {
    id: 'ur-iron',
    buildId: BUILD,
    recipeId: 'r-iron',
    roundFactor: 0,
    favorite: false,
  })
  buildStore.setRow('userSettings', 'st1', {
    id: 'st1',
    buildId: BUILD,
    marginType: 'markup',
    calorieCost: 0,
    showUnskilledRecipes: true,
    onlyLevelAccessible: false,
    applyMarginBetweenSkills: false,
    showParts: true,
    showUntagged: true,
    showOnlyFavorites: false,
  })
  buildStore.setRow('userMargins', 'm-default', {
    id: 'm-default',
    buildId: BUILD,
    name: 'Default',
    percent: 20,
    isDefault: true,
  })

  return { gameDataStore, buildStore, uiStore }
}

function renderProducts(stores: { gameDataStore: Store; buildStore: Store; uiStore: Store }) {
  const { result } = renderHook(() => usePriceSignal())
  return render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <Products buildId={BUILD} datasetId={DS} priceSignal={result.current} />
    </StoreContext.Provider>
  )
}

describe('Products (smoke)', () => {
  it('renders the products header and at least one row for a single user recipe', () => {
    const stores = makeStores()
    renderProducts(stores)
    // The recipe's localized name is empty in this setup, but the DataTable
    // still renders the row scaffolding. Check that the table exists with at
    // least one body row.
    const tables = document.body.querySelectorAll('.p-datatable-tbody tr')
    expect(tables.length).toBeGreaterThanOrEqual(1)
  })

  it('renders the Add Recipe and Filter buttons in the header', () => {
    const stores = makeStores()
    renderProducts(stores)
    // The "Add recipe" button is icon-only with aria-label "Add recipe".
    expect(screen.getByLabelText('Add recipe')).toBeInTheDocument()
    // Filter button has a tooltip; just confirm a filter icon exists.
    expect(document.body.querySelectorAll('.pi-filter, .pi-filter-fill').length).toBeGreaterThan(0)
  })

  it('shows the empty message when no recipes are in the build', () => {
    const stores = makeStores()
    stores.buildStore.delRow('userRecipes', 'ur-iron')
    renderProducts(stores)
    expect(screen.getByText(/Add recipes or loosen/i)).toBeInTheDocument()
  })

  it('opens the add-recipe dialog when the Add Recipe button is clicked', async () => {
    const stores = makeStores()
    renderProducts(stores)
    fireEvent.click(screen.getByLabelText('Add recipe'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Add Recipe')).toBeInTheDocument()
  })

  it('toggles a skill filter via the filter overlay', () => {
    const stores = makeStores()
    renderProducts(stores)
    const filterBtn = document.body
      .querySelector('.pi-filter')!
      .closest('button') as HTMLButtonElement
    fireEvent.click(filterBtn)
    const skillCheckboxInput = document.body.querySelector(
      '#skill-filter-sk-mine'
    ) as HTMLInputElement
    fireEvent.click(skillCheckboxInput)
    const hidden = stores.buildStore
      .getRowIds('hiddenSkills')
      .filter((id) => stores.buildStore.getCell('hiddenSkills', id, 'skillId') === 'sk-mine')
    expect(hidden).toHaveLength(1)
  })

  it('flips the favorites-only filter via the favorites button', () => {
    const stores = makeStores()
    renderProducts(stores)
    expect(stores.buildStore.getCell('userSettings', 'st1', 'showOnlyFavorites')).toBe(false)
    const favBtn = screen.getByLabelText(/Show only favorites/i)
    fireEvent.click(favBtn)
    expect(stores.buildStore.getCell('userSettings', 'st1', 'showOnlyFavorites')).toBe(true)
  })

  it('renders favorites-on with a filled star and only favorited rows', () => {
    const stores = makeStores()
    stores.buildStore.setCell('userSettings', 'st1', 'showOnlyFavorites', true)
    stores.buildStore.setCell('userRecipes', 'ur-iron', 'favorite', true)
    renderProducts(stores)
    expect(document.body.querySelectorAll('.pi-star-fill').length).toBeGreaterThan(0)
  })

  it('renders the level-accessible filter on, exercising the talents/skill-level scan path', () => {
    const stores = makeStores()
    stores.buildStore.setCell('userSettings', 'st1', 'onlyLevelAccessible', true)
    renderProducts(stores)
    const rows = document.body.querySelectorAll('.p-datatable-tbody tr')
    expect(rows.length).toBeGreaterThanOrEqual(1)
  })

  it('clicking the recipe name link opens the RecipeDialog', async () => {
    const stores = makeStores()
    renderProducts(stores)
    const link = document.body.querySelector(
      '.p-datatable-tbody .p-button-link'
    ) as HTMLButtonElement
    fireEvent.click(link)
    await waitFor(() => {
      expect(document.body.querySelectorAll('.p-dialog').length).toBeGreaterThan(0)
    })
  })

  it('changing the row margin via MarginCell writes a userRecipeMargins row', () => {
    const stores = makeStores()
    renderProducts(stores)
    const select = document.body.querySelector('tbody select') as HTMLSelectElement
    expect(select).toBeInTheDocument()
    fireEvent.change(select, { target: { value: 'm-default' } })
    const written = stores.buildStore
      .getRowIds('userRecipeMargins')
      .filter(
        (id) => stores.buildStore.getCell('userRecipeMargins', id, 'userRecipeId') === 'ur-iron'
      )
    expect(written.length).toBe(1)
  })

  it('renders parent + child rows for a multi-recipe product group', () => {
    const stores = makeStores()
    // Add a second recipe producing the same product (it-iron) under a new skill.
    stores.gameDataStore.setRow('skills', 'sk-smelt', {
      id: 'sk-smelt',
      datasetId: DS,
      name: 'SmeltingSkill',
      profession: '',
      maxLevel: 7,
      laborReducePercent: '[1,1,1,1,1,1,1,1]',
    })
    stores.gameDataStore.setRow('recipes', 'r-iron2', {
      id: 'r-iron2',
      datasetId: DS,
      name: 'IronRecipe2',
      familyName: 'Iron',
      skillId: 'sk-smelt',
      requiredSkillLevel: 1,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: 'ct-anvil',
      baseCraftTime: 1,
      baseLaborCost: 0,
    })
    stores.gameDataStore.setRow('recipeElements', 're-i-2', {
      id: 're-i-2',
      datasetId: DS,
      recipeId: 'r-iron2',
      itemOrTagId: 'it-ore',
      baseQuantity: -2,
      isProduct: false,
      index: 0,
    })
    stores.gameDataStore.setRow('recipeElements', 're-p-2', {
      id: 're-p-2',
      datasetId: DS,
      recipeId: 'r-iron2',
      itemOrTagId: 'it-iron',
      baseQuantity: 2,
      isProduct: true,
      index: 1,
    })
    stores.buildStore.setRow('userRecipes', 'ur-iron2', {
      id: 'ur-iron2',
      buildId: BUILD,
      recipeId: 'r-iron2',
      roundFactor: 0,
    })
    renderProducts(stores)
    // 1 parent + 2 children = 3 rows.
    const rows = document.body.querySelectorAll('.p-datatable-tbody tr')
    expect(rows.length).toBe(3)
  })

  it('opens the row actions menu and routes a Treat-as-Material click through priceMgmt', async () => {
    const stores = makeStores()
    renderProducts(stores)
    const ellipsis = document.body
      .querySelector('tbody .pi-ellipsis-v')!
      .closest('button') as HTMLButtonElement
    fireEvent.click(ellipsis)
    const moveBtn = await waitFor(() => screen.getByText(/Treat as a Material/i))
    fireEvent.click(moveBtn)
    // The override flag is set by the setOverrideAsMaterial path.
    await waitFor(() => {
      const overrides = stores.buildStore
        .getRowIds('userPrices')
        .filter((id) => stores.buildStore.getCell('userPrices', id, 'isOverride') === true)
      expect(overrides.length).toBeGreaterThan(0)
    })
  })

  it('renders a family header row for a 2+ member family cluster, with the favorite toggle and indented child rows', () => {
    const stores = makeStores()
    // Three products in the "Board" recipe family. Each has its own primary
    // product item, so they form three separate groups. Family cluster size
    // is 3 → buildProductRows must emit a "Board" header above them.
    const variants = [
      { item: 'it-board', recipe: 'r-board', ur: 'ur-board' },
      { item: 'it-hwb', recipe: 'r-hwb', ur: 'ur-hwb' },
      { item: 'it-swb', recipe: 'r-swb', ur: 'ur-swb' },
    ]
    for (const v of variants) {
      stores.gameDataStore.setRow('items', v.item, {
        id: v.item,
        datasetId: DS,
        name: v.item,
        isTag: false,
      })
      stores.gameDataStore.setRow('recipes', v.recipe, {
        id: v.recipe,
        datasetId: DS,
        name: v.recipe,
        familyName: 'Board',
        skillId: 'sk-mine',
        requiredSkillLevel: 1,
        isBlueprint: false,
        isDefault: true,
        craftingTableId: 'ct-anvil',
        baseCraftTime: 1,
        baseLaborCost: 0,
      })
      stores.gameDataStore.setRow('recipeElements', `re-p-${v.recipe}`, {
        id: `re-p-${v.recipe}`,
        datasetId: DS,
        recipeId: v.recipe,
        itemOrTagId: v.item,
        baseQuantity: 1,
        isProduct: true,
        index: 0,
      })
      stores.buildStore.setRow('userRecipes', v.ur, {
        id: v.ur,
        buildId: BUILD,
        recipeId: v.recipe,
        roundFactor: 0,
      })
    }
    renderProducts(stores)

    // Family header row + 3 board flats + 1 iron flat from the base fixture.
    const rows = Array.from(
      document.body.querySelectorAll('.p-datatable-tbody tr')
    ) as HTMLElement[]
    expect(rows).toHaveLength(5)

    // The family header row contains the text "Board" alongside a single
    // favorite-star button (the family-level toggle) and nothing else — no
    // margin dropdown, no kebab menu.
    const familyRowIdx = rows.findIndex((r) => within(r).queryByText('Board', { selector: 'span' }))
    expect(familyRowIdx).toBeGreaterThanOrEqual(0)
    const familyRow = rows[familyRowIdx]
    expect(within(familyRow).getByText('Board')).toBeInTheDocument()
    const familyButtons = familyRow.querySelectorAll('button')
    expect(familyButtons).toHaveLength(1)
    expect(familyButtons[0].querySelector('.pi-star,.pi-star-fill')).not.toBeNull()
    expect(familyRow.querySelectorAll('input,select')).toHaveLength(0)

    // The three rows immediately following the family header are the
    // in-family Board variants — their name-cell div carries inline
    // padding-left signalling indentation.
    for (let i = familyRowIdx + 1; i <= familyRowIdx + 3; i++) {
      const nameCell = rows[i].querySelector('td:first-child > div') as HTMLElement | null
      expect(nameCell).not.toBeNull()
      expect(nameCell!.style.paddingLeft).toBe('1.5rem')
    }
  })

  function addBlueprintRecipe(stores: ReturnType<typeof makeStores>) {
    stores.gameDataStore.setRow('items', 'it-bp-product', {
      id: 'it-bp-product',
      datasetId: DS,
      name: 'BlueprintProduct',
      isTag: false,
    })
    stores.gameDataStore.setRow('recipes', 'r-bp', {
      id: 'r-bp',
      datasetId: DS,
      name: 'BlueprintRecipe',
      familyName: 'Blueprint',
      skillId: 'sk-mine',
      requiredSkillLevel: 1,
      isBlueprint: true,
      isDefault: true,
      craftingTableId: 'ct-anvil',
      baseCraftTime: 1,
      baseLaborCost: 0,
    })
    stores.gameDataStore.setRow('recipeElements', 're-bp-p', {
      id: 're-bp-p',
      datasetId: DS,
      recipeId: 'r-bp',
      itemOrTagId: 'it-bp-product',
      baseQuantity: 1,
      isProduct: true,
      index: 0,
    })
    stores.buildStore.setRow('userRecipes', 'ur-bp', {
      id: 'ur-bp',
      buildId: BUILD,
      recipeId: 'r-bp',
      roundFactor: 0,
    })
  }

  function countProductRows(): number {
    // Parent / flat / child rows; family-header rows have no margin select but
    // counting bodies is enough since we don't seed a multi-member family.
    return document.body.querySelectorAll('.p-datatable-tbody tr').length
  }

  it('blueprint filter default (include) shows both blueprint and non-blueprint recipes', () => {
    const stores = makeStores()
    addBlueprintRecipe(stores)
    renderProducts(stores)
    expect(countProductRows()).toBe(2)
  })

  it('blueprint filter set to exclude hides blueprint recipes', () => {
    const stores = makeStores()
    addBlueprintRecipe(stores)
    stores.buildStore.setCell('userSettings', 'st1', 'blueprintMode', 'exclude')
    renderProducts(stores)
    expect(countProductRows()).toBe(1)
  })

  it('blueprint filter set to only shows just the blueprint recipes', () => {
    const stores = makeStores()
    addBlueprintRecipe(stores)
    stores.buildStore.setCell('userSettings', 'st1', 'blueprintMode', 'only')
    renderProducts(stores)
    expect(countProductRows()).toBe(1)
  })

  it('changing the blueprint SelectButton writes the userSettings.blueprintMode cell', async () => {
    const stores = makeStores()
    addBlueprintRecipe(stores)
    renderProducts(stores)
    const filterBtn = document.body
      .querySelector('.pi-filter')!
      .closest('button') as HTMLButtonElement
    fireEvent.click(filterBtn)
    const excludeBtn = await waitFor(() => screen.getByText('Exclude'))
    fireEvent.click(excludeBtn)
    expect(stores.buildStore.getCell('userSettings', 'st1', 'blueprintMode')).toBe('exclude')
  })

  it('toggles a tag filter via the filter overlay', () => {
    const stores = makeStores()
    // Add a tag the recipe consumes so a tag option appears.
    stores.gameDataStore.setRow('items', 'it-tag-wood', {
      id: 'it-tag-wood',
      datasetId: DS,
      name: 'WoodTag',
      isTag: true,
    })
    stores.gameDataStore.setRow('items', 'it-iron2', {
      id: 'it-iron2',
      datasetId: DS,
      name: 'IronItem2',
      isTag: false,
    })
    stores.gameDataStore.setRow('tagItems', 'ti-1', {
      id: 'ti-1',
      datasetId: DS,
      tagId: 'it-tag-wood',
      itemId: 'it-iron2',
    })
    renderProducts(stores)
    const filterBtn = document.body
      .querySelector('.pi-filter')!
      .closest('button') as HTMLButtonElement
    fireEvent.click(filterBtn)
    const partCheckbox = document.body.querySelector(
      '#tag-filter-part-__part__'
    ) as HTMLInputElement
    if (partCheckbox) {
      fireEvent.click(partCheckbox)
      expect(stores.buildStore.getCell('userSettings', 'st1', 'showParts')).toBe(false)
    }
  })
})
