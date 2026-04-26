export interface ManifestEntry {
  id: string
  name: string
  file: string
  revision: number
  updatedAt: string
  default?: boolean
}

export interface DatasetManifest {
  datasets: ManifestEntry[]
}
