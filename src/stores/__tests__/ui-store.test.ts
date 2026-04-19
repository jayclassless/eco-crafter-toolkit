import { beforeEach, describe, expect, it } from 'vitest'

import { createPersistedUIStore, createUIStore } from '../ui-store'

async function deleteDb(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  await deleteDb('eco-crafter-ui')
})

describe('createUIStore', () => {
  it('initializes the singleton uiState row with all default values', () => {
    const store = createUIStore()
    const row = store.getRow('uiState', 'main')
    expect(row).toEqual({
      activeBuildId: '',
      activeDatasetId: '',
      searchBuy: '',
      searchSell: '',
      detailedTagsView: false,
      detailedRecipesView: false,
      marginDisplayMode: 'name',
      themeMode: 'auto',
      themeColor: 'blue',
      uiScale: 14,
    })
  })

  it('allows updating fields on the singleton row', () => {
    const store = createUIStore()
    store.setCell('uiState', 'main', 'activeBuildId', 'build-1')
    store.setCell('uiState', 'main', 'themeColor', 'green')
    expect(store.getCell('uiState', 'main', 'activeBuildId')).toBe('build-1')
    expect(store.getCell('uiState', 'main', 'themeColor')).toBe('green')
  })
})

describe('createPersistedUIStore', () => {
  it('returns a store and a persister bound to the same data', async () => {
    const { store, persister } = await createPersistedUIStore()
    expect(store.getRow('uiState', 'main')).toBeDefined()
    // The persister exposes the standard start/stop + save/load API.
    expect(typeof persister.save).toBe('function')
    expect(typeof persister.load).toBe('function')
    await persister.destroy()
  })

  it('persists cells through save() and a fresh load()', async () => {
    const { store, persister } = await createPersistedUIStore()
    store.setCell('uiState', 'main', 'activeBuildId', 'build-1')
    store.setCell('uiState', 'main', 'themeColor', 'green')
    store.setCell('uiState', 'main', 'uiScale', 16)
    // Let pending auto-saves drain, then explicitly save one more time so the
    // final record in IndexedDB is guaranteed to reflect the latest cells.
    await new Promise((r) => setTimeout(r, 50))
    await persister.save()
    await persister.destroy()

    const fresh = createUIStore()
    const { createIndexedDbPersister } = await import('tinybase/persisters/persister-indexed-db')
    const freshPersister = createIndexedDbPersister(fresh, 'eco-crafter-ui')
    await freshPersister.load()
    expect(fresh.getCell('uiState', 'main', 'activeBuildId')).toBe('build-1')
    expect(fresh.getCell('uiState', 'main', 'themeColor')).toBe('green')
    expect(fresh.getCell('uiState', 'main', 'uiScale')).toBe(16)
    await freshPersister.destroy()
  })
})
