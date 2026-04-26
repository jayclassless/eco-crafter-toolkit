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
// bundledId (custom imports) are excluded.
export function getDatasetIdsByBundledId(gameDataStore: Store): Map<string, string> {
  const map = new Map<string, string>()
  for (const datasetId of gameDataStore.getRowIds('datasets')) {
    const bundledId = gameDataStore.getCell('datasets', datasetId, 'bundledId') as string
    if (bundledId) map.set(bundledId, datasetId)
  }
  return map
}
