import { readFileSync } from 'fs'
import { resolve } from 'path'

import { describe, it, expect } from 'vitest'

import type { DatasetJson } from '@/types/dataset-json'

import { validateDatasetJson } from '../import-dataset'

const BUNDLED = ['eco-v11', 'eco-v12', 'eco-v13'] as const

function load(id: string): DatasetJson {
  return JSON.parse(
    readFileSync(resolve(__dirname, `../../../public/data/${id}.json`), 'utf-8')
  ) as DatasetJson
}

describe('bundled eco-v12 dataset', () => {
  it('passes validation', () => {
    const result = validateDatasetJson(load('eco-v12'))

    if (!result.valid) {
      console.error('Validation errors:', result.errors.slice(0, 10))
    }
    expect(result.valid).toBe(true)
  })
})

// The shipped JSONs are ~3.5 MB each, so a re-extraction diff can't be reviewed
// by eye. These assertions are the review: they pin the shape and rough volume
// of the gathering data, so a parser regression that silently drops a category
// fails here rather than surfacing later as wrong prices.
describe.each(BUNDLED)('bundled %s gathering data', (id) => {
  const data = load(id)
  const items = data.Items

  it('passes validation', () => {
    const result = validateDatasetJson(data)
    if (!result.valid) console.error('Validation errors:', result.errors.slice(0, 10))
    expect(result.valid).toBe(true)
  })

  it('carries every gathering category', () => {
    const rocks = items.filter((i) => (i.MinableHardness ?? 0) > 0)
    const excavatables = items.filter((i) => i.RequiresShovel)
    const carcasses = items.filter((i) => (i.AnimalHealth ?? 0) > 0)
    const clothing = items.filter((i) => (i.ClothingCalorieRate ?? 0) !== 0)

    expect(rocks.length).toBeGreaterThanOrEqual(10)
    expect(excavatables.length).toBeGreaterThanOrEqual(20)
    expect(carcasses.length).toBeGreaterThanOrEqual(10)
    expect(clothing.length).toBeGreaterThanOrEqual(10)
    expect(data.GatheringTools?.length ?? 0).toBeGreaterThanOrEqual(15)
    expect(data.TreeSpecies?.length ?? 0).toBeGreaterThanOrEqual(10)
  })

  it('never ships a rock with no rubble yield', () => {
    // v11's SlagBlock is Minable(4) with no AutoGen/Rubble/Slag.cs, so it
    // yields nothing at all. Emitting it would give the calculator a zero
    // divisor for items-per-block.
    for (const rock of items.filter((i) => (i.MinableHardness ?? 0) > 0)) {
      expect(rock.RubbleItemsPerBlock ?? 0).toBeGreaterThan(0)
      expect(rock.RubbleMaxItemsPerBlock ?? 0).toBeGreaterThanOrEqual(rock.RubbleItemsPerBlock ?? 0)
    }
  })

  it('keeps the gathering classes disjoint', () => {
    // gathering-calc classifies by "first non-zero field wins", which is only
    // safe while no item carries two of them.
    for (const i of items) {
      const classes = [
        (i.MinableHardness ?? 0) > 0,
        !!i.RequiresShovel,
        (i.AnimalHealth ?? 0) > 0,
      ].filter(Boolean)
      expect(
        classes.length,
        `${i.Name} belongs to ${classes.length} gathering classes`
      ).toBeLessThan(2)
    }
  })

  it('resolves every gathering cross-reference', () => {
    const itemNames = new Set(items.map((i) => i.Name))
    const skillNames = new Set(data.Skills.map((s) => s.Name))
    const talentNames = new Set(data.Skills.flatMap((s) => s.Talents.map((t) => t.Name)))

    for (const tool of data.GatheringTools ?? []) {
      expect(itemNames.has(tool.Name), `${tool.Name} is not an item`).toBe(true)
      expect(skillNames.has(tool.CalorieSkill), `${tool.CalorieSkill} is not a skill`).toBe(true)
      // A talent named here but absent from the dataset would render a toggle
      // the user could never legitimately turn on.
      if (tool.EfficiencyTalent) expect(talentNames.has(tool.EfficiencyTalent)).toBe(true)
      if (tool.StrengthTalent) expect(talentNames.has(tool.StrengthTalent)).toBe(true)
    }
    for (const species of data.TreeSpecies ?? []) {
      expect(itemNames.has(species.LogItem), `${species.LogItem} is not an item`).toBe(true)
      expect(species.TreeHealth).toBeGreaterThan(0)
      expect(species.LogsPerTreeMax).toBeGreaterThanOrEqual(species.LogsPerTreeMin)
    }
  })

  it('gives shovels and bows no efficiency talent', () => {
    // Their C# names the abstract ToolEfficiencyTalent, which belongs to no
    // talent group and is never granted, so it must be omitted rather than
    // shipped as a reference that can never resolve.
    for (const tool of data.GatheringTools ?? []) {
      if (tool.Kind === 'Shovel' || tool.Kind === 'Bow') {
        expect(tool.EfficiencyTalent, tool.Name).toBeUndefined()
      }
    }
  })

  it('scales pickaxe damage flatly and axe damage by the tool curve', () => {
    // Pickaxes override damage with ConstantValue(tier); axes and bows use
    // CreateDamageValue(), which ToolItem's damage curve scales with level.
    const tools = data.GatheringTools ?? []
    for (const t of tools.filter((x) => x.Kind === 'Pickaxe')) {
      expect(t.DamageUsesToolCurve, t.Name).toBe(false)
    }
    for (const t of tools.filter((x) => x.Kind === 'Axe' || x.Kind === 'Bow')) {
      expect(t.DamageUsesToolCurve, t.Name).toBe(true)
    }
  })

  it('has no levelable gathering talents', () => {
    // The calculator models these as booleans. A future dataset that turned one
    // into a CappedMultiplicative would silently under-apply it.
    const gatheringTalents = new Set(
      (data.GatheringTools ?? []).flatMap((t) =>
        [t.EfficiencyTalent, t.StrengthTalent].filter((n): n is string => !!n)
      )
    )
    for (const skill of data.Skills) {
      for (const talent of skill.Talents) {
        if (!gatheringTalents.has(talent.Name)) continue
        const capped = (talent.Bonuses ?? []).some((b) => b.EffectType === 'CappedMultiplicative')
        expect(capped, `${talent.Name} became levelable`).toBe(false)
      }
    }
  })
})

