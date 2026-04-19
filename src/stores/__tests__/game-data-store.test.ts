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
      'craftingTablePluginModules',
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
      pluginType: 'ups',
      percent: 10,
    })
    expect(store.getCell('pluginModules', 'pm1', 'skillId')).toBe('')
    expect(store.getCell('pluginModules', 'pm1', 'skillPercent')).toBe(0)
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
