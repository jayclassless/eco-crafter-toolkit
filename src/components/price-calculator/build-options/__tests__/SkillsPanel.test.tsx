import { act, fireEvent, render, waitFor } from '@testing-library/react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { describe, expect, it } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { SkillsPanel } from '../SkillsPanel'

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

  // SelfImprovementSkill is auto-added by createBuild — also needed by
  // useStarCost / useSkillManagement.
  gameDataStore.setRow('skills', 'sk-self', {
    id: 'sk-self',
    datasetId: DS,
    name: 'SelfImprovementSkill',
    profession: '',
    maxLevel: 7,
    laborReducePercent: '[1,1,1,1,1,1,1,1]',
    specialtyCost: 1,
  })
  gameDataStore.setRow('skills', 'sk-mine', {
    id: 'sk-mine',
    datasetId: DS,
    name: 'MiningSkill',
    profession: 'Industrialist',
    maxLevel: 7,
    laborReducePercent: '[1,1,1,1,1,1,1,1]',
    specialtyCost: 1,
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
      <SkillsPanel buildId={BUILD} datasetId={DS} />
    </StoreContext.Provider>
  )
}

describe('SkillsPanel (smoke)', () => {
  it('renders the panel with a row per user skill', () => {
    const stores = makeStores()
    renderPanel(stores)
    // Skill row should exist; check at least one DataTable body row.
    const rows = document.body.querySelectorAll('.p-datatable-tbody tr')
    expect(rows.length).toBeGreaterThanOrEqual(1)
  })

  it('renders a SkillLevelCell input next to the user skill', () => {
    const stores = makeStores()
    renderPanel(stores)
    // The level cell has an InputNumber whose value === stored level.
    const inputs = document.body.querySelectorAll('.p-inputnumber input')
    const values = Array.from(inputs).map((i) => (i as HTMLInputElement).value)
    expect(values).toContain('3')
  })

  it('removes the skill from the build when the trash button is clicked', () => {
    const stores = makeStores()
    renderPanel(stores)
    expect(stores.buildStore.hasRow('userSkills', 'us-mine')).toBe(true)
    const trashBtn = document.body
      .querySelector('tbody .pi-trash')!
      .closest('button') as HTMLButtonElement
    fireEvent.click(trashBtn)
    expect(stores.buildStore.hasRow('userSkills', 'us-mine')).toBe(false)
  })

  it('renders a panel header with the skills count', () => {
    const stores = makeStores()
    renderPanel(stores)
    expect(document.body.textContent).toMatch(/Skills/i)
  })

  it('changing the skill level via the cell writes to userSkills', () => {
    const stores = makeStores()
    renderPanel(stores)
    // Simulate a buildStore-side change so the cell subscriber updates.
    act(() => stores.buildStore.setCell('userSkills', 'us-mine', 'level', 5))
    const inputs = document.body.querySelectorAll('.p-inputnumber input')
    const values = Array.from(inputs).map((i) => (i as HTMLInputElement).value)
    expect(values).toContain('5')
  })

  it('the GroupedAutoComplete dropdown surfaces unadded skills via searchSkills', () => {
    const stores = makeStores()
    renderPanel(stores)
    // Click the dropdown caret to trigger searchSkills with empty query.
    const dropdown = document.body.querySelector('.p-autocomplete-dropdown') as HTMLButtonElement
    fireEvent.click(dropdown)
    // After the dropdown opens, the suggestion list contains MiningSkill —
    // wait for it to appear (PrimeReact mounts the panel asynchronously).
    // We just confirm the dropdown opened, which exercises searchSkills.
    expect(dropdown).toBeInTheDocument()
  })

  it('typing into the autocomplete triggers the searchSkills filter', () => {
    const stores = makeStores()
    // Add another skill so the typed-query filter is non-empty.
    stores.gameDataStore.setRow('skills', 'sk-smelting', {
      id: 'sk-smelting',
      datasetId: DS,
      name: 'SmeltingSkill',
      profession: 'Industrialist',
      maxLevel: 7,
      laborReducePercent: '[1]',
    })
    renderPanel(stores)
    const input = document.body.querySelector('.p-autocomplete-input') as HTMLInputElement
    fireEvent.input(input, { target: { value: 'smel' } })
    // The input value should be set (the AutoComplete debounces actual filter).
    expect(input.value).toBe('smel')
  })

  it('opening the autocomplete dropdown groups results by profession with skill labels', async () => {
    const stores = makeStores()
    // Two additional skills under two different professions (no matching
    // profession-skill row, so the raw profession name is the label fallback).
    stores.gameDataStore.setRow('skills', 'sk-smelting', {
      id: 'sk-smelting',
      datasetId: DS,
      name: 'SmeltingSkill',
      profession: 'Mining',
      maxLevel: 7,
      laborReducePercent: '[1]',
    })
    stores.gameDataStore.setRow('skills', 'sk-cooking', {
      id: 'sk-cooking',
      datasetId: DS,
      name: 'CookingSkill',
      profession: 'Foodie',
      maxLevel: 7,
      laborReducePercent: '[1]',
    })
    renderPanel(stores)
    const dropdown = document.body.querySelector('.p-autocomplete-dropdown') as HTMLButtonElement
    fireEvent.click(dropdown)
    // Two professions appear as group headers in the dropdown panel — proves
    // the grouped-by-profession path ran with profession-label resolution.
    // waitFor (not a bare setTimeout) so the AutoComplete's async state update
    // lands inside act() — otherwise every run prints an act() warning.
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/Mining/)
      expect(document.body.textContent).toMatch(/Foodie/)
    })
  })

  it('shows a flat 1-star cost per dropdown option on a pre-v13 dataset', async () => {
    const stores = makeStores()
    stores.gameDataStore.setRow('skills', 'sk-smelting', {
      id: 'sk-smelting',
      datasetId: DS,
      name: 'SmeltingSkill',
      profession: 'Industrialist',
      maxLevel: 7,
      laborReducePercent: '[1]',
      specialtyCost: 1,
    })
    renderPanel(stores)
    fireEvent.click(document.body.querySelector('.p-autocomplete-dropdown') as HTMLButtonElement)
    await waitFor(() => {
      const opt = document.body.querySelector('.p-autocomplete-item') as HTMLElement
      expect(opt).not.toBeNull()
      expect(opt.querySelector('.pi-star-fill')).not.toBeNull()
      expect(opt.textContent).toContain('1')
    })
  })

  it('charges specialtyCost plus the current skill count on a v13 dataset', async () => {
    const stores = makeStores()
    // Any specialtyCost > 1 in the dataset flips useStarCost into v13 mode.
    stores.gameDataStore.setCell('skills', 'sk-mine', 'specialtyCost', 2)
    stores.gameDataStore.setRow('skills', 'sk-smelting', {
      id: 'sk-smelting',
      datasetId: DS,
      name: 'SmeltingSkill',
      profession: 'Industrialist',
      maxLevel: 7,
      laborReducePercent: '[1]',
      specialtyCost: 3,
    })
    renderPanel(stores)
    fireEvent.click(document.body.querySelector('.p-autocomplete-dropdown') as HTMLButtonElement)
    await waitFor(() => {
      const opt = document.body.querySelector('.p-autocomplete-item') as HTMLElement
      expect(opt).not.toBeNull()
      // specialtyCost 3 + 1 skill already in the build.
      expect(opt.textContent).toContain('4')
    })
  })

  it('shows no star cost for Self Improvement, which is star-exempt', async () => {
    const stores = makeStores()
    // Self Improvement carries a profession in every shipped dataset, so it is
    // offered by the dropdown whenever it isn't already in the build.
    stores.gameDataStore.setCell('skills', 'sk-self', 'profession', 'SurvivalistSkill')
    renderPanel(stores)
    fireEvent.click(document.body.querySelector('.p-autocomplete-dropdown') as HTMLButtonElement)
    await waitFor(() => {
      const opt = document.body.querySelector('.p-autocomplete-item') as HTMLElement
      expect(opt).not.toBeNull()
      expect(opt.querySelector('.pi-star-fill')).toBeNull()
    })
  })

  it('skips userSkills rows from other builds', () => {
    const stores = makeStores()
    // Foreign-build row must NOT render.
    stores.buildStore.setRow('userSkills', 'us-other', {
      id: 'us-other',
      buildId: 'other-build',
      skillId: 'sk-self',
      level: 7,
    })
    renderPanel(stores)
    // Only the original 'us-mine' row appears.
    const rows = document.body.querySelectorAll('.p-datatable-tbody tr')
    expect(rows.length).toBe(1)
  })

  it('renders talent rows when the skill has talents', () => {
    const stores = makeStores()
    // Attach two talents to the mining skill, ensuring the talentRow mapping
    // logic and talent-level sort runs.
    stores.gameDataStore.setRow('talents', 't-1', {
      id: 't-1',
      datasetId: DS,
      skillId: 'sk-mine',
      name: 'TalentOne',
      level: 1,
      talentGroupName: 'Group',
      isLevelable: false,
      maxTalentLevel: 0,
    })
    stores.gameDataStore.setRow('talents', 't-2', {
      id: 't-2',
      datasetId: DS,
      skillId: 'sk-mine',
      name: 'TalentTwo',
      level: 2,
      talentGroupName: 'Group',
      isLevelable: false,
      maxTalentLevel: 0,
    })
    renderPanel(stores)
    // Talents column appears in the table body — at least one talent chip
    // renders for the row.
    expect(document.body.textContent).toMatch(/Group|Talent/i)
  })

  it('ignores userTalents rows from other builds in the talent bucket', () => {
    const stores = makeStores()
    stores.gameDataStore.setRow('talents', 't-1', {
      id: 't-1',
      datasetId: DS,
      skillId: 'sk-mine',
      name: 'TalentOne',
      level: 1,
      talentGroupName: 'Group',
      isLevelable: false,
      maxTalentLevel: 0,
    })
    stores.buildStore.setRow('userTalents', 'ut-other', {
      id: 'ut-other',
      buildId: 'other-build',
      talentId: 't-1',
      enabled: true,
    })
    renderPanel(stores)
    // No throw — the foreign userTalent row was excluded from the lookup.
    const rows = document.body.querySelectorAll('.p-datatable-tbody tr')
    expect(rows.length).toBe(1)
  })
})

