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

  it('setPrice on an existing manual row fires listeners exactly once', () => {
    mgmt().setPrice('item1', 5)
    const id = buildStore.getRowIds('userPrices')[0]
    // Count table-level notifications: the write must be wrapped in a
    // transaction so subscribers (DataTable re-renders, solver trigger)
    // don't see two separate mutation events per keystroke.
    let fires = 0
    const listenerId = buildStore.addTableListener('userPrices', () => {
      fires += 1
    })
    mgmt().setPrice('item1', 7, id)
    buildStore.delListener(listenerId)
    expect(fires).toBe(1)
    expect(buildStore.getCell('userPrices', id, 'price')).toBe(7)
  })

  it('setPrice on an already-manual row skips the redundant priceMode write', () => {
    mgmt().setPrice('item1', 5)
    const id = buildStore.getRowIds('userPrices')[0]
    // Track priceMode cell writes specifically. Re-writing an identical
    // value would still fire cell listeners, so we must skip it.
    let priceModeFires = 0
    const listenerId = buildStore.addCellListener('userPrices', id, 'priceMode', () => {
      priceModeFires += 1
    })
    mgmt().setPrice('item1', 7, id)
    buildStore.delListener(listenerId)
    expect(priceModeFires).toBe(0)
    expect(buildStore.getCell('userPrices', id, 'priceMode')).toBe('manual')
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

  describe('setOverrideAsMaterial', () => {
    it("creates a new row with isOverride=true and priceMode='manual' when none exists", () => {
      mgmt().setOverrideAsMaterial('item1', true)
      const id = buildStore.getRowIds('userPrices')[0]
      const row = buildStore.getRow('userPrices', id)
      expect(row.itemOrTagId).toBe('item1')
      expect(row.isOverride).toBe(true)
      expect(row.priceMode).toBe('manual')
      expect(row.price).toBe(0)
    })

    it('flips isOverride on an existing row without losing the stored price', () => {
      mgmt().setPrice('item1', 17)
      const id = buildStore.getRowIds('userPrices')[0]
      mgmt().setOverrideAsMaterial('item1', true, id)
      expect(buildStore.getCell('userPrices', id, 'isOverride')).toBe(true)
      expect(buildStore.getCell('userPrices', id, 'price')).toBe(17)
      mgmt().setOverrideAsMaterial('item1', false, id)
      expect(buildStore.getCell('userPrices', id, 'isOverride')).toBe(false)
      // Price preserved so re-enabling restores the prior value.
      expect(buildStore.getCell('userPrices', id, 'price')).toBe(17)
    })

    it("forces priceMode to 'manual' when excluding a row that wasn't manual", () => {
      mgmt().setPriceMode('tag1', 'mirror')
      const id = buildStore.getRowIds('userPrices')[0]
      mgmt().setOverrideAsMaterial('tag1', true, id)
      expect(buildStore.getCell('userPrices', id, 'priceMode')).toBe('manual')
      expect(buildStore.getCell('userPrices', id, 'isOverride')).toBe(true)
    })

    it('coalesces the toggle + priceMode write into a single table notification', () => {
      mgmt().setPriceMode('tag1', 'min')
      const id = buildStore.getRowIds('userPrices')[0]
      let fires = 0
      const listenerId = buildStore.addTableListener('userPrices', () => {
        fires += 1
      })
      mgmt().setOverrideAsMaterial('tag1', true, id)
      buildStore.delListener(listenerId)
      expect(fires).toBe(1)
    })

    it('does not touch priceMode when un-excluding', () => {
      mgmt().setOverrideAsMaterial('item1', true)
      const id = buildStore.getRowIds('userPrices')[0]
      let priceModeFires = 0
      const listenerId = buildStore.addCellListener('userPrices', id, 'priceMode', () => {
        priceModeFires += 1
      })
      mgmt().setOverrideAsMaterial('item1', false, id)
      buildStore.delListener(listenerId)
      expect(priceModeFires).toBe(0)
    })
  })
})
