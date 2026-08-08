import { createStore } from 'tinybase'
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { beforeEach, describe, expect, it } from 'vitest'

import { peekPersistedTable } from '../peek-persisted-table'

const DB = 'eco-crafter-peek-test'

async function deleteDb(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

/** Write tables through the real persister, so the on-disk layout is exactly
 * what production reads — object store `t`, one `{k, v}` record per table. */
async function seed(tables: Record<string, Record<string, Record<string, unknown>>>) {
  const store = createStore()
  const persister = createIndexedDbPersister(store, DB)
  store.setTables(tables as never)
  await persister.save()
  await persister.destroy()
}

beforeEach(async () => {
  await deleteDb(DB)
})

describe('peekPersistedTable', () => {
  it('returns the requested table as rowId -> cells', async () => {
    await seed({
      pluginModules: {
        'pm-a': { id: 'pm-a', name: 'BasicUpgrade', percent: 0.9 },
        'pm-b': { id: 'pm-b', name: 'CarpentryUpgrade', percent: 0.8 },
      },
    })
    const table = await peekPersistedTable(DB, 'pluginModules')
    expect(Object.keys(table).sort()).toEqual(['pm-a', 'pm-b'])
    expect(table['pm-a']).toEqual({ id: 'pm-a', name: 'BasicUpgrade', percent: 0.9 })
  })

  it('preserves cells that no current schema declares', async () => {
    // The whole reason this helper exists: the pre-v14 migration cells are gone
    // the moment the data passes through a schema'd store.
    await seed({
      userCraftingTables: { uct1: { id: 'uct1', pluginModuleId: 'pm-legacy' } },
    })
    const table = await peekPersistedTable(DB, 'userCraftingTables')
    expect(table.uct1?.pluginModuleId).toBe('pm-legacy')
  })

  it('reads only the requested table, ignoring every other one', async () => {
    // The point of the change: cost must not scale with the rest of the store.
    await seed({
      pluginModules: { 'pm-a': { id: 'pm-a' } },
      items: { 'it-1': { id: 'it-1' }, 'it-2': { id: 'it-2' } },
      recipes: { 'r-1': { id: 'r-1' } },
    })
    const table = await peekPersistedTable(DB, 'pluginModules')
    expect(table).toEqual({ 'pm-a': { id: 'pm-a' } })
  })

  it('returns {} for a table that is not present', async () => {
    await seed({ items: { 'it-1': { id: 'it-1' } } })
    expect(await peekPersistedTable(DB, 'pluginModules')).toEqual({})
  })

  it('returns {} for a database that does not exist', async () => {
    // First launch. Must not throw — the caller treats this as "nothing to
    // migrate", same as a successful read that found nothing.
    expect(await peekPersistedTable('eco-crafter-never-created', 'pluginModules')).toEqual({})
  })

  it('returns {} for a database the persister has never written to', async () => {
    // An empty database has no object stores at all, so `transaction(['t'])`
    // would throw NotFoundError if the helper did not check first.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB, 1)
      req.onsuccess = () => {
        req.result.close()
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
    expect(await peekPersistedTable(DB, 'pluginModules')).toEqual({})
  })

  it('does not leave the connection open, so a later version upgrade is not blocked', async () => {
    // The persister writes with open(db, 2), which upgrades. A connection left
    // open by the peek would fire onblocked and stall startup.
    await seed({ pluginModules: { 'pm-a': { id: 'pm-a' } } })
    await peekPersistedTable(DB, 'pluginModules')

    const blocked = await new Promise<boolean>((resolve, reject) => {
      const req = indexedDB.open(DB, 3)
      req.onblocked = () => resolve(true)
      req.onsuccess = () => {
        req.result.close()
        resolve(false)
      }
      req.onerror = () => reject(req.error)
    })
    expect(blocked).toBe(false)
  })
})
