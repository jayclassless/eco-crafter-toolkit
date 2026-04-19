import type { Store } from 'tinybase'
import { describe, it, expect, beforeEach } from 'vitest'

import { createBuildStore } from '@/stores/build-store'

import { createCraftingTableManagement } from '../use-crafting-table-management'

const BUILD_ID = 'build1'
let buildStore: Store

beforeEach(() => {
  buildStore = createBuildStore()
})

const mgmt = () => createCraftingTableManagement(buildStore, BUILD_ID)

describe('createCraftingTableManagement', () => {
  it('addTable creates a row with defaults', () => {
    const id = mgmt().addTable('ct1')
    const row = buildStore.getRow('userCraftingTables', id)
    expect(row.craftingTableId).toBe('ct1')
    expect(row.buildId).toBe(BUILD_ID)
    expect(row.pluginModuleId).toBe('')
    expect(row.costPerMinute).toBe(0)
  })

  it('setPluginModule and setCostPerMinute update the row', () => {
    const id = mgmt().addTable('ct1')
    mgmt().setPluginModule(id, 'pm1')
    mgmt().setCostPerMinute(id, 2.5)
    expect(buildStore.getCell('userCraftingTables', id, 'pluginModuleId')).toBe('pm1')
    expect(buildStore.getCell('userCraftingTables', id, 'costPerMinute')).toBe(2.5)
  })

  it('removeTable deletes the row', () => {
    const id = mgmt().addTable('ct1')
    mgmt().removeTable(id)
    expect(buildStore.getRowIds('userCraftingTables')).toHaveLength(0)
  })
})
