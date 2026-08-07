import { createStore } from 'tinybase'
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { beforeEach, describe, expect, it } from 'vitest'

import { createGameDataStore, createPersistedGameDataStore } from '../game-data-store'

async function deleteDb(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  await deleteDb('eco-crafter-game-data')
})

describe('createGameDataStore', () => {
  it('declares all game-data tables in the schema', () => {
    const store = createGameDataStore()
    const schema = JSON.parse(store.getTablesSchemaJson()) as Record<string, unknown>
    const expected = [
      'datasets',
      'skills',
      'talents',
      'talentBonuses',
      'items',
      'tagItems',
      'craftingTables',
      'pluginModules',
      'pluginModuleBonuses',
      'craftingTablePluginModules',
      'itemSalvage',
      'recipeGarbage',
      'recipes',
      'recipeElements',
      'modifiers',
      'recipeUnlocks',
    ]
    for (const table of expected) {
      expect(schema[table]).toBeDefined()
    }
  })

  it('applies defaults on inserted talent rows', () => {
    const store = createGameDataStore()
    store.setRow('talents', 't1', {
      id: 't1',
      datasetId: 'ds1',
      skillId: 'sk1',
      name: 'T',
      talentGroupName: 'G',
      value: 1,
      level: 1,
    })
    expect(store.getCell('talents', 't1', 'isLevelable')).toBe(false)
    expect(store.getCell('talents', 't1', 'maxTalentLevel')).toBe(0)
  })

  it('applies defaults on pluginModule rows', () => {
    const store = createGameDataStore()
    store.setRow('pluginModules', 'pm1', {
      id: 'pm1',
      datasetId: 'ds1',
      name: 'Module',
    })
    // Legacy datasets normalize every module to Specialty, which is also the
    // zero-star slot — so an unspecified slot is the safe default.
    expect(store.getCell('pluginModules', 'pm1', 'slot')).toBe('Specialty')
    expect(store.getCell('pluginModules', 'pm1', 'isDeprecated')).toBe(false)
  })

  it('applies defaults on pluginModuleBonus rows', () => {
    const store = createGameDataStore()
    store.setRow('pluginModuleBonuses', 'b1', {
      id: 'b1',
      datasetId: 'ds1',
      pluginModuleId: 'pm1',
      bonusIndex: 0,
      action: 'ResourceCost',
      effectType: 'AdditivePercent',
      value: -0.1,
    })
    // Empty skill scope means unscoped, and must round-trip as valid JSON.
    expect(store.getCell('pluginModuleBonuses', 'b1', 'skillIds')).toBe('[]')
  })
})

describe('createPersistedGameDataStore', () => {
  it('round-trips data through IndexedDB', async () => {
    const { store, persister } = await createPersistedGameDataStore()
    store.setRow('datasets', 'ds1', {
      id: 'ds1',
      name: 'Eco v11',
      version: 11,
      importedAt: 'now',
      updatedAt: 'now',
      isCustom: false,
    })
    await new Promise((r) => setTimeout(r, 50))
    await persister.save()
    await persister.destroy()

    const reopened = await createPersistedGameDataStore()
    expect(reopened.store.getRow('datasets', 'ds1').name).toBe('Eco v11')
    await reopened.persister.destroy()
  })
})

/** Write a pre-v14 game-data store straight to IndexedDB, bypassing the current
 * schema — this is what an existing user's browser holds after importing a
 * v11-v13 dataset before the unified module schema landed. */
async function seedLegacyGameData(): Promise<void> {
  const legacy = createStore()
  const p = createIndexedDbPersister(legacy, 'eco-crafter-game-data')
  legacy.setTables({
    datasets: { ds1: { id: 'ds1', name: 'Eco v13', version: 1 } },
    skills: { 'sk-carp': { id: 'sk-carp', datasetId: 'ds1', name: 'CarpentrySkill' } },
    pluginModules: {
      // 44 of 56 shipped legacy modules look like this (own-skill percent).
      'pm-scoped': {
        id: 'pm-scoped',
        datasetId: 'ds1',
        name: 'CarpentryUpgradeItem',
        pluginType: 'Resource&Speed',
        percent: 0.8,
        skillId: 'sk-carp',
        skillPercent: 0.75,
      },
      // The other 12 carry no own-skill percent.
      'pm-plain': {
        id: 'pm-plain',
        datasetId: 'ds1',
        name: 'BasicUpgradeItem',
        pluginType: 'Resource&Speed',
        percent: 0.9,
        skillId: '',
        skillPercent: 0,
      },
    },
  } as never)
  await p.save()
  await p.destroy()
}

