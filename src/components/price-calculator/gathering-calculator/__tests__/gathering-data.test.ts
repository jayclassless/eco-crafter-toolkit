import { beforeEach, describe, expect, it } from 'vitest'

import { clearGameDataIndexesCache, getGameDataIndexes } from '@/lib/game-data-indexes'
import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'

import {
  availableTalents,
  buildGatheringCatalog,
  defaultToolFor,
  findArrowItemId,
  findUserPriceId,
  retainTalents,
  seedGatheringControls,
  shouldReseedSkillLevel,
  toolsForKind,
} from '../gathering-data'

const DS = 'ds1'
const BUILD = 'b1'

const NO_TALENTS = {
  efficiency: false,
  efficiencyValue: 0.8,
  strength: false,
  strengthValue: 1,
  empower: false,
  empowerValue: 1,
  luckyBreak: false,
  deadeye: false,
  arrowRecovery: false,
  arrowRecoveryValue: 0.5,
}

let gameDataStore: ReturnType<typeof createGameDataStore>
let buildStore: ReturnType<typeof createBuildStore>

/** Raw names double as display names here; the tests never exercise i18n. */
const getName = (_entityType: string, _entityId: string) => ''

function addItem(id: string, name: string, extra: Record<string, unknown> = {}) {
  gameDataStore.setRow('items', id, { id, datasetId: DS, name, isTag: false, ...extra })
}

function addTool(
  id: string,
  itemId: string,
  kind: string,
  tier: number,
  extra: Record<string, unknown> = {}
) {
  gameDataStore.setRow('gatheringTools', id, {
    id,
    datasetId: DS,
    itemId,
    kind,
    tier,
    baseCalories: 20,
    baseDamage: tier,
    damageUsesToolCurve: false,
    calorieSkillId: 'mining',
    efficiencyTalentId: '',
    strengthTalentId: '',
    maxTake: 0,
    ...extra,
  })
}

beforeEach(() => {
  gameDataStore = createGameDataStore()
  buildStore = createBuildStore()
  clearGameDataIndexesCache(gameDataStore)

  gameDataStore.setRow('skills', 'logging', {
    id: 'logging',
    datasetId: DS,
    name: 'LoggingSkill',
    maxLevel: 7,
    laborReducePercent: '[]',
  })
  gameDataStore.setRow('skills', 'mining', {
    id: 'mining',
    datasetId: DS,
    name: 'MiningSkill',
    maxLevel: 7,
    laborReducePercent: '[]',
  })
  gameDataStore.setRow('talents', 'eff', {
    id: 'eff',
    datasetId: DS,
    skillId: 'mining',
    name: 'MiningToolEfficiencyTalent',
    talentGroupName: 'g',
    value: 0.8,
    level: 3,
  })
  gameDataStore.setRow('talents', 'lucky', {
    id: 'lucky',
    datasetId: DS,
    skillId: 'mining',
    name: 'MiningLuckyBreakTalent',
    talentGroupName: 'g',
    value: 1,
    level: 6,
  })

  addItem('granite', 'GraniteItem', {
    minableHardness: 3,
    rubbleItemsPerBlock: 4,
    rubbleMaxItemsPerBlock: 4,
    rubbleExtraHitsPerBlock: 0.75,
  })
  addItem('dirt', 'DirtItem', { requiresShovel: true })
  addItem('deer', 'DeerCarcassItem', { animalHealth: 6 })
  addItem('redwoodLog', 'RedwoodLogItem')
  addItem('boots', 'BuilderBootsItem', { clothingCalorieRate: -0.3 })
  addItem('pack', 'WorkBackpackItem', { clothingCalorieRate: -0.1 })
  addItem('arrow', 'ArrowItem')
  addItem('steelPick', 'SteelPickaxeItem')
  addItem('stonePick', 'StonePickaxeItem')
  addItem('axe', 'SteelAxeItem')

  gameDataStore.setRow('treeSpecies', 'redwood', {
    id: 'redwood',
    datasetId: DS,
    name: 'Redwood',
    logItemId: 'redwoodLog',
    treeHealth: 15,
    logHealth: 2,
    logsPerTreeMin: 0,
    logsPerTreeMax: 75,
  })
  gameDataStore.setRow('treeSpecies', 'oldGrowth', {
    id: 'oldGrowth',
    datasetId: DS,
    name: 'OldGrowthRedwood',
    logItemId: 'redwoodLog',
    treeHealth: 300,
    logHealth: 2,
    logsPerTreeMin: 700,
    logsPerTreeMax: 800,
  })

  addTool('t1', 'stonePick', 'Pickaxe', 1, { efficiencyTalentId: 'eff' })
  addTool('t2', 'steelPick', 'Pickaxe', 3, { efficiencyTalentId: 'eff' })
  addTool('t3', 'axe', 'Axe', 3, { damageUsesToolCurve: true, calorieSkillId: 'logging' })

  buildStore.setRow('builds', BUILD, { id: BUILD, datasetId: DS, name: 'b' })
})

