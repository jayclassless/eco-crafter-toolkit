import { describe, expect, it } from 'vitest'

import { OTHER_PROFESSION, type SkillSelectOption, UNSKILLED_SKILL_ID } from '@/lib/skill-options'

import {
  DEFAULT_OPTIMIZER_CONFIG,
  type OptimizerConfig,
  type PowerType,
} from '../housing-optimizer-types'
import {
  HOUSING_PRESETS,
  type HousingPreset,
  housingPresetPatch,
  type HousingPresetId,
  matchHousingPreset,
} from '../housing-presets'

function option(id: string, rawName: string, name = id): SkillSelectOption {
  return {
    id,
    name,
    rawName,
    professionRawName: rawName ? 'CarpenterSkill' : OTHER_PROFESSION,
    professionName: rawName ? 'Carpenter' : 'Other',
    count: 1,
  }
}

// A stand-in for what `collectSkillOptions` yields: one option per skill that
// crafts a furnishing, plus the synthetic Unskilled entry. Spans all five
// stages, and deliberately omits skills the presets name (Gathering, Mining,
// Recycling, ...) that craft nothing today.
const options: SkillSelectOption[] = [
  option(UNSKILLED_SKILL_ID, '', 'Unskilled'),
  option('s-logging', 'LoggingSkill'),
  option('s-hunting', 'HuntingSkill'),
  option('s-carpentry', 'CarpentrySkill'),
  option('s-masonry', 'MasonrySkill'),
  option('s-pottery', 'PotterySkill'),
  option('s-electronics', 'ElectronicsSkill'),
  option('s-advanced-masonry', 'AdvancedMasonrySkill'),
]

function preset(id: HousingPresetId): HousingPreset {
  const found = HOUSING_PRESETS.find((p) => p.id === id)
  if (!found) throw new Error(`no such preset: ${id}`)
  return found
}

function config(patch: Partial<OptimizerConfig>): OptimizerConfig {
  return { ...DEFAULT_OPTIMIZER_CONFIG, ...patch }
}

/** The config a stage produces, ready to feed back to `matchHousingPreset`. */
function applied(id: HousingPresetId): OptimizerConfig {
  return config(housingPresetPatch(preset(id), options))
}

describe('HOUSING_PRESETS', () => {
  it('runs from Day 0 to End Game in progression order', () => {
    expect(HOUSING_PRESETS.map((p) => p.id)).toEqual([
      'day0',
      'earlyGame',
      'midGame',
      'lateGame',
      'endGame',
    ])
  })

  it('raises the wall material tier by one at every stage', () => {
    expect(HOUSING_PRESETS.map((p) => p.tier)).toEqual([1, 2, 3, 4, 5])
  })

  it('accumulates skills, so each stage keeps everything the previous one had', () => {
    // End Game is null ("all"), which ends the chain rather than extending it.
    const stages = HOUSING_PRESETS.filter((p) => p.skillTokens !== null)
    expect(stages).toHaveLength(4)
    for (let i = 1; i < stages.length; i++) {
      const earlier = stages[i - 1].skillTokens as readonly string[]
      const later = new Set(stages[i].skillTokens as readonly string[])
      for (const token of earlier) expect(later.has(token)).toBe(true)
      expect(later.size).toBeGreaterThan(earlier.length)
    }
  })

  it('unlocks power grids cumulatively too', () => {
    expect(HOUSING_PRESETS.map((p) => [...p.power])).toEqual([
      ['Heat'],
      ['Heat', 'Mechanical'],
      ['Heat', 'Mechanical'],
      ['Heat', 'Mechanical', 'Electric'],
      ['Heat', 'Mechanical', 'Electric'],
    ])
  })

  it('names Unskilled from Day 0, since nothing gates flowers and stumps', () => {
    expect(preset('day0').skillTokens).toContain(UNSKILLED_SKILL_ID)
  })

  it('matches the shipped defaults, so a fresh install opens on End Game', () => {
    expect(matchHousingPreset(DEFAULT_OPTIMIZER_CONFIG, options)).toBe('endGame')
  })
})

