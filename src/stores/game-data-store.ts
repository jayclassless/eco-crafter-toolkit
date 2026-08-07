import { createStore, type Store } from 'tinybase'
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'

import { legacyModuleBonuses } from '@/lib/normalize-module-bonuses'

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
      // v11/v12 datasets lack SpecialtyCost; default 1 matches pre-v13 flat cost.
      specialtyCost: { type: 'number', default: 1 },
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
      isPart: { type: 'boolean', default: false },
      isCustom: { type: 'boolean', default: false },
      // Crop growth data, present only on harvested crop items. A value of
      // maturityAgeDays > 0 marks an item as a trackable crop.
      maturityAgeDays: { type: 'number', default: 0 },
      postHarvestingGrowth: { type: 'number', default: 0 },
      pickableAtPercent: { type: 'number', default: 0 },
      // Primary-resource yield range. The schema is flat, so this is two scalar
      // columns rather than a nested object. Both 0 = range data unavailable.
      primaryResourceMin: { type: 'number', default: 0 },
      primaryResourceMax: { type: 'number', default: 0 },
      seedItemId: { type: 'string', default: '' },
      isTree: { type: 'boolean', default: false },
      // Gathering data, present only on items gathered from the world. The four
      // classes are disjoint, so a single non-zero field identifies the kind:
      // minableHardness -> rock, requiresShovel -> excavatable,
      // animalHealth -> carcass. Logs are keyed off the `treeSpecies` table
      // instead, since two species can yield the same log item.
      minableHardness: { type: 'number', default: 0 },
      rubbleItemsPerBlock: { type: 'number', default: 0 },
      rubbleMaxItemsPerBlock: { type: 'number', default: 0 },
      rubbleExtraHitsPerBlock: { type: 'number', default: 0 },
      requiresShovel: { type: 'boolean', default: false },
      animalHealth: { type: 'number', default: 0 },
      // Clothing only: UserStatType.CalorieRate, a negative per-action modifier.
      clothingCalorieRate: { type: 'number', default: 0 },
    },
    // World-gathering tools (pickaxe/shovel/axe/bow/drill). Talent and skill
    // references are row ids, or '' when the name resolves to nothing — which
    // is how the abstract, never-granted ToolEfficiencyTalent that shovels and
    // bows name in their C# correctly becomes a no-op.
    gatheringTools: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      itemId: { type: 'string' },
      kind: { type: 'string' },
      tier: { type: 'number', default: 0 },
      baseCalories: { type: 'number', default: 0 },
      calorieSkillId: { type: 'string', default: '' },
      baseDamage: { type: 'number', default: 0 },
      // True when the C# used CreateDamageValue(), so ToolItem's damage curve
      // applies. False for ConstantValue() — pickaxes get no level scaling.
      damageUsesToolCurve: { type: 'boolean', default: false },
      efficiencyTalentId: { type: 'string', default: '' },
      strengthTalentId: { type: 'string', default: '' },
      maxTake: { type: 'number', default: 0 },
    },
    // Tree species. Deliberately not flattened onto the log item: Redwood and
    // Old-Growth Redwood both yield RedwoodLogItem with very different health
    // and log counts, so a flat column would silently drop one of them.
    treeSpecies: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      name: { type: 'string' },
      logItemId: { type: 'string' },
      treeHealth: { type: 'number', default: 0 },
      logsPerTreeMin: { type: 'number', default: 0 },
      logsPerTreeMax: { type: 'number', default: 0 },
    },
    itemParts: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      itemId: { type: 'string' },
      partItemId: { type: 'string' },
      quantity: { type: 'number' },
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
    // Module effects are NOT stored here — see `pluginModuleBonuses`. The legacy
    // pluginType/percent/skillId/skillPercent cells are gone: both dataset
    // shapes are resolved into the unified bonus rows at import time
    // (`normalizeModuleBonuses`), so nothing downstream branches on version.
    pluginModules: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      name: { type: 'string' },
      /** 'Basic' | 'Advanced' | 'Modern' | 'Specialty'. Legacy datasets
       * normalize to 'Specialty', which is also the zero-star slot — so they
       * contribute no module star cost with no version check. */
      slot: { type: 'string', default: 'Specialty' },
      /** Hidden from module pickers, but kept so builds referencing one still
       * resolve. Only ever true on v14 tier-ladder modules. */
      isDeprecated: { type: 'boolean', default: false },
    },
    /** Mirrors `talentBonuses`, plus the skill scope a module bonus can carry.
     * Both dataset versions land here in the same shape. */
    pluginModuleBonuses: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      pluginModuleId: { type: 'string' },
      bonusIndex: { type: 'number' },
      action: { type: 'string' },
      effectType: { type: 'string' },
      value: { type: 'number' },
      /** JSON array of skill *ids*; `[]` means unscoped. Same JSON-in-a-cell
       * pattern as `skills.laborReducePercent`. */
      skillIds: { type: 'string', default: '[]' },
    },
    craftingTablePluginModules: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      craftingTableId: { type: 'string' },
      pluginModuleId: { type: 'string' },
    },
    /** `[SalvageCost(...)]` — what an item breaks down into. Scaled by
     * CRAFT_GARBAGE_RATIO when computing a recipe's garbage. v14 only. */
    itemSalvage: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      itemId: { type: 'string' },
      garbageItemId: { type: 'string' },
      quantity: { type: 'number' },
    },
    /** A recipe's explicit garbage output. LITERAL quantities — unlike
     * itemSalvage these are not scaled by CRAFT_GARBAGE_RATIO. v14 only. */
    recipeGarbage: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      recipeId: { type: 'string' },
      garbageItemId: { type: 'string' },
      quantity: { type: 'number' },
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
      isCustom: { type: 'boolean', default: false },
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
    recipeUnlocks: {
      id: { type: 'string' },
      datasetId: { type: 'string' },
      recipeId: { type: 'string' },
      talentId: { type: 'string' },
    },
  })

  return store
}