describe('buildGatheringCatalog', () => {
  it('classifies each gathering kind', () => {
    const { byItemId } = buildGatheringCatalog(gameDataStore, DS, getName)
    expect(byItemId.get('granite')?.kind).toBe('rock')
    expect(byItemId.get('dirt')?.kind).toBe('excavatable')
    expect(byItemId.get('deer')?.kind).toBe('carcass')
    expect(byItemId.get('redwoodLog')?.kind).toBe('log')
  })

  it('excludes a minable item whose block yields no rubble', () => {
    // v11's Slag is Minable(4) with no rubble file at all.
    addItem('slag', 'SlagItem', { minableHardness: 4, rubbleItemsPerBlock: 0 })
    const { byItemId } = buildGatheringCatalog(gameDataStore, DS, getName)
    expect(byItemId.has('slag')).toBe(false)
  })

  it('surfaces every species behind one log item', () => {
    // Flattening health onto the item would silently drop Old-Growth Redwood.
    const { byItemId } = buildGatheringCatalog(gameDataStore, DS, getName)
    const log = byItemId.get('redwoodLog')!
    expect(log.species?.map((s) => s.name)).toEqual(['OldGrowthRedwood', 'Redwood'])
    expect(new Set(log.species?.map((s) => s.treeHealth)).size).toBe(2)
  })

  it('offers both calorie-reducing clothing slots', () => {
    const { clothing } = buildGatheringCatalog(gameDataStore, DS, getName)
    expect(clothing.map((c) => c.rawName).sort()).toEqual(['BuilderBootsItem', 'WorkBackpackItem'])
  })

  it('ignores rows belonging to another dataset', () => {
    gameDataStore.setRow('items', 'other', {
      id: 'other',
      datasetId: 'ds2',
      name: 'OtherItem',
      isTag: false,
      requiresShovel: true,
    })
    const { byItemId } = buildGatheringCatalog(gameDataStore, DS, getName)
    expect(byItemId.has('other')).toBe(false)
  })

  it('returns an empty catalog for a dataset with no gathering data', () => {
    // An installed dataset predating gathering extraction; the dialog shows an
    // "update your dataset" state rather than zeros.
    const empty = createGameDataStore()
    const catalog = buildGatheringCatalog(empty, DS, getName)
    expect(catalog.options).toEqual([])
    expect(catalog.tools).toEqual([])
  })
})

describe('tool selection', () => {
  it('offers only tools that can gather the target', () => {
    const { tools } = buildGatheringCatalog(gameDataStore, DS, getName)
    expect(toolsForKind(tools, 'rock').map((t) => t.rawName)).toEqual([
      'StonePickaxeItem',
      'SteelPickaxeItem',
    ])
    expect(toolsForKind(tools, 'log').map((t) => t.rawName)).toEqual(['SteelAxeItem'])
    expect(toolsForKind(tools, 'carcass')).toEqual([])
  })

  it('defaults to the lowest tier available', () => {
    const { tools } = buildGatheringCatalog(gameDataStore, DS, getName)
    expect(defaultToolFor(tools, 'rock')?.rawName).toBe('StonePickaxeItem')
    expect(defaultToolFor(tools, 'carcass')).toBeNull()
  })
})