function bonusesFor(store: ReturnType<typeof createGameDataStore>, moduleId: string) {
  return store
    .getRowIds('pluginModuleBonuses')
    .map((id) => store.getRow('pluginModuleBonuses', id))
    .filter((b) => b.pluginModuleId === moduleId)
    .map((b) => ({
      action: b.action,
      effectType: b.effectType,
      value: b.value,
      skillIds: JSON.parse(b.skillIds as string) as string[],
    }))
}

// An already-imported v11-v13 dataset must keep working across the schema
// change. Without the migration, the legacy cells are stripped on load and
// pluginModuleBonuses is empty, so every installed upgrade module silently
// applies a 0% discount and prices are wrong with no error anywhere.
describe('legacy pluginModules migration', () => {
  it('rebuilds bonuses for an already-imported legacy dataset', async () => {
    await seedLegacyGameData()
    const { store, persister } = await createPersistedGameDataStore()

    expect(bonusesFor(store, 'pm-scoped')).toEqual([
      { action: 'ResourceCost', effectType: 'Multiplicative', value: 0.8, skillIds: [] },
      { action: 'ResourceCost', effectType: 'Multiplicative', value: 0.75, skillIds: ['sk-carp'] },
      { action: 'CraftTime', effectType: 'Multiplicative', value: 0.8, skillIds: [] },
      { action: 'CraftTime', effectType: 'Multiplicative', value: 0.75, skillIds: ['sk-carp'] },
    ])
    expect(bonusesFor(store, 'pm-plain')).toEqual([
      { action: 'ResourceCost', effectType: 'Multiplicative', value: 0.9, skillIds: [] },
      { action: 'CraftTime', effectType: 'Multiplicative', value: 0.9, skillIds: [] },
    ])
    await persister.destroy()
  })

  it('preserves module row ids so build references stay valid', async () => {
    // Re-importing instead of migrating would mint new ids and orphan every
    // build's userCraftingTables.*ModuleId reference.
    await seedLegacyGameData()
    const { store, persister } = await createPersistedGameDataStore()
    expect(store.getRowIds('pluginModules').sort()).toEqual(['pm-plain', 'pm-scoped'])
    expect(store.getCell('pluginModules', 'pm-scoped', 'name')).toBe('CarpentryUpgradeItem')
    // And the new cells get their defaults.
    expect(store.getCell('pluginModules', 'pm-scoped', 'slot')).toBe('Specialty')
    await persister.destroy()
  })

  it('never synthesizes a LaborCost bonus', async () => {
    await seedLegacyGameData()
    const { store, persister } = await createPersistedGameDataStore()
    const all = store
      .getRowIds('pluginModuleBonuses')
      .map((id) => store.getCell('pluginModuleBonuses', id, 'action'))
    expect(all).not.toContain('LaborCost')
    await persister.destroy()
  })

  it('is idempotent across repeated launches', async () => {
    await seedLegacyGameData()
    const first = await createPersistedGameDataStore()
    const countAfterFirst = first.store.getRowIds('pluginModuleBonuses').length
    await new Promise((r) => setTimeout(r, 50))
    await first.persister.save()
    await first.persister.destroy()

    const second = await createPersistedGameDataStore()
    expect(second.store.getRowIds('pluginModuleBonuses')).toHaveLength(countAfterFirst)
    expect(bonusesFor(second.store, 'pm-scoped')).toHaveLength(4)
    await second.persister.destroy()
  })

  it('does no work on a fresh store', async () => {
    const { store, persister } = await createPersistedGameDataStore()
    expect(store.getRowIds('pluginModuleBonuses')).toHaveLength(0)
    await persister.destroy()
  })
})