/** A `pluginModules` row as it existed before v14, keyed by row id. */
interface LegacyPluginModuleRow {
  pluginType: string
  percent: number
  skillId: string
  skillPercent: number
}

/**
 * Read the pre-v14 `pluginModules` cells straight out of IndexedDB.
 *
 * 🛑 Bare `createStore()`, no schema, and it MUST run before the real store
 * loads — for the same reason as `readLegacyPluginModuleIds` in build-store.ts.
 * `createGameDataStore()` applies its schema at construction, and TinyBase
 * enforces schemas destructively, so by the time `persister.load()` returns,
 * `pluginType` / `percent` / `skillId` / `skillPercent` are already gone.
 *
 * Without this, an existing user who had already imported a dataset would come
 * back to a store where every module row survives but carries NO bonuses at all
 * (the `pluginModuleBonuses` rows never existed for them). Every installed
 * upgrade module would silently apply a 0% discount and every affected price
 * would be wrong, with no error anywhere.
 */
async function readLegacyPluginModules(): Promise<Map<string, LegacyPluginModuleRow>> {
  if (typeof indexedDB === 'undefined') return new Map()
  const out = new Map<string, LegacyPluginModuleRow>()
  const probe = createStore()
  const probePersister = createIndexedDbPersister(probe, 'eco-crafter-game-data')
  try {
    await probePersister.load()
    for (const rowId of probe.getRowIds('pluginModules')) {
      const pluginType = probe.getCell('pluginModules', rowId, 'pluginType')
      const percent = probe.getCell('pluginModules', rowId, 'percent')
      // A row with neither cell is already migrated (or v14-shaped); skip it so
      // this is self-disarming and therefore idempotent.
      if (typeof pluginType !== 'string' && typeof percent !== 'number') continue
      out.set(rowId, {
        pluginType: typeof pluginType === 'string' ? pluginType : '',
        percent: typeof percent === 'number' ? percent : 1,
        skillId: (probe.getCell('pluginModules', rowId, 'skillId') as string) ?? '',
        skillPercent: (probe.getCell('pluginModules', rowId, 'skillPercent') as number) ?? 0,
      })
    }
  } catch {
    return new Map()
  } finally {
    await probePersister.destroy()
  }
  return out
}

/**
 * Rebuild `pluginModuleBonuses` for datasets that were imported before the
 * unified module schema existed.
 *
 * Runs the SAME `legacyModuleBonuses` mapping the importer uses, so an
 * already-installed v11–v13 dataset prices identically to a freshly imported
 * one. Module row **ids are preserved** — re-importing instead would mint new
 * ids and orphan every build's `userCraftingTables.*ModuleId` reference.
 *
 * The legacy `skillId` cell already holds a resolved skill row id (the original
 * import did the name lookup), so it goes straight into `skillIds`.
 */
function migrateLegacyPluginModules(
  store: Store,
  legacy: Map<string, LegacyPluginModuleRow>
): number {
  if (legacy.size === 0) return 0

  // Any module that already has bonus rows has been migrated; leave it alone.
  const modulesWithBonuses = new Set<string>()
  for (const bId of store.getRowIds('pluginModuleBonuses')) {
    modulesWithBonuses.add(store.getCell('pluginModuleBonuses', bId, 'pluginModuleId') as string)
  }

  let written = 0
  store.transaction(() => {
    for (const [moduleId, row] of legacy) {
      if (!store.hasRow('pluginModules', moduleId)) continue
      if (modulesWithBonuses.has(moduleId)) continue
      const datasetId = store.getCell('pluginModules', moduleId, 'datasetId') as string
      const bonuses = legacyModuleBonuses(
        row.pluginType,
        row.percent,
        row.skillId || undefined,
        row.skillPercent
      )
      bonuses.forEach((b, idx) => {
        const id = `${moduleId}:mig:${idx}`
        store.setRow('pluginModuleBonuses', id, {
          id,
          datasetId,
          pluginModuleId: moduleId,
          bonusIndex: idx,
          action: b.action,
          effectType: b.effectType,
          value: b.value,
          skillIds: JSON.stringify(b.skillTypes),
        })
        written++
      })
    }
  })
  return written
}

export async function createPersistedGameDataStore() {
  // Must happen before the schema'd store below is constructed and loaded.
  const legacyModules = await readLegacyPluginModules()

  const store = createGameDataStore()
  const persister = createIndexedDbPersister(store, 'eco-crafter-game-data')
  // See note in build-store.ts: startAutoLoad() polls IndexedDB on a
  // setInterval. The game-data store is the largest one (~60k rows), and
  // each reload was a ~800ms main-thread block — the dominant UI-lag
  // culprit. We only need the one-time initial load here.
  await persister.load()

  // Applied before startAutoSave so the synthesized rows are in the first save.
  migrateLegacyPluginModules(store, legacyModules)

  await persister.startAutoSave()
  return { store, persister }
}
