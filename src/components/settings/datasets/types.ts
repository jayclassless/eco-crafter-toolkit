import type { ManifestEntry } from '@/types/dataset-manifest'

export type DatasetRow = {
  manifestId: string
  name: string
  updatedAt: string
  loadedDatasetId: string | null
  isActive: boolean
  buildCount: number
  entry: ManifestEntry
}
