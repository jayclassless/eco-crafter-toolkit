import type { Store } from 'tinybase'

import { fetchDatasetManifest } from '@/lib/fetch-manifest'
import { importDatasetFromManifestEntry } from '@/lib/import-dataset-from-manifest'

export async function autoImportDefaultDataset(gameDataStore: Store): Promise<void> {
  const manifest = await fetchDatasetManifest()
  const entry = manifest.datasets.find((d) => d.default) ?? manifest.datasets[0]
  if (!entry) throw new Error('No datasets in manifest')
  await importDatasetFromManifestEntry(entry, gameDataStore)
}