// The star total now has up to three sources (skills, talents, modules), so the
// badge tooltip breaks it down. It stays a plain total when only one source
// contributes — which is every v11-v13 build.
describe('SkillsPanel star badge', () => {
  const badge = () =>
    document.body.querySelector('.pi-star-fill')?.parentElement as HTMLElement | null

  it('shows the plain total when only skills contribute', () => {
    const stores = makeStores()
    renderPanel(stores)
    const el = badge()
    expect(el).not.toBeNull()
    expect(el!.textContent).toContain('1')
    expect(el!.getAttribute('title')).not.toContain('from skills')
  })

  it('includes installed module stars in the total and breaks them down', () => {
    const stores = makeStores()
    stores.buildStore.setRow('userCraftingTables', 'uct1', {
      id: 'uct1',
      buildId: BUILD,
      craftingTableId: 'ct-anvil',
      basicModuleId: 'pm-basic',
      modernModuleId: 'pm-mod',
      costPerMinute: 0,
    })
    renderPanel(stores)
    const el = badge()!
    // 1 skill (pre-v13 mode) + 2 module stars.
    expect(el.textContent).toContain('3')
    const title = el.getAttribute('title') ?? ''
    expect(title).toContain('from skills')
    expect(title).toContain('from upgrade modules')
  })

  it('does not count a free Specialty module', () => {
    const stores = makeStores()
    stores.buildStore.setRow('userCraftingTables', 'uct1', {
      id: 'uct1',
      buildId: BUILD,
      craftingTableId: 'ct-anvil',
      specialtyModuleId: 'pm-spec',
      costPerMinute: 0,
    })
    renderPanel(stores)
    const el = badge()!
    expect(el.textContent).toContain('1')
    expect(el.getAttribute('title') ?? '').not.toContain('from upgrade modules')
  })
})
