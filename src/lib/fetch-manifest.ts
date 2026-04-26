import type { DatasetManifest } from '@/types/dataset-manifest'

export async function fetchDatasetManifest(): Promise<DatasetManifest> {
  const res = await fetch('/data/datasets-manifest.json')
  if (!res.ok) throw new Error('Failed to fetch dataset manifest')
  return (await res.json()) as DatasetManifest
}
