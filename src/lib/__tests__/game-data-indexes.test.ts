import { beforeEach, describe, expect, it } from 'vitest'

import { createGameDataStore } from '@/stores/game-data-store'

import { clearGameDataIndexesCache, getGameDataIndexes } from '../game-data-indexes'

let store: ReturnType<typeof createGameDataStore>

beforeEach(() => {
  store = createGameDataStore()
  clearGameDataIndexesCache(store)
})

describe('getGameDataIndexes', () => {
  it('caches the same indexes object across repeated calls', () => {
    store.setRow('recipes', 'r1', { id: 'r1', datasetId: 'ds', skillId: '' })
    const first = getGameDataIndexes(store)
    const second = getGameDataIndexes(store)
    expect(second).toBe(first)
  })

  it('invalidates the cache when the store mutates', () => {
    store.setRow('items', 'i1', { id: 'i1', datasetId: 'ds', name: 'Iron' })
    const first = getGameDataIndexes(store)
    // Any mutation on the store should drop the cache so the next call
    // returns a fresh index set. Without this, dataset re-imports would
    // keep stale product/ingredient maps.
    store.setRow('items', 'i2', { id: 'i2', datasetId: 'ds', name: 'Copper' })
    const second = getGameDataIndexes(store)
    expect(second).not.toBe(first)
  })
})

describe('itemIdsByTagId', () => {
  it('groups items by their tagId, preserving row order per tag', () => {
    store.setRow('tagItems', 'ti1', {
      id: 'ti1',
      datasetId: 'ds',
      tagId: 'tag:wood',
      itemId: 'oak',
    })
    store.setRow('tagItems', 'ti2', {
      id: 'ti2',
      datasetId: 'ds',
      tagId: 'tag:wood',
      itemId: 'birch',
    })
    store.setRow('tagItems', 'ti3', {
      id: 'ti3',
      datasetId: 'ds',
      tagId: 'tag:metal',
      itemId: 'iron',
    })
    clearGameDataIndexesCache(store)
    const { itemIdsByTagId } = getGameDataIndexes(store)
    expect(itemIdsByTagId.get('tag:wood')).toEqual(['oak', 'birch'])
    expect(itemIdsByTagId.get('tag:metal')).toEqual(['iron'])
  })

  it('returns undefined for unknown tag ids', () => {
    const { itemIdsByTagId } = getGameDataIndexes(store)
    expect(itemIdsByTagId.get('tag:missing')).toBeUndefined()
  })

  it('is the inverse of tagIdsByItemId for the same input', () => {
    store.setRow('tagItems', 'ti1', {
      id: 'ti1',
      datasetId: 'ds',
      tagId: 'tag:wood',
      itemId: 'oak',
    })
    store.setRow('tagItems', 'ti2', {
      id: 'ti2',
      datasetId: 'ds',
      tagId: 'tag:wood',
      itemId: 'birch',
    })
    store.setRow('tagItems', 'ti3', {
      id: 'ti3',
      datasetId: 'ds',
      tagId: 'tag:fuel',
      itemId: 'oak',
    })
    clearGameDataIndexesCache(store)
    const { itemIdsByTagId, tagIdsByItemId } = getGameDataIndexes(store)
    expect(itemIdsByTagId.get('tag:wood')).toContain('oak')
    expect(tagIdsByItemId.get('oak')).toEqual(expect.arrayContaining(['tag:wood', 'tag:fuel']))
  })
})

describe('productItemIdsByRecipeId & ingredientItemIdsByRecipeId', () => {
  it('bucket recipeElements into product vs ingredient maps keyed by recipe', () => {
    store.setRow('recipeElements', 're1', {
      id: 're1',
      datasetId: 'ds',
      recipeId: 'r1',
      itemOrTagId: 'iron-bar',
      isProduct: true,
      baseQuantity: 1,
      index: 0,
    })
    store.setRow('recipeElements', 're2', {
      id: 're2',
      datasetId: 'ds',
      recipeId: 'r1',
      itemOrTagId: 'iron-ore',
      isProduct: false,
      baseQuantity: 2,
      index: 1,
    })
    clearGameDataIndexesCache(store)
    const { productItemIdsByRecipeId, ingredientItemIdsByRecipeId } = getGameDataIndexes(store)
    expect(productItemIdsByRecipeId.get('r1')).toEqual(['iron-bar'])
    expect(ingredientItemIdsByRecipeId.get('r1')?.has('iron-ore')).toBe(true)
    // Ingredients are a Set so membership checks stay O(1) — the Materials
    // view-model relies on this for the reintegration filter.
    expect(ingredientItemIdsByRecipeId.get('r1')).toBeInstanceOf(Set)
  })
})
