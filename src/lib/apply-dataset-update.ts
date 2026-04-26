import type { Store } from 'tinybase'

import { createGameDataOps } from '@/hooks/use-game-data'
import { findInstalledDatasetsByBundledId } from '@/lib/dataset-utils'
import { importDatasetFromManifestEntry } from '@/lib/import-dataset-from-manifest'
import type { ManifestEntry } from '@/types/dataset-manifest'

export class DatasetNotInstalledError extends Error {
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
  const craftingTables = new Map<string, string>()
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
  }
  for (const id of store.getRowIds('craftingTables')) {
    if (store.getCell('craftingTables', id, 'datasetId') !== datasetId) continue
    const name = store.getCell('craftingTables', id, 'name') as string
    craftingTables.set(name, id)
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

  return { skills, talents, items, craftingTables, pluginModules, recipes }
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

    remapField('userSkills', 'skillId', remap.skills)
    remapField('userTalents', 'talentId', remap.talents)
    remapField('userCraftingTables', 'craftingTableId', remap.craftingTables)
    remapField('userCraftingTables', 'pluginModuleId', remap.pluginModules)
    remapField('userRecipes', 'recipeId', remap.recipes)
    remapField('userPrices', 'itemOrTagId', remap.items)
    remapField('userPrices', 'primaryItemId', remap.items)
    remapField('userProductMargins', 'itemOrTagId', remap.items)
    remapField('userProductShares', 'productItemOrTagId', remap.items)
    remapField('hiddenSkills', 'skillId', remap.skills)
    remapField('hiddenCraftingTables', 'craftingTableId', remap.craftingTables)
    remapField('hiddenTags', 'tagId', remap.items)
    remapField('computedPrices', 'itemOrTagId', remap.items)
    remapField('computedPrices', 'recipeId', remap.recipes)
  })
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

  sweepBuildStore(buildStore, oldId, newId, remap)

  if (uiStore.getCell('uiState', 'main', 'activeDatasetId') === oldId) {
    uiStore.setCell('uiState', 'main', 'activeDatasetId', newId)
  }

  const ops = createGameDataOps(gameDataStore)
  await ops.deleteDataset(oldId)

  return { datasetId: newId }
}