describe('seedGatheringControls', () => {
  it('reads the skill level from the build', () => {
    buildStore.setRow('userSkills', 's1', {
      id: 's1',
      buildId: BUILD,
      skillId: 'mining',
      level: 5,
    })
    const { tools } = buildGatheringCatalog(gameDataStore, DS, getName)
    const tool = defaultToolFor(tools, 'rock')
    const seeded = seedGatheringControls(gameDataStore, buildStore, BUILD, DS, 'rock', tool)
    expect(seeded.skillLevel).toBe(5)
  })

  it("ignores another build's rows", () => {
    buildStore.setRow('userSkills', 's1', {
      id: 's1',
      buildId: 'other-build',
      skillId: 'mining',
      level: 7,
    })
    const { tools } = buildGatheringCatalog(gameDataStore, DS, getName)
    const seeded = seedGatheringControls(
      gameDataStore,
      buildStore,
      BUILD,
      DS,
      'rock',
      defaultToolFor(tools, 'rock')
    )
    expect(seeded.skillLevel).toBe(0)
  })

  it('enables talents the build has taken and reads their value from data', () => {
    buildStore.setRow('userTalents', 'ut1', {
      id: 'ut1',
      buildId: BUILD,
      talentId: 'eff',
      enabled: true,
    })
    buildStore.setRow('userTalents', 'ut2', {
      id: 'ut2',
      buildId: BUILD,
      talentId: 'lucky',
      enabled: true,
    })
    const { tools } = buildGatheringCatalog(gameDataStore, DS, getName)
    const seeded = seedGatheringControls(
      gameDataStore,
      buildStore,
      BUILD,
      DS,
      'rock',
      defaultToolFor(tools, 'rock')
    )
    expect(seeded.talents.efficiency).toBe(true)
    expect(seeded.talents.efficiencyValue).toBe(0.8)
    expect(seeded.talents.luckyBreak).toBe(true)
  })

  it('leaves a disabled talent off', () => {
    buildStore.setRow('userTalents', 'ut1', {
      id: 'ut1',
      buildId: BUILD,
      talentId: 'eff',
      enabled: false,
    })
    const { tools } = buildGatheringCatalog(gameDataStore, DS, getName)
    const seeded = seedGatheringControls(
      gameDataStore,
      buildStore,
      BUILD,
      DS,
      'rock',
      defaultToolFor(tools, 'rock')
    )
    expect(seeded.talents.efficiency).toBe(false)
  })

  it('cannot enable efficiency for a tool that has no such talent', () => {
    // Shovels and bows name the abstract ToolEfficiencyTalent, which is never
    // granted, so the extractor omits it and the id is ''.
    addTool('t4', 'stonePick', 'Shovel', 1)
    const { tools } = buildGatheringCatalog(gameDataStore, DS, getName)
    const shovel = toolsForKind(tools, 'excavatable')[0]
    expect(availableTalents('excavatable', shovel).efficiency).toBe(false)
    const seeded = seedGatheringControls(
      gameDataStore,
      buildStore,
      BUILD,
      DS,
      'excavatable',
      shovel
    )
    expect(seeded.talents.efficiency).toBe(false)
  })
})

describe('retainTalents', () => {
  it('keeps toggles the user set across a tool change', () => {
    // Swapping tools is a refinement of the same estimate, not a fresh start:
    // re-seeding from the build would silently undo the user's edits.
    const { tools } = buildGatheringCatalog(gameDataStore, DS, getName)
    const stone = toolsForKind(tools, 'rock')[0]
    const steel = toolsForKind(tools, 'rock')[1]
    const previous = { ...NO_TALENTS, efficiency: true, luckyBreak: true }
    const seeded = seedGatheringControls(gameDataStore, buildStore, BUILD, DS, 'rock', steel)

    expect(seeded.talents.efficiency).toBe(false) // build has neither talent
    const merged = retainTalents(previous, seeded.talents, 'rock', steel)
    expect(merged.efficiency).toBe(true)
    expect(merged.luckyBreak).toBe(true)
    expect(stone).toBeTruthy()
  })

  it('switches off a talent the new tool cannot have', () => {
    addTool('t4', 'stonePick', 'Shovel', 1)
    const { tools } = buildGatheringCatalog(gameDataStore, DS, getName)
    const shovel = toolsForKind(tools, 'excavatable')[0]
    const previous = { ...NO_TALENTS, efficiency: true }
    const merged = retainTalents(previous, { ...NO_TALENTS }, 'excavatable', shovel)
    expect(merged.efficiency).toBe(false)
  })

  it('takes talent values from the newly seeded state', () => {
    const { tools } = buildGatheringCatalog(gameDataStore, DS, getName)
    const pick = defaultToolFor(tools, 'rock')
    const seeded = seedGatheringControls(gameDataStore, buildStore, BUILD, DS, 'rock', pick)
    const merged = retainTalents(
      { ...NO_TALENTS, efficiencyValue: 999 },
      seeded.talents,
      'rock',
      pick
    )
    expect(merged.efficiencyValue).toBe(0.8)
  })
})

