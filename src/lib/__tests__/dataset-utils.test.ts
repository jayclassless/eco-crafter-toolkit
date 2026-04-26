import { describe, expect, it } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'

import { countBuildsByDataset, getDatasetIdsByBundledId } from '../dataset-utils'

describe('countBuildsByDataset', () => {
  it('returns an empty map when there are no builds', () => {
    const buildStore = createBuildStore()
    expect(countBuildsByDataset(buildStore)).toEqual({})
  })

  it('counts builds grouped by datasetId', () => {
    const buildStore = createBuildStore()
    buildStore.setRow('builds', 'b1', {
      id: 'b1',
      datasetId: 'ds1',
      name: 'A',
      createdAt: '2026-01-01',
    })
    buildStore.setRow('builds', 'b2', {
      id: 'b2',
      datasetId: 'ds1',
      name: 'B',
      createdAt: '2026-01-01',
    })
    buildStore.setRow('builds', 'b3', {
      id: 'b3',
      datasetId: 'ds2',
      name: 'C',
      createdAt: '2026-01-01',
    })
    expect(countBuildsByDataset(buildStore)).toEqual({ ds1: 2, ds2: 1 })
  })
})

describe('getDatasetIdsByBundledId', () => {
  it('maps bundledId to datasetId for bundled datasets only', () => {
    const gameDataStore = createGameDataStore()
    gameDataStore.setRow('datasets', 'ds1', {
      id: 'ds1',
      name: 'Eco v13',
      version: 1,
      bundledId: 'eco-v13',
      installedRevision: 1,
      importedAt: '2026-01-01',
      updatedAt: '2026-01-01',
      isCustom: false,
    })
    gameDataStore.setRow('datasets', 'ds2', {
      id: 'ds2',
      name: 'My Custom',
      version: 1,
      bundledId: '',
      installedRevision: 0,
      importedAt: '2026-01-01',
      updatedAt: '2026-01-01',
      isCustom: true,
    })

    const map = getDatasetIdsByBundledId(gameDataStore)
    expect(map.get('eco-v13')).toBe('ds1')
    expect(map.size).toBe(1)
  })

  it('returns an empty map when there are no datasets', () => {
    const gameDataStore = createGameDataStore()
    expect(getDatasetIdsByBundledId(gameDataStore).size).toBe(0)
  })
})
