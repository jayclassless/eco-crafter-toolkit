import { readFileSync } from 'fs'
import { resolve } from 'path'

import { describe, it, expect } from 'vitest'

import type { DatasetJson } from '@/types/dataset-json'

import { parseDataset } from '../import-dataset'

const LEGACY = ['eco-v11', 'eco-v12', 'eco-v13'] as const

function load(id: string): DatasetJson {
  return JSON.parse(
    readFileSync(resolve(__dirname, `../../../public/data/${id}.json`), 'utf-8')
  ) as DatasetJson
}

// The normalizer is the only thing standing between v11-v13's numbers and the
// new unified module path. These assertions run the *shipped* datasets through
// it, so a change that quietly alters legacy module effects fails here rather
// than surfacing later as wrong prices.
describe.each(LEGACY)('%s modules normalize into the unified shape', (id) => {
  const parsed = parseDataset(load(id), 'ds-test')

  it('imports all 56 modules into the Specialty slot', () => {
    expect(parsed.pluginModules).toHaveLength(56)
    expect(parsed.pluginModules.every((m) => m.slot === 'Specialty')).toBe(true)
    // Specialty costs 0 stars, which is what makes legacy builds contribute no
    // module star cost with no version check.
    expect(parsed.pluginModules.every((m) => !m.isDeprecated)).toBe(true)
  })

  it('produces only multiplicative Resource/CraftTime bonuses, never labor', () => {
    const bonuses = parsed.pluginModuleBonuses
    expect(bonuses.length).toBeGreaterThan(0)
    expect(bonuses.every((b) => b.effectType === 'Multiplicative')).toBe(true)
    // v11-v13 modules never reduced labor. A LaborCost bonus here would silently
    // cut labor costs on every legacy build.
    expect(bonuses.some((b) => b.action === 'LaborCost')).toBe(false)
    expect(new Set(bonuses.map((b) => b.action))).toEqual(new Set(['ResourceCost', 'CraftTime']))
  })

  it('gives every module a matched pair of Resource and CraftTime bonuses', () => {
    // All 56 legacy modules are PluginType 'Resource&Speed', so each yields the
    // same number of ResourceCost and CraftTime bonuses.
    for (const m of parsed.pluginModules) {
      const mine = parsed.pluginModuleBonuses.filter((b) => b.pluginModuleId === m.id)
      const res = mine.filter((b) => b.action === 'ResourceCost')
      const time = mine.filter((b) => b.action === 'CraftTime')
      expect(res.length).toBe(time.length)
      // 44 of 56 carry an own-skill percent (2 bonuses per action); 12 do not (1).
      expect([1, 2]).toContain(res.length)
    }
  })

  it('resolves every skill scope to a real skill id', () => {
    const skillIds = new Set(parsed.skills.map((s) => s.id))
    const scoped = parsed.pluginModuleBonuses.filter((b) => b.skillIds.length > 0)
    // 44 of 56 modules are skill-scoped, across two actions each.
    expect(scoped).toHaveLength(88)
    for (const b of scoped) {
      for (const sid of b.skillIds) expect(skillIds.has(sid)).toBe(true)
    }
  })

  it('ships no garbage data', () => {
    // The v14 garbage system does not exist in these versions, so the Waste UI
    // and CRAFT_GARBAGE_RATIO are inert for them.
    expect(parsed.itemSalvage).toHaveLength(0)
    expect(parsed.recipeGarbage).toHaveLength(0)
  })
})

