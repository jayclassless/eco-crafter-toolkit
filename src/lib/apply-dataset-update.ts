import type { Store } from 'tinybase'

import { createGameDataOps } from '@/hooks/use-game-data'
import { findInstalledDatasetsByBundledId } from '@/lib/dataset-utils'
import { importDatasetFromManifestEntry } from '@/lib/import-dataset-from-manifest'
import { MODULE_SLOT_CELL_LIST } from '@/lib/module-slots'
import { readLocalizedNamesForEntity, upsertLocalizedNames } from '@/stores/localized-name-store'
import type { ManifestEntry } from '@/types/dataset-manifest'

class DatasetNotInstalledError extends Error {
  constructor(bundledId: string) {
    super(`Dataset "${bundledId}" is not installed`)
    this.name = 'DatasetNotInstalledError'
  }
}

interface NameIdMaps {
  skills: Map<string, string>
  talents: Map<string, string>
  items: Map<string, string>
  craftingTables: Map<string, string>
  pluginModules: Map<string, string>
  recipes: Map<string, string>
  /** Reverse lookups for the migration step (id → name in OLD dataset). */
  itemNameById: Map<string, string>
  skillNameById: Map<string, string>
  craftingTableNameById: Map<string, string>
}

interface Remap {
  skills: Map<string, string>
  talents: Map<string, string>
  items: Map<string, string>
  craftingTables: Map<string, string>
  pluginModules: Map<string, string>
  recipes: Map<string, string>
}

function buildNameIdMaps(store: Store, datasetId: string): NameIdMaps {
  const skills = new Map<string, string>()
  const skillNameById = new Map<string, string>()
  const talents = new Map<string, string>()
  const items = new Map<string, string>()
  const itemNameById = new Map<string, string>()
  const craftingTables = new Map<string, string>()
  const craftingTableNameById = new Map<string, string>()
  const pluginModules = new Map<string, string>()
  const recipes = new Map<string, string>()

  for (const id of store.getRowIds('skills')) {
    if (store.getCell('skills', id, 'datasetId') !== datasetId) continue
    const name = store.getCell('skills', id, 'name') as string
    skills.set(name, id)
    skillNameById.set(id, name)
  }
  // Talent names aren't unique across skills (e.g. each skill has its own
  // "specialty" talents), so the natural key is (skill, talent name).
  for (const id of store.getRowIds('talents')) {
    if (store.getCell('talents', id, 'datasetId') !== datasetId) continue
    const skillId = store.getCell('talents', id, 'skillId') as string
    const skillName = skillNameById.get(skillId)
    if (!skillName) continue
    const talentName = store.getCell('talents', id, 'name') as string
    talents.set(`${skillName}::${talentName}`, id)
  }
  for (const id of store.getRowIds('items')) {
    if (store.getCell('items', id, 'datasetId') !== datasetId) continue
    const name = store.getCell('items', id, 'name') as string
    items.set(name, id)
    itemNameById.set(id, name)
  }
  for (const id of store.getRowIds('craftingTables')) {
    if (store.getCell('craftingTables', id, 'datasetId') !== datasetId) continue
    const name = store.getCell('craftingTables', id, 'name') as string
    craftingTables.set(name, id)
    craftingTableNameById.set(id, name)
  }
  for (const id of store.getRowIds('pluginModules')) {
    if (store.getCell('pluginModules', id, 'datasetId') !== datasetId) continue
    const name = store.getCell('pluginModules', id, 'name') as string
    pluginModules.set(name, id)
  }
  for (const id of store.getRowIds('recipes')) {
    if (store.getCell('recipes', id, 'datasetId') !== datasetId) continue
    const name = store.getCell('recipes', id, 'name') as string
    recipes.set(name, id)
  }

  return {
    skills,
    talents,
    items,
    craftingTables,
    pluginModules,
    recipes,
    itemNameById,
    skillNameById,
    craftingTableNameById,
  }
}

function composeRemap(oldMaps: NameIdMaps, newMaps: NameIdMaps): Remap {
  const remapEntity = (key: keyof NameIdMaps): Map<string, string> => {
    const out = new Map<string, string>()
    for (const [name, oldId] of oldMaps[key]) {
      const newId = newMaps[key].get(name)
      if (newId) out.set(oldId, newId)
    }
    return out
  }
  return {
    skills: remapEntity('skills'),
    talents: remapEntity('talents'),
    items: remapEntity('items'),
    craftingTables: remapEntity('craftingTables'),
    pluginModules: remapEntity('pluginModules'),
    recipes: remapEntity('recipes'),
  }
}

