import { createStore } from 'tinybase'
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'

export function createBuildStore() {
  const store = createStore()

  store.setTablesSchema({
    builds: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      name: { type: 'string' },
      createdAt: { type: 'string' },
    },
    userSkills: {
      id: { type: 'string' },
      buildId: { type: 'string' },
      skillId: { type: 'string' },
      level: { type: 'number' },
    },
    userTalents: {
      id: { type: 'string' },
      buildId: { type: 'string' },
      talentId: { type: 'string' },
      enabled: { type: 'boolean' },
      talentLevel: { type: 'number', default: 0 },
    },
    userCraftingTables: {
      id: { type: 'string' },
      buildId: { type: 'string' },
      craftingTableId: { type: 'string' },
      pluginModuleId: { type: 'string', default: '' },
      costPerMinute: { type: 'number', default: 0 },
    },
    userRecipes: {
      id: { type: 'string' },
      buildId: { type: 'string' },
      recipeId: { type: 'string' },
      roundFactor: { type: 'number', default: 0 },
      favorite: { type: 'boolean', default: false },
    },
    userPrices: {
      id: { type: 'string' },
      buildId: { type: 'string' },
      itemOrTagId: { type: 'string' },
      price: { type: 'number', default: 0 },
      isOverride: { type: 'boolean', default: false },
      primaryItemId: { type: 'string', default: '' },
      priceMode: { type: 'string', default: 'min' },
    },
    userMargins: {
      id: { type: 'string' },
      buildId: { type: 'string' },
      name: { type: 'string' },
      percent: { type: 'number' },
      isDefault: { type: 'boolean', default: false },
    },
    userRecipeMargins: {
      id: { type: 'string' },
      buildId: { type: 'string' },
      userRecipeId: { type: 'string' },
      userMarginId: { type: 'string' },
    },
    userProductMargins: {
      id: { type: 'string' },
      buildId: { type: 'string' },
      itemOrTagId: { type: 'string' },
      userMarginId: { type: 'string' },
    },
    userProductShares: {
      id: { type: 'string' },
      buildId: { type: 'string' },
      userRecipeId: { type: 'string' },
      productItemOrTagId: { type: 'string' },
      sharePercent: { type: 'number', default: 0 },
    },
    userSettings: {
      id: { type: 'string' },
      buildId: { type: 'string' },
      marginType: { type: 'string', default: 'markup' },
      calorieCost: { type: 'number', default: 0 },
      showUnskilledRecipes: { type: 'boolean', default: true },
      onlyLevelAccessible: { type: 'boolean', default: false },
      applyMarginBetweenSkills: { type: 'boolean', default: false },
      showParts: { type: 'boolean', default: true },
      showUntagged: { type: 'boolean', default: true },
      showOnlyFavorites: { type: 'boolean', default: false },
      defaultShareForSecondaryItems: { type: 'number', default: 20 },
    },
    computedPrices: {
      id: { type: 'string' },
      buildId: { type: 'string' },
      itemOrTagId: { type: 'string' },
      costPrice: { type: 'number' },
      salePrice: { type: 'number' },
      recipeId: { type: 'string' },
    },
    hiddenSkills: {
      buildId: { type: 'string' },
      skillId: { type: 'string' },
    },
    hiddenCraftingTables: {
      buildId: { type: 'string' },
      craftingTableId: { type: 'string' },
    },
    hiddenTags: {
      buildId: { type: 'string' },
      tagId: { type: 'string' },
    },
  })

  return store
}

export async function createPersistedBuildStore() {
  const store = createBuildStore()
  const persister = createIndexedDbPersister(store, 'eco-crafter-builds')
  // load() pulls persisted state once. We intentionally skip startAutoLoad()
  // because it installs a 1Hz setInterval that polls IndexedDB and replays
  // the entire store via setContent every tick — on a store this size that
  // saturated the main thread and caused noticeable UI lag. This app is the
  // only writer to its DB, so event-driven save + one-time load is enough.
  await persister.load()
  await persister.startAutoSave()
  return { store, persister }
}
