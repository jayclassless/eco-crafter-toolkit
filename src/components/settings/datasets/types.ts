import type { ManifestEntry } from '@/types/dataset-manifest'

export type DatasetRow = {
  manifestId: string
  name: string
  updatedAt: string
  loadedDatasetId: string | null
  isActive: boolean
  buildCount: number
  customItemCount: number
  customRecipeCount: number
  // Set when the manifest's revision is greater than the installed revision;
  // surfaces the per-row "Update Now" affordance.
  availableRevision?: number
  entry: ManifestEntry
}
