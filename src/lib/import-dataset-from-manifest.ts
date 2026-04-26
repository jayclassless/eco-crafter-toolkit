import type { Store } from 'tinybase'

import { createGameDataOps } from '@/hooks/use-game-data'
import { parseDataset, validateDatasetJson } from '@/lib/import-dataset'
import type { DatasetJson } from '@/types/dataset-json'
import type { ManifestEntry } from '@/types/dataset-manifest'

export async function importDatasetFromManifestEntry(
  entry: ManifestEntry,
  gameDataStore: Store
): Promise<string> {
  const dataRes = await fetch(`/data/${entry.file}`)
  if (!dataRes.ok) throw new Error(`Failed to fetch ${entry.file}`)
  const json = (await dataRes.json()) as DatasetJson

  const validation = validateDatasetJson(json)
  if (!validation.valid) throw new Error(validation.errors.join('; '))

  const parsed = parseDataset(json, entry.id)
  const ops = createGameDataOps(gameDataStore)
  return ops.importDataset(parsed, entry.name, entry.id, entry.revision)
}
