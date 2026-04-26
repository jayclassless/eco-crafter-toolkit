import { describe, expect, it } from 'vitest'

import { createGameDataStore } from '@/stores/game-data-store'
import type { DatasetManifest } from '@/types/dataset-manifest'

import { findAvailableUpdates } from '../find-available-updates'

const manifest: DatasetManifest = {
  datasets: [
    { id: 'eco-v12', name: 'Eco v12', file: 'v12.json', revision: 5, updatedAt: '2026-01-01' },
    { id: 'eco-v13', name: 'Eco v13', file: 'v13.json', revision: 3, updatedAt: '2026-02-01' },
    { id: 'eco-v14', name: 'Eco v14', file: 'v14.json', revision: 1, updatedAt: '2026-03-01' },
  ],
}

function setDataset(
  store: ReturnType<typeof createGameDataStore>,
  rowId: string,
  bundledId: string,
  installedRevision: number
) {
  store.setRow('datasets', rowId, {
    id: rowId,
    name: bundledId,
    version: 1,
    bundledId,
    installedRevision,
    importedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    isCustom: false,
  })
}

describe('findAvailableUpdates', () => {
  it('returns no updates when nothing is installed', () => {
    const store = createGameDataStore()
    expect(findAvailableUpdates(manifest, store)).toEqual([])
  })

  it('returns updates only for datasets at lower revisions than the manifest', () => {
    const store = createGameDataStore()
    setDataset(store, 'd1', 'eco-v12', 4) // upgradeable: 4 -> 5
    setDataset(store, 'd2', 'eco-v13', 3) // already current
    setDataset(store, 'd3', 'eco-v14', 0) // upgradeable: 0 -> 1

    const updates = findAvailableUpdates(manifest, store)
    expect(updates).toHaveLength(2)
    const byBundled = Object.fromEntries(updates.map((u) => [u.entry.id, u]))
    expect(byBundled['eco-v12']).toMatchObject({
      datasetId: 'd1',
      installedRevision: 4,
      availableRevision: 5,
    })
    expect(byBundled['eco-v14']).toMatchObject({
      datasetId: 'd3',
      installedRevision: 0,
      availableRevision: 1,
    })
  })

  it('treats a missing installedRevision as 0 (still upgradeable)', () => {
    const store = createGameDataStore()
    store.setRow('datasets', 'd1', {
      id: 'd1',
      name: 'Eco v14',
      version: 1,
      bundledId: 'eco-v14',
      // omit installedRevision — schema default applies (0)
      importedAt: '2026-01-01',
      updatedAt: '2026-01-01',
      isCustom: false,
    })
    const updates = findAvailableUpdates(manifest, store)
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({ installedRevision: 0, availableRevision: 1 })
  })

  it('ignores datasets that are not in the manifest', () => {
    const store = createGameDataStore()
    setDataset(store, 'd1', 'eco-vghost', 0)
    expect(findAvailableUpdates(manifest, store)).toEqual([])
  })

  it('ignores manifest entries whose installed revision matches', () => {
    const store = createGameDataStore()
    setDataset(store, 'd1', 'eco-v12', 5)
    expect(findAvailableUpdates(manifest, store)).toEqual([])
  })
})
