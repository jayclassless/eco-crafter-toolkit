import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useStarCost } from '../use-star-cost'
import { createTestStores, makeWrapper, type TestStores } from './store-wrapper'

const BUILD = 'b1'
const DATASET = 'ds1'

let stores: TestStores
let wrapper: ReturnType<typeof makeWrapper>

beforeEach(() => {
  stores = createTestStores()
  wrapper = makeWrapper(stores)
})

interface SkillSeed {
  id: string
  name: string
  specialtyCost: number
}

function seedSkills(skills: SkillSeed[]) {
  for (const s of skills) {
    stores.gameDataStore.setRow('skills', s.id, {
      id: s.id,
      datasetId: DATASET,
      name: s.name,
      maxLevel: 7,
      laborReducePercent: '[]',
      specialtyCost: s.specialtyCost,
    })
  }
}

function selectSkills(skillIds: string[]) {
  for (const skillId of skillIds) {
    const id = `us-${skillId}`
    stores.buildStore.setRow('userSkills', id, { id, buildId: BUILD, skillId, level: 1 })
  }
}

interface TalentSeed {
  id: string
  skillId: string
  isLevelable: boolean
  maxTalentLevel: number
}

function seedTalent(t: TalentSeed) {
  stores.gameDataStore.setRow('talents', t.id, {
    id: t.id,
    datasetId: DATASET,
    skillId: t.skillId,
    name: t.id,
    talentGroupName: t.id,
    value: 1,
    level: 3,
    isLevelable: t.isLevelable,
    maxTalentLevel: t.maxTalentLevel,
  })
}

function selectTalent(talentId: string, enabled: boolean, talentLevel: number) {
  const id = `ut-${talentId}`
  stores.buildStore.setRow('userTalents', id, {
    id,
    buildId: BUILD,
    talentId,
    enabled,
    talentLevel,
  })
  return id
}

/** Install modules on a build's crafting table. Omitted slots stay empty. */
function seedTable(
  rowId: string,
  slots: Partial<{
    basicModuleId: string
    advancedModuleId: string
    modernModuleId: string
    specialtyModuleId: string
  }>
) {
  stores.buildStore.setRow('userCraftingTables', rowId, {
    id: rowId,
    buildId: BUILD,
    craftingTableId: `ct-${rowId}`,
    costPerMinute: 0,
    ...slots,
  })
}

