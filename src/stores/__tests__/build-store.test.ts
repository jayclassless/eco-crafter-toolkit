import { beforeEach, describe, expect, it } from 'vitest'

import { createBuildStore, createPersistedBuildStore } from '../build-store'

async function deleteDb(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  await deleteDb('eco-crafter-builds')
})

describe('createBuildStore', () => {
  it('declares all build tables in the schema', () => {
    const store = createBuildStore()
    const schema = JSON.parse(store.getTablesSchemaJson()) as Record<string, unknown>
    const expected = [
      'builds',
      'userSkills',
      'userTalents',
      'userCraftingTables',
      'userRecipes',
      'userPrices',
      'userMargins',
      'userRecipeMargins',
      'userProductMargins',
      'userSettings',
      'computedPrices',
      'hiddenSkills',
      'hiddenCraftingTables',
    ]
    for (const table of expected) {
      expect(schema[table]).toBeDefined()
    }
  })

  it('fills defaults on new rows (userPrices.priceMode defaults to "min")', () => {
    const store = createBuildStore()
    store.setRow('userPrices', 'p1', {
      id: 'p1',
      buildId: 'b1',
      itemOrTagId: 'item-iron',
    })
    expect(store.getCell('userPrices', 'p1', 'priceMode')).toBe('min')
    expect(store.getCell('userPrices', 'p1', 'isOverride')).toBe(false)
    expect(store.getCell('userPrices', 'p1', 'price')).toBe(0)
  })

  it('fills userSettings defaults when row is created with minimum fields', () => {
    const store = createBuildStore()
    store.setRow('userSettings', 's1', { id: 's1', buildId: 'b1' })
    expect(store.getCell('userSettings', 's1', 'marginType')).toBe('markup')
    expect(store.getCell('userSettings', 's1', 'showUnskilledRecipes')).toBe(true)
    expect(store.getCell('userSettings', 's1', 'onlyLevelAccessible')).toBe(false)
    expect(store.getCell('userSettings', 's1', 'applyMarginBetweenSkills')).toBe(false)
    expect(store.getCell('userSettings', 's1', 'calorieCost')).toBe(0)
  })
})

describe('createPersistedBuildStore', () => {
  it('returns a working store and persister that round-trips data', async () => {
    const { store, persister } = await createPersistedBuildStore()
    store.setRow('builds', 'b1', {
      id: 'b1',
      datasetId: 'ds1',
      name: 'Test',
      createdAt: 'now',
    })
    // Drain pending auto-saves, then save once more so the DB has the final state.
    await new Promise((r) => setTimeout(r, 50))
    await persister.save()
    await persister.destroy()

    const reopened = await createPersistedBuildStore()
    expect(reopened.store.getRow('builds', 'b1').name).toBe('Test')
    await reopened.persister.destroy()
  })
})