// The whole reason gathering data is extracted per dataset rather than
// hardcoded: the same entity genuinely differs between game versions.
describe('gathering data differs across versions', () => {
  it('has a different Oak tree health in v11 and v13', () => {
    const oak = (id: string) => load(id).TreeSpecies?.find((s) => s.Name === 'Oak')?.TreeHealth
    expect(oak('eco-v11')).toBe(20)
    expect(oak('eco-v13')).toBe(30)
  })

  it('drops v11 Slag, which is minable but has no rubble', () => {
    const slag = (id: string) => load(id).Items.find((i) => i.Name === 'SlagItem')?.MinableHardness
    expect(slag('eco-v11')).toBeUndefined()
    expect(slag('eco-v13')).toBe(4)
  })

  it('models two tree species yielding the same log item', () => {
    // Redwood (15 HP, 0-75 logs) and Old-Growth Redwood (300 HP, 700-800 logs)
    // both yield RedwoodLogItem. Flattening health onto the item would silently
    // drop one of them, which is why TreeSpecies is its own section.
    const species = load('eco-v13').TreeSpecies ?? []
    const redwoods = species.filter((s) => s.LogItem === 'RedwoodLogItem')
    expect(redwoods.map((s) => s.Name).sort()).toEqual(['OldGrowthRedwood', 'Redwood'])
    expect(new Set(redwoods.map((s) => s.TreeHealth)).size).toBe(2)
  })

  it('models the Work Backpack as a second calorie-reducing slot', () => {
    // Boots and the backpack occupy different slots, so their rates stack —
    // which is why the clothing control has to be multi-select.
    for (const id of BUNDLED) {
      const rate = load(id).Items.find((i) => i.Name === 'WorkBackpackItem')?.ClothingCalorieRate
      expect(rate, id).toBe(-0.1)
    }
  })
})
