export interface ManifestEntry {
  id: string
  name: string
  file: string
  revision: number
  default?: boolean
}

export interface DatasetManifest {
  datasets: ManifestEntry[]
}
