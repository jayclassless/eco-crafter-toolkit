import { readFileSync } from 'fs'
import { resolve } from 'path'

import { describe, expect, it } from 'vitest'

import { createGameDataOps } from '@/hooks/use-game-data'
import { getGameDataIndexes } from '@/lib/game-data-indexes'
import { parseDataset } from '@/lib/import-dataset'
import { UNSKILLED_SKILL_ID } from '@/lib/skill-options'
import { createGameDataStore } from '@/stores/game-data-store'
import type { DatasetJson } from '@/types/dataset-json'

import { reachableItemIdsForSkills } from '../housing-optimizer-data'

/**
 * The unlocked-skills constraint, driven end-to-end through the real shipped
 * dataset rather than hand-built fixtures.
 *
 * The reported bug: the Day 0 progression preset offered an Elk Mount, because
 * Hunting was unlocked and Hunting crafts it — while the recipe also needs
 * Composite Lumber and Fabric, from two skills Day 0 does not have. The old
 * filter only ever asked "which skills craft this item", one hop deep.
 */
const DAY0_SKILL_NAMES = [
  'GatheringSkill',
  'MiningSkill',
  'LoggingSkill',
  'CampfireCookingSkill',
  'HuntingSkill',
]

async function loadV14() {
  const data = JSON.parse(
    readFileSync(resolve(__dirname, '../../../../public/data/eco-v14.json'), 'utf-8')
  ) as DatasetJson
  const store = createGameDataStore()
  const datasetId = await createGameDataOps(store).importDataset(parseDataset(data, 'x'), 'Eco v14')
  const idByName = new Map<string, string>()
  for (const rowId of store.getRowIds('items')) {
    idByName.set(store.getCell('items', rowId, 'name') as string, rowId)
  }
  const skillIdByName = new Map<string, string>()
  for (const rowId of store.getRowIds('skills')) {
    skillIdByName.set(store.getCell('skills', rowId, 'name') as string, rowId)
  }
  return { store, datasetId, idByName, skillIdByName }
}

describe('unlocked-skill reachability against the shipped v14 dataset', () => {
  it('excludes an Elk Mount on Day 0 because its ingredients are out of reach', async () => {
    const { store, datasetId, idByName, skillIdByName } = await loadV14()
    const day0 = DAY0_SKILL_NAMES.map((n) => {
      const id = skillIdByName.get(n)
      expect(id, n).toBeDefined()
      return id!
    })

    const reachable = reachableItemIdsForSkills(store, datasetId, [...day0, UNSKILLED_SKILL_ID])!
    expect(reachable).not.toBeNull()

    // The bug, and the two ingredients that cause it.
    expect(reachable.has(idByName.get('ElkMountItem')!)).toBe(false)
    expect(reachable.has(idByName.get('CompositeLumberItem')!)).toBe(false)

    // Still reachable on day 0, so the fix has not simply emptied the pool:
    // logs and plant fibers are gathered, the Workbench needs no skill, and
    // Hewn furniture follows from those.
    for (const name of ['OakLogItem', 'PlantFibersItem', 'WorkbenchItem', 'HewnBenchItem']) {
      expect(reachable.has(idByName.get(name)!), name).toBe(true)
    }
  }, 60_000)

  it('reaches every furnishing once every skill is unlocked', async () => {
    const { store, datasetId, idByName, skillIdByName } = await loadV14()
    // Explicitly selecting all skills must behave like the `null` shortcut, or
    // the End Game preset would score differently from the default config.
    const everySkill = [...skillIdByName.values(), UNSKILLED_SKILL_ID]
    const reachable = reachableItemIdsForSkills(store, datasetId, everySkill)!

    const furnishings = getGameDataIndexes(store).housingItemIdsByDatasetId.get(datasetId) ?? []
    expect(furnishings.length).toBeGreaterThan(400)
    const unreachable = furnishings.filter((id) => !reachable.has(id))
    expect(unreachable).toEqual([])
    expect(reachable.has(idByName.get('ElkMountItem')!)).toBe(true)
  }, 60_000)

  it('treats a null selection as no constraint at all', async () => {
    const { store, datasetId } = await loadV14()
    expect(reachableItemIdsForSkills(store, datasetId, null)).toBeNull()
  }, 60_000)
})