describe('shouldReseedSkillLevel', () => {
  it('keeps the level when the new tool uses the same skill', () => {
    // The bug this guards: every tool of a kind shares one calorie skill, so
    // re-seeding on a tier swap discards a level the user typed — resetting it
    // to zero for a skill they have not taken.
    const { tools } = buildGatheringCatalog(gameDataStore, DS, getName)
    const [stone, steel] = toolsForKind(tools, 'rock')
    expect(stone.calorieSkillId).toBe(steel.calorieSkillId)
    expect(shouldReseedSkillLevel(stone, steel)).toBe(false)
  })

  it('re-reads the level when the skill actually changes', () => {
    const { tools } = buildGatheringCatalog(gameDataStore, DS, getName)
    const pick = toolsForKind(tools, 'rock')[0]
    const axe = toolsForKind(tools, 'log')[0]
    expect(shouldReseedSkillLevel(pick, axe)).toBe(true)
  })

  it('treats a missing tool as no skill rather than throwing', () => {
    const { tools } = buildGatheringCatalog(gameDataStore, DS, getName)
    const pick = toolsForKind(tools, 'rock')[0]
    expect(shouldReseedSkillLevel(null, null)).toBe(false)
    expect(shouldReseedSkillLevel(null, pick)).toBe(true)
  })
})

describe('availableTalents', () => {
  it('scopes kind-specific talents to their kind', () => {
    const { tools } = buildGatheringCatalog(gameDataStore, DS, getName)
    const pick = defaultToolFor(tools, 'rock')!
    expect(availableTalents('rock', pick)).toMatchObject({
      luckyBreak: true,
      deadeye: false,
      arrowRecovery: false,
      empower: true,
    })
    expect(availableTalents('carcass', null)).toMatchObject({
      luckyBreak: false,
      deadeye: true,
      arrowRecovery: true,
      empower: false,
    })
  })
})

describe('lookups', () => {
  it('finds an existing userPrices row and reports "" otherwise', () => {
    expect(findUserPriceId(buildStore, BUILD, 'granite')).toBe('')
    buildStore.setRow('userPrices', 'up1', {
      id: 'up1',
      buildId: BUILD,
      itemOrTagId: 'granite',
      price: 3,
    })
    expect(findUserPriceId(buildStore, BUILD, 'granite')).toBe('up1')
  })

  it('finds the arrow item', () => {
    expect(findArrowItemId(gameDataStore, DS)).toBe('arrow')
    expect(findArrowItemId(gameDataStore, 'ds2')).toBe('')
  })
})

describe('gatherableItemIds index', () => {
  it('covers every gatherable item including logs', () => {
    const { gatherableItemIds } = getGameDataIndexes(gameDataStore)
    expect(gatherableItemIds.has('granite')).toBe(true)
    expect(gatherableItemIds.has('dirt')).toBe(true)
    expect(gatherableItemIds.has('deer')).toBe(true)
    expect(gatherableItemIds.has('redwoodLog')).toBe(true)
    expect(gatherableItemIds.has('boots')).toBe(false)
  })

  it('excludes a minable item with no rubble, matching the catalog', () => {
    addItem('slag', 'SlagItem', { minableHardness: 4, rubbleItemsPerBlock: 0 })
    clearGameDataIndexesCache(gameDataStore)
    expect(getGameDataIndexes(gameDataStore).gatherableItemIds.has('slag')).toBe(false)
  })
})
