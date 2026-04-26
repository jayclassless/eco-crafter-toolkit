import type { Store } from 'tinybase'

export function countBuildsByDataset(buildStore: Store): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const buildId of buildStore.getRowIds('builds')) {
    const datasetId = buildStore.getCell('builds', buildId, 'datasetId') as string
    if (!datasetId) continue
    counts[datasetId] = (counts[datasetId] ?? 0) + 1
  }
  return counts
}

// Maps each dataset's bundledId (the manifest entry id, e.g. "eco-v13") to
// its randomly-generated datasetId in gameDataStore. Datasets without a
// bundledId (custom imports) are excluded. If the same bundledId appears more
// than once (e.g. mid-flight after a failed update), the last-written wins.
export function getDatasetIdsByBundledId(gameDataStore: Store): Map<string, string> {
  const map = new Map<string, string>()
  for (const datasetId of gameDataStore.getRowIds('datasets')) {
    const bundledId = gameDataStore.getCell('datasets', datasetId, 'bundledId') as string
    if (bundledId) map.set(bundledId, datasetId)
  }
  return map
}

export interface InstalledDatasetMatch {
  datasetId: string
  installedRevision: number
}

// Returns every installed dataset row whose bundledId matches. Used by the
// update flow to disambiguate when a previous update failed mid-way and left
// two installs for the same bundledId — the lower-revision one is the
// pre-update state to remap from.
export function findInstalledDatasetsByBundledId(
  gameDataStore: Store,
  bundledId: string
): InstalledDatasetMatch[] {
  const matches: InstalledDatasetMatch[] = []
  for (const datasetId of gameDataStore.getRowIds('datasets')) {
    if (gameDataStore.getCell('datasets', datasetId, 'bundledId') !== bundledId) continue
    const installedRevision =
      (gameDataStore.getCell('datasets', datasetId, 'installedRevision') as number) ?? 0
    matches.push({ datasetId, installedRevision })
  }
  return matches
}