describe('useStarCost', () => {
  it('returns zeros with v13-mode detection on empty build', () => {
    seedSkills([
      { id: 's-a', name: 'Mining', specialtyCost: 2 },
      { id: 's-b', name: 'Smelting', specialtyCost: 1 },
    ])
    const { result } = renderHook(() => useStarCost(BUILD, DATASET), { wrapper })
    expect(result.current).toEqual({
      total: 0,
      skillCost: 0,
      talentCost: 0,
      moduleCost: 0,
      skillCount: 0,
      talentCount: 0,
      isV13: true,
    })
  })

  it('v13-mode: one non-SI skill with specialtyCost=2 → skillCost=2', () => {
    seedSkills([{ id: 's-a', name: 'Mining', specialtyCost: 2 }])
    selectSkills(['s-a'])
    const { result } = renderHook(() => useStarCost(BUILD, DATASET), { wrapper })
    expect(result.current.skillCount).toBe(1)
    expect(result.current.skillCost).toBe(2)
    expect(result.current.total).toBe(2)
    expect(result.current.isV13).toBe(true)
  })

  it('v13-mode: three skills with specialtyCosts [2,3,4] → skillCost = 9 + 3 = 12', () => {
    seedSkills([
      { id: 's-a', name: 'Mining', specialtyCost: 2 },
      { id: 's-b', name: 'Smelting', specialtyCost: 3 },
      { id: 's-c', name: 'Farming', specialtyCost: 4 },
    ])
    selectSkills(['s-a', 's-b', 's-c'])
    const { result } = renderHook(() => useStarCost(BUILD, DATASET), { wrapper })
    expect(result.current.skillCount).toBe(3)
    expect(result.current.skillCost).toBe(12)
    expect(result.current.total).toBe(12)
  })

  it('v13-mode: Self Improvement is excluded from both sum and N', () => {
    seedSkills([
      { id: 's-si', name: 'SelfImprovementSkill', specialtyCost: 1 },
      { id: 's-a', name: 'Mining', specialtyCost: 2 },
      { id: 's-b', name: 'Smelting', specialtyCost: 3 },
    ])
    selectSkills(['s-si', 's-a', 's-b'])
    const { result } = renderHook(() => useStarCost(BUILD, DATASET), { wrapper })
    // N = 2 (SI excluded), specialtySum = 5, N·(N−1)/2 = 1, skillCost = 6.
    expect(result.current.skillCount).toBe(2)
    expect(result.current.skillCost).toBe(6)
    expect(result.current.total).toBe(6)
  })

  it('v13-mode: levelable talent contributes its level; non-levelable contributes 1 when enabled', () => {
    seedSkills([{ id: 's-a', name: 'Mining', specialtyCost: 2 }])
    seedTalent({ id: 't-lev', skillId: 's-a', isLevelable: true, maxTalentLevel: 5 })
    seedTalent({ id: 't-flat-on', skillId: 's-a', isLevelable: false, maxTalentLevel: 0 })
    seedTalent({ id: 't-flat-off', skillId: 's-a', isLevelable: false, maxTalentLevel: 0 })
    selectSkills(['s-a'])
    selectTalent('t-lev', true, 3)
    selectTalent('t-flat-on', true, 0)
    selectTalent('t-flat-off', false, 0)
    const { result } = renderHook(() => useStarCost(BUILD, DATASET), { wrapper })
    expect(result.current.talentCost).toBe(4) // 3 (levelable) + 1 (non-levelable enabled)
    expect(result.current.talentCount).toBe(2) // only enabled ones counted
    // skillCost = 2 + 0 = 2, total = 2 + 4 = 6
    expect(result.current.total).toBe(6)
  })

  it('v13-mode: SI-owned talents still contribute to talentCost', () => {
    seedSkills([
      { id: 's-si', name: 'SelfImprovementSkill', specialtyCost: 1 },
      { id: 's-a', name: 'Mining', specialtyCost: 2 },
    ])
    seedTalent({ id: 't-si', skillId: 's-si', isLevelable: false, maxTalentLevel: 0 })
    selectSkills(['s-si', 's-a'])
    selectTalent('t-si', true, 0)
    const { result } = renderHook(() => useStarCost(BUILD, DATASET), { wrapper })
    expect(result.current.talentCost).toBe(1)
    expect(result.current.total).toBe(3) // skillCost=2 (just Mining) + talentCost=1
  })

  it('v13-mode: reacts to cell-level talentLevel edits', () => {
    seedSkills([{ id: 's-a', name: 'Mining', specialtyCost: 2 }])
    seedTalent({ id: 't-lev', skillId: 's-a', isLevelable: true, maxTalentLevel: 5 })
    selectSkills(['s-a'])
    const utId = selectTalent('t-lev', true, 1)
    const { result } = renderHook(() => useStarCost(BUILD, DATASET), { wrapper })
    expect(result.current.talentCost).toBe(1)

    act(() => {
      stores.buildStore.setCell('userTalents', utId, 'talentLevel', 5)
    })
    expect(result.current.talentCost).toBe(5)
  })

  it('pre-v13-mode: total is non-SI skill count; specialtyCost and talents ignored', () => {
    seedSkills([
      { id: 's-si', name: 'SelfImprovementSkill', specialtyCost: 1 },
      { id: 's-a', name: 'Mining', specialtyCost: 1 },
      { id: 's-b', name: 'Smelting', specialtyCost: 1 },
      { id: 's-c', name: 'Farming', specialtyCost: 1 },
    ])
    seedTalent({ id: 't-lev', skillId: 's-a', isLevelable: true, maxTalentLevel: 5 })
    selectSkills(['s-si', 's-a', 's-b', 's-c'])
    selectTalent('t-lev', true, 5)
    const { result } = renderHook(() => useStarCost(BUILD, DATASET), { wrapper })
    expect(result.current.isV13).toBe(false)
    expect(result.current.total).toBe(3)
    expect(result.current.skillCost).toBe(3)
    expect(result.current.talentCost).toBe(0)
  })

  it('empty dataset (no skills) → pre-v13-mode with empty totals', () => {
    const { result } = renderHook(() => useStarCost(BUILD, DATASET), { wrapper })
    expect(result.current).toEqual({
      total: 0,
      skillCost: 0,
      talentCost: 0,
      moduleCost: 0,
      skillCount: 0,
      talentCount: 0,
      isV13: false,
    })
  })
})

