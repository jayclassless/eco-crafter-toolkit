import type { Store } from 'tinybase'

import { getDatasetIdsByBundledId } from '@/lib/dataset-utils'
import type { DatasetManifest, ManifestEntry } from '@/types/dataset-manifest'

export interface AvailableUpdate {
  entry: ManifestEntry
  datasetId: string
  installedRevision: number
  availableRevision: number
}

export function findAvailableUpdates(
  manifest: DatasetManifest,
  gameDataStore: Store
): AvailableUpdate[] {
  const idsByBundled = getDatasetIdsByBundledId(gameDataStore)
  const updates: AvailableUpdate[] = []
  for (const entry of manifest.datasets) {
    const datasetId = idsByBundled.get(entry.id)
    if (!datasetId) continue
    const installedRevision =
      (gameDataStore.getCell('datasets', datasetId, 'installedRevision') as number) ?? 0
    if (entry.revision > installedRevision) {
      updates.push({
        entry,
        datasetId,
        installedRevision,
        availableRevision: entry.revision,
      })
    }
  }
  return updates
}
