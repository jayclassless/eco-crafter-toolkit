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
      // Housing Score optimizer assumptions. Persisted for the same reason as
      // the sort fields above: stable scalars that stay meaningful across a
      // dataset switch. The unlocked-skill selection is deliberately NOT here —
      // it holds dataset-scoped skill ids, which would silently exclude every
      // furnishing after switching datasets.
      housingOptimizerTier: { type: 'number', default: 5 },
      housingOptimizerMaxFurnishingRepeats: { type: 'number', default: 3 },
      housingOptimizerMinFurnishingContribution: { type: 'number', default: 0.2 },
      housingOptimizerResidents: { type: 'number', default: 1 },
      housingOptimizerMaxRoomRepeat: { type: 'number', default: 2 },
      housingOptimizerMinRoomContribution: { type: 'number', default: 2 },
      // Comma-joined PowerType names. '' means "no power available" and must
      // never be read back as "all".
      housingOptimizerPower: { type: 'string', default: 'Heat,Mechanical' },
      // Unlocked-skill selection, stored as the game's own skill NAMES rather
      // than row ids. Ids are per-dataset uuids, so storing those would silently
      // exclude every furnishing after a dataset switch; names are stable across
      // versions. '*' means "all", '' means "none".
      housingOptimizerSkills: { type: 'string', default: '*' },
      // Which Housing Score view is open. A stable enum, so it survives a
      // dataset switch like the sort fields do.
      housingView: { type: 'string', default: 'furnishings' },
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