function sweepBuildStore(
  buildStore: Store,
  oldDatasetId: string,
  newDatasetId: string,
  remap: Remap
): void {
  buildStore.transaction(() => {
    const buildIds = new Set<string>()
    for (const buildId of buildStore.getRowIds('builds')) {
      if (buildStore.getCell('builds', buildId, 'datasetId') === oldDatasetId) {
        buildIds.add(buildId)
        buildStore.setCell('builds', buildId, 'datasetId', newDatasetId)
      }
    }

    if (buildIds.size === 0) return

    const remapField = (table: string, field: string, m: Map<string, string>): void => {
      for (const rowId of buildStore.getRowIds(table)) {
        const buildId = buildStore.getCell(table, rowId, 'buildId') as string
        if (!buildIds.has(buildId)) continue
        const oldVal = buildStore.getCell(table, rowId, field) as string
        if (!oldVal) continue
        const newVal = m.get(oldVal)
        if (newVal && newVal !== oldVal) {
          buildStore.setCell(table, rowId, field, newVal)
        }
      }
    }

    // Every buildStore column holding a game-data row id must be listed here —
    // a missing entry silently orphans that reference on the next update, since
    // the old dataset (and its ids) are purged straight after this sweep.
    remapField('userSkills', 'skillId', remap.skills)
    remapField('userTalents', 'talentId', remap.talents)
    remapField('userCraftingTables', 'craftingTableId', remap.craftingTables)
    // All four module slots, or a dataset update silently drops whichever
    // upgrades the user had installed in the unlisted ones.
    for (const cell of MODULE_SLOT_CELL_LIST) {
      remapField('userCraftingTables', cell, remap.pluginModules)
    }
    remapField('userRecipes', 'recipeId', remap.recipes)
    remapField('userPrices', 'itemOrTagId', remap.items)
    remapField('userPrices', 'primaryItemId', remap.items)
    remapField('userProductMargins', 'itemOrTagId', remap.items)
    remapField('userProductShares', 'productItemOrTagId', remap.items)
    remapField('userReintegratedProducts', 'productItemOrTagId', remap.items)
    remapField('userPlantings', 'cropItemId', remap.items)
    remapField('hiddenSkills', 'skillId', remap.skills)
    remapField('hiddenCraftingTables', 'craftingTableId', remap.craftingTables)
    remapField('hiddenTags', 'tagId', remap.items)
    remapField('computedPrices', 'itemOrTagId', remap.items)
    remapField('computedPrices', 'recipeId', remap.recipes)
  })
}

/**
 * Move a dataset's custom items, custom recipes, their recipeElements, and
 * their modifiers from the old dataset id to the new one. Custom rows must
 * survive the post-update purge of the old dataset, so we retag their
 * `datasetId` cells before that purge runs.
 *
 * UUIDs are preserved across the move so any build references (userPrices,
 * userRecipes, etc.) keep resolving. Cross-references that would otherwise
 * break — a custom recipe's `skillId`/`craftingTableId`, and its
 * recipeElements that point at standard items — get remapped by name to the
 * new dataset's UUIDs. References to other CUSTOM items stay as-is because
 * those custom items get retagged here too.
 */
function migrateCustomEntities(
  store: Store,
  oldId: string,
  newId: string,
  oldMaps: NameIdMaps,
  newMaps: NameIdMaps
): { customItemIds: Set<string>; customRecipeIds: Set<string> } {
  const customItemIds = new Set<string>()
  const customRecipeIds = new Set<string>()

  store.transaction(() => {
    for (const itemId of store.getRowIds('items')) {
      if (store.getCell('items', itemId, 'datasetId') !== oldId) continue
      if (!store.getCell('items', itemId, 'isCustom')) continue
      customItemIds.add(itemId)
      store.setCell('items', itemId, 'datasetId', newId)
    }

    for (const recipeId of store.getRowIds('recipes')) {
      if (store.getCell('recipes', recipeId, 'datasetId') !== oldId) continue
      if (!store.getCell('recipes', recipeId, 'isCustom')) continue
      customRecipeIds.add(recipeId)
      store.setCell('recipes', recipeId, 'datasetId', newId)
      const oldSkillId = store.getCell('recipes', recipeId, 'skillId') as string
      if (oldSkillId) {
        const skillName = oldMaps.skillNameById.get(oldSkillId)
        const remappedSkillId = skillName ? (newMaps.skills.get(skillName) ?? '') : ''
        store.setCell('recipes', recipeId, 'skillId', remappedSkillId)
      }
      const oldCtId = store.getCell('recipes', recipeId, 'craftingTableId') as string
      if (oldCtId) {
        const ctName = oldMaps.craftingTableNameById.get(oldCtId)
        const remappedCtId = ctName ? (newMaps.craftingTables.get(ctName) ?? '') : ''
        store.setCell('recipes', recipeId, 'craftingTableId', remappedCtId)
      }
    }

    const elementIdsOfCustomRecipes = new Set<string>()
    for (const elementId of store.getRowIds('recipeElements')) {
      const recipeId = store.getCell('recipeElements', elementId, 'recipeId') as string
      if (!customRecipeIds.has(recipeId)) continue
      elementIdsOfCustomRecipes.add(elementId)
      store.setCell('recipeElements', elementId, 'datasetId', newId)
      const oldItemId = store.getCell('recipeElements', elementId, 'itemOrTagId') as string
      if (!oldItemId) continue
      // Custom-item references keep their UUIDs (already retagged above).
      // Standard-item references get remapped by name; on a name miss
      // (e.g. the new dataset removed the item) leave the dangling old id —
      // the UI already tolerates missing item rows.
      if (customItemIds.has(oldItemId)) continue
      const itemName = oldMaps.itemNameById.get(oldItemId)
      if (!itemName) continue
      const newItemId = newMaps.items.get(itemName)
      if (newItemId) store.setCell('recipeElements', elementId, 'itemOrTagId', newItemId)
    }

    for (const modifierId of store.getRowIds('modifiers')) {
      const targetId = store.getCell('modifiers', modifierId, 'targetId') as string
      if (!customRecipeIds.has(targetId) && !elementIdsOfCustomRecipes.has(targetId)) continue
      store.setCell('modifiers', modifierId, 'datasetId', newId)
    }
  })

  return { customItemIds, customRecipeIds }
}

