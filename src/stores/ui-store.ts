import { createStore } from 'tinybase'
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'

export function createUIStore() {
  const store = createStore()

  store.setTablesSchema({
    uiState: {
      activeBuildId: { type: 'string', default: '' },
      activeDatasetId: { type: 'string', default: '' },
      searchBuy: { type: 'string', default: '' },
      searchSell: { type: 'string', default: '' },
      detailedTagsView: { type: 'boolean', default: false },
      detailedRecipesView: { type: 'boolean', default: false },
      marginDisplayMode: { type: 'string', default: 'name' },
      themeMode: { type: 'string', default: 'dark' },
      themeColor: { type: 'string', default: 'blue' },
      uiScale: { type: 'number', default: 14 },
      lastNewsViewedAt: { type: 'number', default: 0 },
      hasSeenAboutDialog: { type: 'boolean', default: false },
    },
  })

  // Initialize singleton row
  store.setRow('uiState', 'main', {})

  return store
}

export async function createPersistedUIStore() {
  const store = createUIStore()
  const persister = createIndexedDbPersister(store, 'eco-crafter-ui')
  // See note in build-store.ts: startAutoLoad() polls IndexedDB on a
  // setInterval. Only the one-time initial load is needed here.
  await persister.load()
  await persister.startAutoSave()
  return { store, persister }
}
