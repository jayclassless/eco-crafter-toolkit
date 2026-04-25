import type { Store } from 'tinybase'

import { createGameDataOps } from '@/hooks/use-game-data'
import { parseDataset, validateDatasetJson } from '@/lib/import-dataset'
import type { DatasetJson } from '@/types/dataset-json'
import type { DatasetManifest } from '@/types/dataset-manifest'

export async function autoImportDefaultDataset(gameDataStore: Store): Promise<void> {
  const manifestRes = await fetch('/data/datasets-manifest.json')
  if (!manifestRes.ok) throw new Error('Failed to fetch dataset manifest')
  const manifest = (await manifestRes.json()) as DatasetManifest
  const entry = manifest.datasets.find((d) => d.default) ?? manifest.datasets[0]
  if (!entry) throw new Error('No datasets in manifest')

  const dataRes = await fetch(`/data/${entry.file}`)
  if (!dataRes.ok) throw new Error(`Failed to fetch ${entry.file}`)
  const json = (await dataRes.json()) as DatasetJson

  const validation = validateDatasetJson(json)
  if (!validation.valid) throw new Error(validation.errors.join('; '))

  const parsed = parseDataset(json, entry.id)
  const ops = createGameDataOps(gameDataStore)
  await ops.importDataset(parsed, entry.name, entry.id, entry.revision)
}