async function migrateCustomLocalizedNames(
  oldId: string,
  newId: string,
  customItemIds: Set<string>,
  customRecipeIds: Set<string>
): Promise<void> {
  const rows = []
  for (const itemId of customItemIds) {
    const fetched = await readLocalizedNamesForEntity(oldId, 'item', itemId)
    rows.push(...fetched)
  }
  for (const recipeId of customRecipeIds) {
    const fetched = await readLocalizedNamesForEntity(oldId, 'recipe', recipeId)
    rows.push(...fetched)
  }
  if (rows.length === 0) return
  await upsertLocalizedNames(newId, rows)
}

/**
 * Updates an installed bundled dataset to the manifest's revision. Imports the
 * new dataset as a separate row, sweeps every build attached to the old
 * dataset (rewriting entity-id FKs by name match), repoints uiStore's active
 * dataset if needed, then deletes the old dataset.
 *
 * Builds whose entities no longer exist in the new dataset (e.g. an upstream
 * skill rename) keep their original references — those FKs become dangling.
 * Consumers that look up entities by id must already render gracefully when
 * the row is missing.
 */
export async function applyDatasetUpdate(
  entry: ManifestEntry,
  gameDataStore: Store,
  buildStore: Store,
  uiStore: Store
): Promise<{ datasetId: string }> {
  const matches = findInstalledDatasetsByBundledId(gameDataStore, entry.id)
  if (matches.length === 0) throw new DatasetNotInstalledError(entry.id)

  // Disambiguate against a stranded post-import / pre-sweep state from a
  // previously failed attempt: the "old" dataset is the lowest-revision match
  // below the target; an existing match at the target revision is the "new"
  // dataset created by the prior failed attempt.
  const oldCandidates = matches
    .filter((m) => m.installedRevision < entry.revision)
    .sort((a, b) => a.installedRevision - b.installedRevision)
  if (oldCandidates.length === 0) {
    return { datasetId: matches[0].datasetId }
  }
  const oldId = oldCandidates[0].datasetId
  const existingNew = matches.find((m) => m.installedRevision === entry.revision)

  const oldMaps = buildNameIdMaps(gameDataStore, oldId)

  const newId = existingNew
    ? existingNew.datasetId
    : await importDatasetFromManifestEntry(entry, gameDataStore)

  const newMaps = buildNameIdMaps(gameDataStore, newId)
  const remap = composeRemap(oldMaps, newMaps)

  // Migrate custom items/recipes to the new dataset BEFORE the old dataset is
  // purged — otherwise the post-update deleteDataset call would cascade-delete
  // every custom row by datasetId.
  const { customItemIds, customRecipeIds } = migrateCustomEntities(
    gameDataStore,
    oldId,
    newId,
    oldMaps,
    newMaps
  )
  await migrateCustomLocalizedNames(oldId, newId, customItemIds, customRecipeIds)

  sweepBuildStore(buildStore, oldId, newId, remap)

  if (uiStore.getCell('uiState', 'main', 'activeDatasetId') === oldId) {
    uiStore.setCell('uiState', 'main', 'activeDatasetId', newId)
  }

  const ops = createGameDataOps(gameDataStore)
  await ops.deleteDataset(oldId)

  return { datasetId: newId }
}