// Module star costs come from Balance.eco.template: Basic 1, Advanced 1,
// Modern 1, Specialty 0 — charged per module installed, not per table.
describe('useStarCost — upgrade modules', () => {
  it('charges 1 star each for Basic, Advanced and Modern', () => {
    seedSkills([{ id: 's-a', name: 'Mining', specialtyCost: 2 }])
    seedTable('uct1', {
      basicModuleId: 'pm-basic',
      advancedModuleId: 'pm-adv',
      modernModuleId: 'pm-mod',
    })
    const { result } = renderHook(() => useStarCost(BUILD, DATASET), { wrapper })
    expect(result.current.moduleCost).toBe(3)
    expect(result.current.total).toBe(3)
  })

  it('charges nothing for a Specialty module', () => {
    seedSkills([{ id: 's-a', name: 'Mining', specialtyCost: 2 }])
    seedTable('uct1', { specialtyModuleId: 'pm-spec' })
    const { result } = renderHook(() => useStarCost(BUILD, DATASET), { wrapper })
    expect(result.current.moduleCost).toBe(0)
  })

  it('charges per module installed, not per table', () => {
    seedSkills([{ id: 's-a', name: 'Mining', specialtyCost: 2 }])
    seedTable('uct1', { basicModuleId: 'pm-basic', specialtyModuleId: 'pm-s1' })
    seedTable('uct2', { basicModuleId: 'pm-basic', modernModuleId: 'pm-mod' })
    const { result } = renderHook(() => useStarCost(BUILD, DATASET), { wrapper })
    // uct1 -> 1 (Basic) + 0 (Specialty); uct2 -> 1 (Basic) + 1 (Modern).
    expect(result.current.moduleCost).toBe(3)
  })

  it('adds module cost on top of skill and talent cost', () => {
    seedSkills([
      { id: 's-a', name: 'Mining', specialtyCost: 2 },
      { id: 's-b', name: 'Smelting', specialtyCost: 3 },
    ])
    selectSkills(['s-a', 's-b'])
    seedTable('uct1', { advancedModuleId: 'pm-adv' })
    const { result } = renderHook(() => useStarCost(BUILD, DATASET), { wrapper })
    // skills: (2+3) + (2*1)/2 = 6; modules: 1
    expect(result.current.skillCost).toBe(6)
    expect(result.current.moduleCost).toBe(1)
    expect(result.current.total).toBe(7)
  })

  it('ignores crafting tables belonging to another build', () => {
    seedSkills([{ id: 's-a', name: 'Mining', specialtyCost: 2 }])
    stores.buildStore.setRow('userCraftingTables', 'uct-other', {
      id: 'uct-other',
      buildId: 'other-build',
      craftingTableId: 'ct1',
      basicModuleId: 'pm-basic',
      costPerMinute: 0,
    })
    const { result } = renderHook(() => useStarCost(BUILD, DATASET), { wrapper })
    expect(result.current.moduleCost).toBe(0)
  })

  it('refreshes when a module is installed', () => {
    // `userCraftingTables` must be in the watched-tables array or the badge
    // silently keeps the old number after a module change.
    seedSkills([{ id: 's-a', name: 'Mining', specialtyCost: 2 }])
    seedTable('uct1', {})
    const { result } = renderHook(() => useStarCost(BUILD, DATASET), { wrapper })
    expect(result.current.moduleCost).toBe(0)
    act(() => {
      stores.buildStore.setCell('userCraftingTables', 'uct1', 'modernModuleId', 'pm-mod')
    })
    expect(result.current.moduleCost).toBe(1)
  })

  it('legacy (pre-v13) dataset: modules contribute 0 with no version check', () => {
    // Every v11-v13 module normalizes to the Specialty slot, which is free — so
    // a legacy build's star total is unchanged by the v14 work.
    seedSkills([
      { id: 's-a', name: 'Mining', specialtyCost: 1 },
      { id: 's-b', name: 'Smelting', specialtyCost: 1 },
    ])
    selectSkills(['s-a', 's-b'])
    seedTable('uct1', { specialtyModuleId: 'pm-legacy' })
    const { result } = renderHook(() => useStarCost(BUILD, DATASET), { wrapper })
    expect(result.current.isV13).toBe(false)
    expect(result.current.moduleCost).toBe(0)
    expect(result.current.total).toBe(2) // non-SI skill count only
  })
})
