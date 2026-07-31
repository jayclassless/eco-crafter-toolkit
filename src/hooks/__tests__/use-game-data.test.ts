import { describe, it, expect, beforeEach, vi } from 'vitest'

import type { ParsedDataset } from '@/lib/import-dataset'
import { StorageQuotaError } from '@/lib/storage-quota'
import { createGameDataStore } from '@/stores/game-data-store'
import * as localizedNameStore from '@/stores/localized-name-store'
import { __resetLocalizedNameStore, loadIndex } from '@/stores/localized-name-store'

import { createGameDataOps } from '../use-game-data'

let store: ReturnType<typeof createGameDataStore>

const emptyParsed = (): ParsedDataset => ({
  skills: [],
  talents: [],
  talentBonuses: [],
  items: [],
  itemParts: [],
  tagItems: [],
  craftingTables: [],
  pluginModules: [],
  craftingTablePluginModules: [],
  recipes: [],
  recipeElements: [],
  modifiers: [],
  recipeUnlocks: [],
  gatheringTools: [],
  treeSpecies: [],
  localizedNames: [],
})

async function deleteDb(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('eco-crafter-localized-names')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  store = createGameDataStore()
  await __resetLocalizedNameStore()
  await deleteDb()
})

describe('createGameDataOps', () => {
  describe('importDataset', () => {
    it('creates a dataset row marked custom when no bundledId', async () => {
      const ops = createGameDataOps(store)
      const id = await ops.importDataset(emptyParsed(), 'My Set')
      const row = store.getRow('datasets', id)
      expect(row.name).toBe('My Set')
      expect(row.bundledId).toBe('')
      expect(row.installedRevision).toBe(0)
      expect(row.isCustom).toBe(true)
    })

    it('marks dataset as bundled when bundledId provided', async () => {
      const ops = createGameDataOps(store)
      const id = await ops.importDataset(emptyParsed(), 'Bundled', 'b1', 5)
      const row = store.getRow('datasets', id)
      expect(row.bundledId).toBe('b1')
      expect(row.installedRevision).toBe(5)
      expect(row.isCustom).toBe(false)
    })

    it('imports skills with serialized laborReducePercent and datasetId', async () => {
      const ops = createGameDataOps(store)
      const parsed = emptyParsed()
      parsed.skills.push({
        id: 's1',
        name: 'Mining',
        profession: '',
        maxLevel: 7,
        laborReducePercent: [1, 0.9],
      } as ParsedDataset['skills'][number])
      const id = await ops.importDataset(parsed, 'X')
      const row = store.getRow('skills', 's1')
      expect(row.datasetId).toBe(id)
      expect(row.laborReducePercent).toBe('[1,0.9]')
    })

    it('imports plugin modules with default skill fields', async () => {
      const ops = createGameDataOps(store)
      const parsed = emptyParsed()
      parsed.pluginModules.push({
        id: 'pm1',
        name: 'Mod',
        percent: 0.5,
      } as ParsedDataset['pluginModules'][number])
      await ops.importDataset(parsed, 'X')
      const row = store.getRow('pluginModules', 'pm1')
      expect(row.skillId).toBe('')
      expect(row.skillPercent).toBe(0)
    })

    it('imports items, tagItems, craftingTables, and recipeElements with the dataset id', async () => {
      const ops = createGameDataOps(store)
      const parsed = emptyParsed()
      parsed.items.push({ id: 'i1', name: 'Iron', isTag: false } as ParsedDataset['items'][number])
      parsed.tagItems.push({
        id: 'ti1',
        tagId: 'metal',
        itemId: 'i1',
      } as ParsedDataset['tagItems'][number])
      parsed.craftingTables.push({
        id: 'ct1',
        name: 'Anvil',
      } as ParsedDataset['craftingTables'][number])
      parsed.talents.push({
        id: 't1',
        skillId: 's1',
        name: 'X',
        talentGroupName: 'g',
        value: 1,
        level: 1,
      } as ParsedDataset['talents'][number])
      parsed.recipeElements.push({
        id: 're1',
        recipeId: 'r1',
        itemOrTagId: 'i1',
        baseQuantity: 1,
        isProduct: true,
        index: 0,
      } as ParsedDataset['recipeElements'][number])
      const id = await ops.importDataset(parsed, 'X')
      expect(store.getCell('items', 'i1', 'datasetId')).toBe(id)
      expect(store.getCell('tagItems', 'ti1', 'datasetId')).toBe(id)
      expect(store.getCell('craftingTables', 'ct1', 'datasetId')).toBe(id)
      expect(store.getCell('talents', 't1', 'datasetId')).toBe(id)
      expect(store.getCell('recipeElements', 're1', 'datasetId')).toBe(id)
    })

    it('imports modifiers into tinybase and routes localized names to the IDB store', async () => {
      const ops = createGameDataOps(store)
      const parsed = emptyParsed()
      parsed.modifiers.push({
        id: 'mod1',
        targetType: 'craftMinutes',
        targetId: 'r1',
        dynamicType: 'skill',
        refName: 'Mining',
      } as unknown as ParsedDataset['modifiers'][number])
      parsed.localizedNames.push({
        id: 'ln1',
        entityType: 'item',
        entityId: 'iron',
        locale: 'en-US',
        name: 'Iron',
      } as ParsedDataset['localizedNames'][number])
      const datasetId = await ops.importDataset(parsed, 'X')
      expect(store.getCell('modifiers', 'mod1', 'datasetId')).toBe(datasetId)

      const idx = await loadIndex(datasetId, 'en-US')
      expect(idx.get('item:iron')).toBe('Iron')
    })

    it('imports recipes defaulting skillId when missing', async () => {
      const ops = createGameDataOps(store)
      const parsed = emptyParsed()
      parsed.recipes.push({
        id: 'r1',
        name: 'R',
        craftingTableId: 'ct1',
        baseCraftTime: 1,
        baseLaborCost: 1,
      } as ParsedDataset['recipes'][number])
      await ops.importDataset(parsed, 'X')
      expect(store.getCell('recipes', 'r1', 'skillId')).toBe('')
    })

    it('writes all rows in a single transaction', async () => {
      // Each finished transaction triggers a full-store save in the IDB
      // persister, so an unwrapped import would issue thousands of saves.
      const ops = createGameDataOps(store)
      const parsed = emptyParsed()
      for (let i = 0; i < 50; i++) {
        parsed.skills.push({
          id: `s${i}`,
          name: `Skill ${i}`,
          profession: '',
          maxLevel: 7,
          laborReducePercent: [1],
        } as ParsedDataset['skills'][number])
        parsed.items.push({
          id: `i${i}`,
          name: `Item ${i}`,
          isTag: false,
        } as ParsedDataset['items'][number])
        parsed.recipes.push({
          id: `r${i}`,
          name: `R${i}`,
          craftingTableId: 'ct1',
          baseCraftTime: 1,
          baseLaborCost: 1,
        } as ParsedDataset['recipes'][number])
      }
      let transactions = 0
      store.addDidFinishTransactionListener(() => {
        transactions++
      })
      await ops.importDataset(parsed, 'Big')
      expect(transactions).toBe(1)
    })
  })

  describe('getDatasets', () => {
    it('returns rows for all datasets', async () => {
      const ops = createGameDataOps(store)
      await ops.importDataset(emptyParsed(), 'A')
      await ops.importDataset(emptyParsed(), 'B')
      expect(ops.getDatasets()).toHaveLength(2)
    })
  })

  describe('importDataset quota handling', () => {
    it('rethrows as StorageQuotaError and rolls back the in-memory store when localized-name save quota-fails', async () => {
      const ops = createGameDataOps(store)
      const parsed = emptyParsed()
      parsed.skills.push({
        id: 's1',
        name: 'Mining',
        profession: '',
        maxLevel: 7,
        laborReducePercent: [1, 0.9],
      } as ParsedDataset['skills'][number])
      parsed.items.push({
        id: 'i1',
        name: 'Iron',
        isTag: false,
      } as ParsedDataset['items'][number])

      const spy = vi
        .spyOn(localizedNameStore, 'saveLocalizedNames')
        .mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'))

      await expect(ops.importDataset(parsed, 'X')).rejects.toBeInstanceOf(StorageQuotaError)

      // Rollback: no dataset, skill, or item rows for the failed import.
      expect(store.getRowIds('datasets')).toHaveLength(0)
      expect(store.getRow('skills', 's1')).toEqual({})
      expect(store.getRow('items', 'i1')).toEqual({})

      spy.mockRestore()
    })

    it('rethrows non-quota errors verbatim without wrapping', async () => {
      const ops = createGameDataOps(store)
      const generic = new Error('disk read failed')
      const spy = vi.spyOn(localizedNameStore, 'saveLocalizedNames').mockRejectedValueOnce(generic)

      await expect(ops.importDataset(emptyParsed(), 'X')).rejects.toBe(generic)
      spy.mockRestore()
    })
  })

  describe('deleteDataset', () => {
    it('removes the dataset row, its scoped child rows, and its localized names', async () => {
      const ops = createGameDataOps(store)
      const parsedA = emptyParsed()
      parsedA.localizedNames.push({
        id: 'ln-a',
        entityType: 'item',
        entityId: 'iron',
        locale: 'en-US',
        name: 'Iron (A)',
      } as ParsedDataset['localizedNames'][number])
      const parsedB = emptyParsed()
      parsedB.localizedNames.push({
        id: 'ln-b',
        entityType: 'item',
        entityId: 'iron',
        locale: 'en-US',
        name: 'Iron (B)',
      } as ParsedDataset['localizedNames'][number])

      const a = await ops.importDataset(parsedA, 'A')
      const b = await ops.importDataset(parsedB, 'B')

      store.setRow('items', 'i-a', { id: 'i-a', datasetId: a, name: 'A1' })
      store.setRow('items', 'i-b', { id: 'i-b', datasetId: b, name: 'B1' })

      await ops.deleteDataset(a)

      expect(store.getRow('datasets', a)).toEqual({})
      expect(store.getRow('datasets', b).name).toBe('B')
      expect(store.getRow('items', 'i-a')).toEqual({})
      expect(store.getRow('items', 'i-b').name).toBe('B1')

      const goneIdx = await loadIndex(a, 'en-US')
      expect(goneIdx.size).toBe(0)
      const keptIdx = await loadIndex(b, 'en-US')
      expect(keptIdx.get('item:iron')).toBe('Iron (B)')
    })

    it('deletes scoped rows in a single transaction', async () => {
      const ops = createGameDataOps(store)
      const parsed = emptyParsed()
      for (let i = 0; i < 30; i++) {
        parsed.items.push({
          id: `i${i}`,
          name: `Item ${i}`,
          isTag: false,
        } as ParsedDataset['items'][number])
        parsed.recipes.push({
          id: `r${i}`,
          name: `R${i}`,
          craftingTableId: 'ct1',
          baseCraftTime: 1,
          baseLaborCost: 1,
        } as ParsedDataset['recipes'][number])
      }
      const a = await ops.importDataset(parsed, 'A')

      let transactions = 0
      store.addDidFinishTransactionListener(() => {
        transactions++
      })
      await ops.deleteDataset(a)
      expect(transactions).toBe(1)
    })
  })
})
