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
      // v14 gives tables up to four module slots. Flat cells rather than a join
      // table so the row shape (and every existing read/write path) is intact.
      // Legacy datasets normalize every module to Specialty, so a v11-v13 build
      // uses specialtyModuleId alone and behaves exactly as before.
      basicModuleId: { type: 'string', default: '' },
      advancedModuleId: { type: 'string', default: '' },
      modernModuleId: { type: 'string', default: '' },
      specialtyModuleId: { type: 'string', default: '' },
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
    // Explicit per-product reintegration overrides. A row exists only when the
    // user has toggled a product away from its computed default; absence means
    // "use the default rule" (see `computeReintegratedProductIds`).
    userReintegratedProducts: {
      id: { type: 'string' },
      buildId: { type: 'string' },
      userRecipeId: { type: 'string' },
      productItemOrTagId: { type: 'string' },
      isReintegrated: { type: 'boolean', default: false },
    },
    userSettings: {
      id: { type: 'string' },
      buildId: { type: 'string' },
      marginType: { type: 'string', default: 'markup' },
      calorieCost: { type: 'number', default: 0 },
      showUnskilledRecipes: { type: 'boolean', default: true },
      onlyLevelAccessible: { type: 'boolean', default: false },
      applyMarginBetweenSkills: { type: 'boolean', default: false },
      allowMultipleTalentPicks: { type: 'boolean', default: false },
      showParts: { type: 'boolean', default: true },
      showUntagged: { type: 'boolean', default: true },
      showOnlyFavorites: { type: 'boolean', default: false },
      defaultShareForSecondaryItems: { type: 'number', default: 20 },
      blueprintMode: { type: 'string', default: 'include' },
      growthRateModifier: { type: 'number', default: 1 },
      // Gathering Calculator: calories burned picking up one piece of rubble.
      // 1 in every shipped game version, but it lives only in the compiled
      // server binary rather than in dataset data, so it stays user-editable.
      caloriesPerRubblePickup: { type: 'number', default: 1 },
    },
    computedPrices: {
      id: { type: 'string' },
      buildId: { type: 'string' },
      itemOrTagId: { type: 'string' },
      costPrice: { type: 'number' },
      salePrice: { type: 'number' },
      recipeId: { type: 'string' },
    },
    // Crop Tracker: one row per tracked field/plot for a build.
    userPlantings: {
      id: { type: 'string' },
      buildId: { type: 'string' },
      cropItemId: { type: 'string' }, // game-data items row id (the harvested crop)
      name: { type: 'string', default: '' }, // optional user field name
      plantedAt: { type: 'string', default: '' }, // ISO; '' = not yet planted
      hasRegrown: { type: 'boolean', default: false }, // true after first harvest of a regen crop
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

/**
 * Read each build's pre-v14 `userCraftingTables.pluginModuleId` from IndexedDB.
 *
 * 🛑 This MUST use a bare `createStore()` with no schema, and it MUST run before
 * the real store loads. TinyBase enforces a table schema destructively — the
 * docs say applying one "may result in a change to data in the Store, as
 * defaults are applied or as invalid Table, Row, or Cell objects are removed" —
 * and `createBuildStore()` calls `setTablesSchema` at construction, i.e. before
 * `persister.load()`. Verified empirically: loading a legacy row into the new
 * schema yields
 *
 *   {"id":"r1","buildId":"b1","craftingTableId":"ct1","specialtyModuleId":""}
 *
 * — `pluginModuleId` is gone and `specialtyModuleId` has been defaulted to ''.
 * So a migration that runs *after* load() finds nothing, reports success, and
 * silently drops every user's installed upgrade module. Reusing the schema'd
 * store here would look like an obvious simplification and would reintroduce
 * exactly that. See `build-store.test.ts` for the executable guard.
 *
 * Returns an empty map on any failure, and on already-migrated stores (the cell
 * is stripped on the first save after migrating, so this is self-disarming and
 * therefore idempotent).
 */
async function readLegacyPluginModuleIds(): Promise<Map<string, string>> {
  if (typeof indexedDB === 'undefined') return new Map()
  const out = new Map<string, string>()
  const probe = createStore()
  const probePersister = createIndexedDbPersister(probe, 'eco-crafter-builds')
  try {
    await probePersister.load()
    for (const rowId of probe.getRowIds('userCraftingTables')) {
      const legacy = probe.getCell('userCraftingTables', rowId, 'pluginModuleId')
      if (typeof legacy === 'string' && legacy !== '') out.set(rowId, legacy)
    }
  } catch {
    // A missing or unreadable DB is a first launch, not an error.
    return new Map()
  } finally {
    await probePersister.destroy()
  }
  return out
}

export async function createPersistedBuildStore() {
  // Must happen before the schema'd store below is constructed and loaded.
  const legacyModuleIds = await readLegacyPluginModuleIds()

  const store = createBuildStore()
  const persister = createIndexedDbPersister(store, 'eco-crafter-builds')
  // load() pulls persisted state once. We intentionally skip startAutoLoad()
  // because it installs a 1Hz setInterval that polls IndexedDB and replays
  // the entire store via setContent every tick — on a store this size that
  // saturated the main thread and caused noticeable UI lag. This app is the
  // only writer to its DB, so event-driven save + one-time load is enough.
  await persister.load()

  // v13 -> v14 module migration: a legacy module always normalizes to the
  // Specialty slot, so this is a pure cell rename with no id remapping. Applied
  // before startAutoSave so the rewritten rows are part of the first save.
  if (legacyModuleIds.size > 0) {
    store.transaction(() => {
      for (const [rowId, moduleId] of legacyModuleIds) {
        // Don't clobber a slot the user has already set on this row.
        if (store.getCell('userCraftingTables', rowId, 'specialtyModuleId')) continue
        if (!store.hasRow('userCraftingTables', rowId)) continue
        store.setCell('userCraftingTables', rowId, 'specialtyModuleId', moduleId)
      }
    })
  }

  await persister.startAutoSave()
  return { store, persister }
}
