import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createGameDataStore } from '@/stores/game-data-store'
import { __resetLocalizedNameStore } from '@/stores/localized-name-store'
import type { DatasetJson } from '@/types/dataset-json'
import type { ManifestEntry } from '@/types/dataset-manifest'

import { importDatasetFromManifestEntry } from '../import-dataset-from-manifest'

function makeMinimalDataset(): DatasetJson {
  return {
    Version: 1,
    Skills: [],
    Items: [],
    Tags: [],
    Recipes: [],
  } as unknown as DatasetJson
}

const entry: ManifestEntry = {
  id: 'eco-vtest',
  name: 'Eco vTest',
  file: 'eco-vtest.json',
  revision: 7,
  updatedAt: '2026-04-01',
}

beforeEach(async () => {
  await __resetLocalizedNameStore()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('importDatasetFromManifestEntry', () => {
  it('imports a dataset row tagged with the manifest entry id as bundledId', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => makeMinimalDataset(),
      }))
    )

    const gameDataStore = createGameDataStore()
    const datasetId = await importDatasetFromManifestEntry(entry, gameDataStore)

    expect(datasetId).toBeTruthy()
    const row = gameDataStore.getRow('datasets', datasetId)
    expect(row.bundledId).toBe('eco-vtest')
    expect(row.name).toBe('Eco vTest')
    expect(row.installedRevision).toBe(7)
  })

  it('throws when the dataset file fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    )
    const gameDataStore = createGameDataStore()
    await expect(importDatasetFromManifestEntry(entry, gameDataStore)).rejects.toThrow(
      /Failed to fetch/
    )
  })

  it('throws when validation fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ Version: 1 }) }))
    )
    const gameDataStore = createGameDataStore()
    await expect(importDatasetFromManifestEntry(entry, gameDataStore)).rejects.toThrow()
  })
})
