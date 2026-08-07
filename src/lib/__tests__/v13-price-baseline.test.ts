import { readFileSync } from 'fs'
import { resolve } from 'path'

import { describe, it, expect } from 'vitest'

import { createGameDataOps } from '@/hooks/use-game-data'
import { buildSolverSnapshot } from '@/hooks/use-solver-snapshot'
import { parseDataset } from '@/lib/import-dataset'
import { solve } from '@/lib/solver'
import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import type { DatasetJson } from '@/types/dataset-json'

const DS = 'ds-v13'
const BUILD = 'b1'

// 🛑 v13 REGRESSION GUARD.
//
// A fixed v13 build solved end-to-end, compared against prices captured from the
// tree BEFORE the v14 module rewrite (commit 12e2526). The normalizer plus
// `moduleFactor` are the only things standing between v11-v13's numbers and the
// new unified module path, and both versions now share one code path — so a
// change that quietly alters legacy pricing has nothing else to trip over.
//
// If this fails, do NOT re-baseline the fixture without establishing that the
// change is intended: the whole point is that v13 prices must not move.
describe('v13 price baseline', () => {
  it('matches the pre-v14-rewrite prices exactly', { timeout: 60_000 }, async () => {
    const data = JSON.parse(
      readFileSync(resolve(__dirname, '../../../public/data/eco-v13.json'), 'utf-8')
    ) as DatasetJson
    const gameDataStore = createGameDataStore()
    const buildStore = createBuildStore()
    // importDataset mints its own datasetId; everything below must use that.
    const dsId = await createGameDataOps(gameDataStore).importDataset(
      parseDataset(data, DS),
      'Eco v13'
    )

    const row = (t: string, id: string, cells: Record<string, unknown>) =>
      buildStore.setRow(t, id, cells as never)

    row('builds', BUILD, { id: BUILD, datasetId: dsId, name: 'Baseline', createdAt: 'x' })
    row('userMargins', 'm1', { id: 'm1', buildId: BUILD, name: 'D', isDefault: true, percent: 0 })
    row('userSettings', 's1', { id: 's1', buildId: BUILD, calorieCost: 0.0001 })

    // Pick skills deterministically by raw name so both trees select the same rows.
    const idByName = new Map<string, string>()
    for (const id of gameDataStore.getRowIds('skills')) {
      idByName.set(gameDataStore.getCell('skills', id, 'name') as string, id)
    }
    const SKILLS = [
      'CarpentrySkill',
      'MasonrySkill',
      'SmeltingSkill',
      'MiningSkill',
      'LoggingSkill',
    ]
    let n = 0
    for (const s of SKILLS) {
      const sid = idByName.get(s)
      if (!sid) continue
      row('userSkills', `us${n++}`, { id: `us${n}`, buildId: BUILD, skillId: sid, level: 7 })
    }

    // Every crafting table that has a module, with the FIRST module installed.
    // Written to both the old and new cell names: whichever the tree's schema
    // doesn't declare is dropped on write, so each reads the one it knows.
    const firstModuleByTable = new Map<string, string>()
    for (const jId of gameDataStore.getRowIds('craftingTablePluginModules')) {
      const j = gameDataStore.getRow('craftingTablePluginModules', jId)
      const ct = j.craftingTableId as string
      if (!firstModuleByTable.has(ct)) firstModuleByTable.set(ct, j.pluginModuleId as string)
    }
    let t = 0
    const tableIds = [...gameDataStore.getRowIds('craftingTables')].sort()
    for (const ctId of tableIds) {
      const pm = firstModuleByTable.get(ctId) ?? ''
      row('userCraftingTables', `uct${t++}`, {
        id: `uct${t}`,
        buildId: BUILD,
        craftingTableId: ctId,
        pluginModuleId: pm,
        specialtyModuleId: pm,
        costPerMinute: 0.05,
      })
    }

    // All default recipes for the selected skills, ordered by raw name.
    const skillIds = new Set(SKILLS.map((s) => idByName.get(s)).filter(Boolean))
    const recipeIds = [...gameDataStore.getRowIds('recipes')]
      .filter((rid) => skillIds.has(gameDataStore.getCell('recipes', rid, 'skillId') as string))
      .sort((a, b) =>
        (gameDataStore.getCell('recipes', a, 'name') as string).localeCompare(
          gameDataStore.getCell('recipes', b, 'name') as string
        )
      )
    let r = 0
    for (const rid of recipeIds) {
      row('userRecipes', `ur${r++}`, {
        id: `ur${r}`,
        buildId: BUILD,
        recipeId: rid,
        roundFactor: 0,
      })
    }

    // Seed a manual price on every ingredient that no selected recipe produces.
    // Without these leaf prices the iterative solve never starts and returns {}.
    const selected = new Set(recipeIds)
    const produced = new Set<string>()
    const consumed = new Set<string>()
    for (const eid of gameDataStore.getRowIds('recipeElements')) {
      const e = gameDataStore.getRow('recipeElements', eid)
      if (!selected.has(e.recipeId as string)) continue
      ;(e.isProduct ? produced : consumed).add(e.itemOrTagId as string)
    }
    const needed = new Set([...consumed].filter((iid) => !produced.has(iid)))
    let pi = 0
    for (const iid of [...needed].sort()) {
      const nm = gameDataStore.getCell('items', iid, 'name') as string
      // Deterministic pseudo-price derived from the name, so both trees agree.
      let h = 0
      for (const ch of nm) h = (h * 31 + ch.charCodeAt(0)) % 997
      row('userPrices', `up${pi++}`, {
        id: `up${pi}`,
        buildId: BUILD,
        itemOrTagId: iid,
        price: 1 + (h % 50) / 10,
        isOverride: false,
        priceMode: 'manual',
      })
    }

    const input = buildSolverSnapshot(gameDataStore, buildStore, BUILD, dsId)
    expect(input).not.toBeNull()
    const out = solve(input!)

    // Key prices by raw item NAME — row ids are generated per run.
    const nameById = new Map<string, string>()
    for (const id of gameDataStore.getRowIds('items')) {
      nameById.set(id, gameDataStore.getCell('items', id, 'name') as string)
    }
    const byName: Record<string, number> = {}
    for (const [itemId, p] of Object.entries(out.prices)) {
      const nm = nameById.get(itemId)
      if (nm && typeof p?.costPrice === 'number') byName[nm] = p.costPrice
    }
    const expected = JSON.parse(
      readFileSync(resolve(__dirname, 'fixtures/v13-price-baseline.json'), 'utf-8')
    ) as Record<string, number>

    // Compare the key set first — a dropped product is easier to read as a
    // missing key than as 300 numeric diffs.
    expect(Object.keys(byName).sort()).toEqual(Object.keys(expected).sort())
    expect(byName).toEqual(expected)
  })
})
