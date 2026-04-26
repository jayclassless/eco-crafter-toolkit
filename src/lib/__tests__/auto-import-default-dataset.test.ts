import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createGameDataStore } from '@/stores/game-data-store'
import { __resetLocalizedNameStore } from '@/stores/localized-name-store'
import type { DatasetJson } from '@/types/dataset-json'

import { autoImportDefaultDataset } from '../auto-import-default-dataset'

const minimalDataset = (): DatasetJson =>
  ({ Version: 1, Skills: [], Items: [], Tags: [], Recipes: [] }) as unknown as DatasetJson

const fetchOf = (manifest: object, dataset: DatasetJson) =>
  vi.fn(async (url: string) => {
    if (url.endsWith('datasets-manifest.json')) {
      return { ok: true, json: async () => manifest }
    }
    return { ok: true, json: async () => dataset }
  })

beforeEach(async () => {
  await __resetLocalizedNameStore()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('autoImportDefaultDataset', () => {
  it('imports the manifest entry whose default flag is true', async () => {
    const manifest = {
      datasets: [
        { id: 'eco-vA', name: 'Eco vA', file: 'a.json', revision: 1, updatedAt: 'x' },
        {
          id: 'eco-vB',
          name: 'Eco vB',
          file: 'b.json',
          revision: 1,
          updatedAt: 'y',
          default: true,
        },
      ],
    }
    vi.stubGlobal('fetch', fetchOf(manifest, minimalDataset()))
    const store = createGameDataStore()
    await autoImportDefaultDataset(store)

    const datasetIds = store.getRowIds('datasets')
    expect(datasetIds).toHaveLength(1)
    expect(store.getCell('datasets', datasetIds[0], 'bundledId')).toBe('eco-vB')
  })

  it('falls back to the first manifest entry when none are flagged default', async () => {
    const manifest = {
      datasets: [
        { id: 'eco-vA', name: 'Eco vA', file: 'a.json', revision: 1, updatedAt: 'x' },
        { id: 'eco-vB', name: 'Eco vB', file: 'b.json', revision: 1, updatedAt: 'y' },
      ],
    }
    vi.stubGlobal('fetch', fetchOf(manifest, minimalDataset()))
    const store = createGameDataStore()
    await autoImportDefaultDataset(store)
    const datasetIds = store.getRowIds('datasets')
    expect(store.getCell('datasets', datasetIds[0], 'bundledId')).toBe('eco-vA')
  })

  it('throws when the manifest has no datasets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ datasets: [] }) }))
    )
    const store = createGameDataStore()
    await expect(autoImportDefaultDataset(store)).rejects.toThrow(/No datasets in manifest/)
  })
})
