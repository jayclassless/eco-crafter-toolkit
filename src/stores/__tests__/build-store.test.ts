import { createStore } from 'tinybase'
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { beforeEach, describe, expect, it } from 'vitest'

import { createBuildStore, createPersistedBuildStore } from '../build-store'
import { peekPersistedTable } from '../peek-persisted-table'

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

/** Write a pre-v14 build store straight to IndexedDB, bypassing the current
 * schema — this is what an existing user's browser holds. */
async function seedLegacyStore(rows: Record<string, Record<string, unknown>>): Promise<void> {
  const legacy = createStore()
  const p = createIndexedDbPersister(legacy, 'eco-crafter-builds')
  legacy.setTables({ userCraftingTables: rows } as never)
  await p.save()
  await p.destroy()
}

describe('userCraftingTables v13 -> v14 module migration', () => {
  it('copies pluginModuleId into the Specialty slot', async () => {
    // A legacy module always normalizes to the Specialty slot, so this is a pure
    // cell rename — no id remapping is involved.
    await seedLegacyStore({
      uct1: {
        id: 'uct1',
        buildId: 'b1',
        craftingTableId: 'ct1',
        pluginModuleId: 'pm-carpentry',
        costPerMinute: 3,
      },
    })

    const { store, persister } = await createPersistedBuildStore()
    expect(store.getCell('userCraftingTables', 'uct1', 'specialtyModuleId')).toBe('pm-carpentry')
    // Unrelated cells must survive the migration untouched.
    expect(store.getCell('userCraftingTables', 'uct1', 'costPerMinute')).toBe(3)
    expect(store.getCell('userCraftingTables', 'uct1', 'basicModuleId')).toBe('')
    await persister.destroy()
  })

  it('is idempotent across repeated launches', async () => {
    await seedLegacyStore({
      uct1: { id: 'uct1', buildId: 'b1', craftingTableId: 'ct1', pluginModuleId: 'pm-a' },
    })

    const first = await createPersistedBuildStore()
    await new Promise((r) => setTimeout(r, 50))
    await first.persister.save()
    await first.persister.destroy()

    const second = await createPersistedBuildStore()
    expect(second.store.getCell('userCraftingTables', 'uct1', 'specialtyModuleId')).toBe('pm-a')
    await second.persister.destroy()
  })

  it('leaves a store with no legacy cell alone', async () => {
    await seedLegacyStore({
      uct1: {
        id: 'uct1',
        buildId: 'b1',
        craftingTableId: 'ct1',
        specialtyModuleId: 'already-set',
      },
    })
    const { store, persister } = await createPersistedBuildStore()
    expect(store.getCell('userCraftingTables', 'uct1', 'specialtyModuleId')).toBe('already-set')
    await persister.destroy()
  })

  it('does not clobber a slot the user has already set', async () => {
    await seedLegacyStore({
      uct1: {
        id: 'uct1',
        buildId: 'b1',
        craftingTableId: 'ct1',
        pluginModuleId: 'pm-old',
        specialtyModuleId: 'pm-new',
      },
    })
    const { store, persister } = await createPersistedBuildStore()
    expect(store.getCell('userCraftingTables', 'uct1', 'specialtyModuleId')).toBe('pm-new')
    await persister.destroy()
  })
})

// 🛑 Executable guard for the hazard that makes the migration above non-obvious.
// If anyone "simplifies" readLegacyPluginModuleIds to read through the schema'd
// store, or moves the peek to after persister.load(), the migration silently
// finds nothing and every user's installed upgrade module is lost with no error.
// These two tests are the pair that documents why: the schema DROPS the legacy
// cell, and only the raw persisted record still carries it.
describe('tinybase schema enforcement (why the migration peeks before load)', () => {
  it('strips cells that are not in the schema', () => {
    const schemad = createBuildStore()
    schemad.setContent([
      {
        userCraftingTables: {
          uct1: {
            id: 'uct1',
            buildId: 'b1',
            craftingTableId: 'ct1',
            pluginModuleId: 'WOULD_BE_LOST',
          },
        },
      },
      {},
    ])
    const row = schemad.getRow('userCraftingTables', 'uct1')
    expect(row.pluginModuleId).toBeUndefined()
    expect(row.specialtyModuleId).toBe('')
  })

  it('keeps them in the raw persisted record, which is what the peek relies on', async () => {
    await seedLegacyStore({
      uct1: { id: 'uct1', buildId: 'b1', craftingTableId: 'ct1', pluginModuleId: 'PRESERVED' },
    })
    const table = await peekPersistedTable('eco-crafter-builds', 'userCraftingTables')
    expect(table.uct1?.pluginModuleId).toBe('PRESERVED')
  })
})