// v14 is the first dataset with the native bonus shape, and the only one still
// being re-extracted — v11-v13 above are frozen. The module assertions pin
// values read out of the game files, so a game patch that retunes a module is
// meant to fail them; the garbage assertion below deliberately does not work
// that way.
describe('eco-v14 modules and garbage', () => {
  const raw = load('eco-v14')
  const parsed = parseDataset(raw, 'ds-v14')

  it('imports all 59 modules with the four-slot distribution', () => {
    expect(parsed.pluginModules).toHaveLength(59)
    const bySlot: Record<string, number> = {}
    for (const m of parsed.pluginModules) bySlot[m.slot] = (bySlot[m.slot] ?? 0) + 1
    // 44 tagged Specialty + the 12 slotless deprecated tier-ladder modules,
    // which fall back to Specialty.
    expect(bySlot).toEqual({ Basic: 1, Advanced: 1, Modern: 1, Specialty: 56 })
    expect(parsed.pluginModules.filter((m) => m.isDeprecated)).toHaveLength(22)
  })

  it('splits effect types by action exactly as the game files do', () => {
    const b = parsed.pluginModuleBonuses
    expect(b).toHaveLength(133)
    const additive = b.filter((x) => x.effectType === 'AdditivePercent')
    const multiplicative = b.filter((x) => x.effectType === 'Multiplicative')
    expect(additive).toHaveLength(74)
    expect(multiplicative).toHaveLength(59)
    // Every CraftTime effect is multiplicative; every Resource/Labor is additive.
    expect(multiplicative.every((x) => x.action === 'CraftTime')).toBe(true)
    expect(additive.every((x) => x.action !== 'CraftTime')).toBe(true)
    // Only the three live generic modules reduce labor (the other 12 LaborCost
    // bonuses in the files sit on deprecated tier-ladder modules).
    expect(b.filter((x) => x.action === 'LaborCost')).toHaveLength(15)
  })

  it('pins the three generic modules against the game files', () => {
    const effects = (name: string) => {
      const m = parsed.pluginModules.find((x) => x.name === name)!
      return parsed.pluginModuleBonuses
        .filter((x) => x.pluginModuleId === m.id)
        .map((x) => `${x.action}/${x.effectType}=${x.value}`)
        .sort()
    }
    expect(effects('BasicUpgradeItem')).toEqual([
      'CraftTime/Multiplicative=0.75',
      'LaborCost/AdditivePercent=-0.05',
      'ResourceCost/AdditivePercent=-0.1',
    ])
    expect(effects('AdvancedUpgradeItem')).toEqual([
      'CraftTime/Multiplicative=0.65',
      'LaborCost/AdditivePercent=-0.1',
      'ResourceCost/AdditivePercent=-0.1',
    ])
    expect(effects('ModernUpgradeItem')).toEqual([
      'CraftTime/Multiplicative=0.5',
      'LaborCost/AdditivePercent=-0.1',
      'ResourceCost/AdditivePercent=-0.15',
    ])
  })

  it('classifies the Mining outliers as Specialty despite their names', () => {
    // MiningBasic/Advanced/ModernUpgradeItem are Tag("SpecialtyModule") modules.
    // A name-based heuristic would file them into the generic slots with the
    // wrong values.
    for (const n of [
      'MiningBasicUpgradeItem',
      'MiningAdvancedUpgradeItem',
      'MiningModernUpgradeItem',
    ]) {
      const m = parsed.pluginModules.find((x) => x.name === n)!
      expect(m.slot, n).toBe('Specialty')
      const own = parsed.pluginModuleBonuses.filter((x) => x.pluginModuleId === m.id)
      expect(
        own.every((x) => x.skillIds.length === 1),
        n
      ).toBe(true)
    }
  })

  it('imports the garbage tables without dropping a row', () => {
    // Both tables are emitted one row per JSON entry, and an item name that
    // fails to resolve drops its row silently (`import-dataset.ts`) — which is
    // the regression this guards. Counting the source entries rather than
    // hardcoding a total keeps it aimed at the importer: a game patch that adds
    // or removes salvage moves both sides together and stays green, while a
    // resolver that starts missing names moves only one side and fails.
    const salvageEntries = raw.Items.reduce((n, i) => n + (i.SalvageCost?.length ?? 0), 0)
    const garbageEntries = raw.Recipes.reduce((n, r) => n + (r.GarbageOutputs?.length ?? 0), 0)
    // Guard the degenerate pass: a dataset that lost its garbage data entirely
    // would satisfy 0 === 0.
    expect(salvageEntries).toBeGreaterThan(0)
    expect(garbageEntries).toBeGreaterThan(0)

    expect(parsed.itemSalvage).toHaveLength(salvageEntries)
    expect(parsed.recipeGarbage).toHaveLength(garbageEntries)
  })
})
