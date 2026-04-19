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
})
