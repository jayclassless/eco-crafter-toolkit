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
      lastReleasesViewedAt: { type: 'number', default: 0 },
      hasSeenAboutDialog: { type: 'boolean', default: false },
      // Crop Tracker field sorting.
      cropSortField: { type: 'string', default: 'name' }, // name | plant | planted | harvest
      cropSortDir: { type: 'string', default: 'asc' }, // asc | desc
      // Housing Score table sorting. Persisted (unlike its filters, which hold
      // dataset-scoped ids) because these are stable enums that stay meaningful
      // across a dataset switch.
      housingFurnishingSortField: { type: 'string', default: 'baseValue' },
      housingFurnishingSortDir: { type: 'string', default: 'desc' },
      housingMaterialSortField: { type: 'string', default: 'tier' },
      housingMaterialSortDir: { type: 'string', default: 'asc' },
    },
    // Per-dataset memory of the build the user last viewed. Row id = datasetId.
    // BuildRedirect uses this to land on the last-viewed build instead of the
    // first one; purge-data (src/lib/purge-data.ts) clears stale entries.
    lastViewedBuilds: {
      buildId: { type: 'string', default: '' },
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
