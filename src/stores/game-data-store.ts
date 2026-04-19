import { createStore } from 'tinybase'
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'

export function createGameDataStore() {
  const store = createStore()

  store.setTablesSchema({
    datasets: {
      id: { type: 'string' },
      name: { type: 'string' },
      version: { type: 'number' },
      bundledId: { type: 'string', default: '' },
      installedRevision: { type: 'number', default: 0 },
      importedAt: { type: 'string' },
      updatedAt: { type: 'string' },
      isCustom: { type: 'boolean' },
    },
    skills: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      name: { type: 'string' },
      profession: { type: 'string', default: '' },
      maxLevel: { type: 'number' },
      laborReducePercent: { type: 'string' }, // JSON array stored as string
    },
    talents: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      skillId: { type: 'string' },
      name: { type: 'string' },
      talentGroupName: { type: 'string' },
      value: { type: 'number' },
      level: { type: 'number' },
      isLevelable: { type: 'boolean', default: false },
      maxTalentLevel: { type: 'number', default: 0 },
    },
    talentBonuses: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      talentId: { type: 'string' },
      bonusIndex: { type: 'number' },
      action: { type: 'string' },
      effectType: { type: 'string' },
      value: { type: 'number' },
      cap: { type: 'number', default: 0 },
      lowerIsBetter: { type: 'boolean', default: true },
    },
    items: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      name: { type: 'string' },
      isTag: { type: 'boolean' },
    },
    tagItems: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      tagId: { type: 'string' },
      itemId: { type: 'string' },
    },
    craftingTables: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      name: { type: 'string' },
    },
    pluginModules: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      name: { type: 'string' },
      pluginType: { type: 'string' },
      percent: { type: 'number' },
      skillId: { type: 'string', default: '' },
      skillPercent: { type: 'number', default: 0 },
    },
    craftingTablePluginModules: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      craftingTableId: { type: 'string' },
      pluginModuleId: { type: 'string' },
    },
    recipes: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      name: { type: 'string' },
      familyName: { type: 'string' },
      skillId: { type: 'string', default: '' },
      requiredSkillLevel: { type: 'number' },
      isBlueprint: { type: 'boolean' },
      isDefault: { type: 'boolean' },
      craftingTableId: { type: 'string' },
      baseCraftTime: { type: 'number' },
      baseLaborCost: { type: 'number' },
    },
    recipeElements: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      recipeId: { type: 'string' },
      itemOrTagId: { type: 'string' },
      baseQuantity: { type: 'number' },
      isProduct: { type: 'boolean' },
      index: { type: 'number' },
    },
    modifiers: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      targetType: { type: 'string' },
      targetId: { type: 'string' },
      dynamicType: { type: 'string' },
      refName: { type: 'string' },
    },
  })

  return store
}

export async function createPersistedGameDataStore() {
  const store = createGameDataStore()
  const persister = createIndexedDbPersister(store, 'eco-crafter-game-data')
  // See note in build-store.ts: startAutoLoad() polls IndexedDB on a
  // setInterval. The game-data store is the largest one (~60k rows), and
  // each reload was a ~800ms main-thread block — the dominant UI-lag
  // culprit. We only need the one-time initial load here.
  await persister.load()
  await persister.startAutoSave()
  return { store, persister }
}