describe('housingPresetPatch', () => {
  it('always carries the skillIds key, since null there means "all"', () => {
    // OptimizerView tests the patch with `in`, so an absent key would leave a
    // stale selection behind.
    expect('skillIds' in housingPresetPatch(preset('endGame'), options)).toBe(true)
  })

  it('resolves skill names to row ids', () => {
    expect(housingPresetPatch(preset('day0'), options)).toEqual({
      tier: 1,
      power: ['Heat'],
      skillIds: [UNSKILLED_SKILL_ID, 's-logging', 's-hunting'],
    })
  })

  it('drops names no option carries, so a sparse dataset still applies', () => {
    // Day 0 also names Gathering, Mining and Campfire Cooking, none of which
    // craft a furnishing.
    const ids = housingPresetPatch(preset('day0'), options).skillIds
    expect(ids).not.toContain('GatheringSkill')
    expect(ids).toHaveLength(3)
  })

  it('gives End Game every skill, as null rather than an id list', () => {
    expect(housingPresetPatch(preset('endGame'), options).skillIds).toBeNull()
  })

  it('normalizes a stage covering every option to null, matching the dropdown', () => {
    // Late Game names Electronics; against an option list that holds nothing
    // else, "all of them" must encode the way SkillMultiSelect would.
    const only = [option('s-electronics', 'ElectronicsSkill')]
    expect(housingPresetPatch(preset('lateGame'), only).skillIds).toBeNull()
  })

  it('copies the power array, so callers cannot mutate the preset', () => {
    const power = housingPresetPatch(preset('day0'), options).power as PowerType[]
    power.push('Electric')
    expect(preset('day0').power).toEqual(['Heat'])
  })
})

describe('matchHousingPreset', () => {
  it('recognizes every stage it applied itself', () => {
    for (const { id } of HOUSING_PRESETS) {
      expect(matchHousingPreset(applied(id), options)).toBe(id)
    }
  })

  it('recognizes a hand-made selection that happens to match a stage', () => {
    // Never applied — assembled the way a user clicking the controls would.
    expect(
      matchHousingPreset(
        config({
          tier: 2,
          power: ['Heat', 'Mechanical'],
          skillIds: [UNSKILLED_SKILL_ID, 's-logging', 's-hunting', 's-carpentry', 's-masonry'],
        }),
        options
      )
    ).toBe('earlyGame')
  })

  it('ignores the order of both the power and the skill selections', () => {
    const early = applied('earlyGame')
    expect(
      matchHousingPreset(
        {
          ...early,
          power: [...early.power].reverse(),
          skillIds: [...(early.skillIds as string[])].reverse(),
        },
        options
      )
    ).toBe('earlyGame')
  })

  it('reports custom when only the tier differs', () => {
    expect(matchHousingPreset({ ...applied('midGame'), tier: 4 }, options)).toBeNull()
  })

  it('reports custom when only the power differs', () => {
    expect(matchHousingPreset({ ...applied('midGame'), power: ['Heat'] }, options)).toBeNull()
  })

  it('reports custom when only the skills differ', () => {
    const mid = applied('midGame')
    expect(
      matchHousingPreset({ ...mid, skillIds: (mid.skillIds as string[]).slice(1) }, options)
    ).toBeNull()
  })

  it('distinguishes "all skills" from a selection that lists every stage skill', () => {
    // Late Game resolves to a strict subset here (Advanced Masonry is End Game
    // only), so tier 4 with everything unlocked is not Late Game.
    expect(matchHousingPreset({ ...applied('lateGame'), skillIds: null }, options)).toBeNull()
  })

  it('keeps the stage active when a numeric assumption changes', () => {
    // Residents and the pruning thresholds are not a function of game stage.
    expect(
      matchHousingPreset(
        { ...applied('midGame'), residents: 4, maxFurnishingRepeats: 9, minRoomContribution: 0 },
        options
      )
    ).toBe('midGame')
  })
})
