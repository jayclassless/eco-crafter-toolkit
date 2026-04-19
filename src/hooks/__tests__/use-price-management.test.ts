import type { Store } from 'tinybase'
import { describe, it, expect, beforeEach } from 'vitest'

import { createBuildStore } from '@/stores/build-store'

import { createPriceManagement } from '../use-price-management'

const BUILD_ID = 'build1'
let buildStore: Store

beforeEach(() => {
  buildStore = createBuildStore()
})

const mgmt = () => createPriceManagement(buildStore, BUILD_ID)

describe('createPriceManagement', () => {
  it('setPrice creates a new row when none exists', () => {
    mgmt().setPrice('item1', 12.5)
    const ids = buildStore.getRowIds('userPrices')
    expect(ids).toHaveLength(1)
    const row = buildStore.getRow('userPrices', ids[0])
    expect(row.itemOrTagId).toBe('item1')
    expect(row.price).toBe(12.5)
    expect(row.isOverride).toBe(false)
  })

  it('setPrice updates an existing row when userPriceId is provided', () => {
    mgmt().setPrice('item1', 5)
    const id = buildStore.getRowIds('userPrices')[0]
    mgmt().setPrice('item1', 9, id)
    expect(buildStore.getCell('userPrices', id, 'price')).toBe(9)
    expect(buildStore.getRowIds('userPrices')).toHaveLength(1)
  })

  it('setPrice normalizes null to 0', () => {
    mgmt().setPrice('item1', null)
    const id = buildStore.getRowIds('userPrices')[0]
    expect(buildStore.getCell('userPrices', id, 'price')).toBe(0)
  })

  it('setPrice normalizes null to 0 on existing rows too', () => {
    mgmt().setPrice('item1', 5)
    const id = buildStore.getRowIds('userPrices')[0]
    mgmt().setPrice('item1', null, id)
    expect(buildStore.getCell('userPrices', id, 'price')).toBe(0)
  })

  it("setPrice forces priceMode to 'manual' on existing rows", () => {
    mgmt().setPriceMode('tag1', 'mirror')
    const id = buildStore.getRowIds('userPrices')[0]
    expect(buildStore.getCell('userPrices', id, 'priceMode')).toBe('mirror')
    mgmt().setPrice('tag1', 7, id)
    expect(buildStore.getCell('userPrices', id, 'priceMode')).toBe('manual')
    expect(buildStore.getCell('userPrices', id, 'price')).toBe(7)
  })

  it("setPrice seeds new rows with priceMode='manual'", () => {
    mgmt().setPrice('item1', 5)
    const id = buildStore.getRowIds('userPrices')[0]
    expect(buildStore.getCell('userPrices', id, 'priceMode')).toBe('manual')
    expect(buildStore.getCell('userPrices', id, 'buildId')).toBe(BUILD_ID)
  })

  describe('setPriceMode', () => {
    it('creates a new row with the given mode and price=0 when none exists', () => {
      mgmt().setPriceMode('tag1', 'avg')
      const id = buildStore.getRowIds('userPrices')[0]
      const row = buildStore.getRow('userPrices', id)
      expect(row.itemOrTagId).toBe('tag1')
      expect(row.priceMode).toBe('avg')
      expect(row.price).toBe(0)
      expect(row.primaryItemId).toBe('')
    })

    it('updates the priceMode on an existing row without touching other fields', () => {
      mgmt().setPrice('tag1', 4)
      const id = buildStore.getRowIds('userPrices')[0]
      mgmt().setPriceMode('tag1', 'min', id)
      expect(buildStore.getCell('userPrices', id, 'priceMode')).toBe('min')
      expect(buildStore.getCell('userPrices', id, 'price')).toBe(4)
    })
  })

  describe('setPrimaryItem', () => {
    it("creates a new row with priceMode='mirror' and the chosen primary item", () => {
      mgmt().setPrimaryItem('tag1', 'item-iron')
      const id = buildStore.getRowIds('userPrices')[0]
      const row = buildStore.getRow('userPrices', id)
      expect(row.itemOrTagId).toBe('tag1')
      expect(row.primaryItemId).toBe('item-iron')
      expect(row.priceMode).toBe('mirror')
      expect(row.price).toBe(0)
    })

    it('updates only the primaryItemId on an existing row', () => {
      mgmt().setPriceMode('tag1', 'mirror')
      const id = buildStore.getRowIds('userPrices')[0]
      mgmt().setPrimaryItem('tag1', 'item-copper', id)
      expect(buildStore.getCell('userPrices', id, 'primaryItemId')).toBe('item-copper')
      expect(buildStore.getCell('userPrices', id, 'priceMode')).toBe('mirror')
    })
  })
})
