import { describe, it, expect } from 'vitest'

import type { SolverModifier, SolverTalent, SolverModuleEffect } from '@/types/solver'

import {
  applyModifierEffect,
  applyRoundFactor,
  moduleFactor,
  resolveModifiers,
} from '../dynamic-values'

/** Build one module's effects. `skillIds: []` means unscoped. */
function fx(
  moduleId: string,
  action: SolverModuleEffect['action'],
  effectType: SolverModuleEffect['effectType'],
  value: number,
  skillIds: string[] = []
): SolverModuleEffect {
  return { moduleId, action, effectType, value, skillIds }
}

describe('resolveModifiers', () => {
  const baseContext = {
    skillLevel: 3,
    laborReducePercent: [1.0, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5],
    activeTalents: [] as SolverTalent[],
    moduleEffects: [] as SolverModuleEffect[],
  }

  it('returns 1 for empty modifiers', () => {
    expect(resolveModifiers([], baseContext).multiplier).toBe(1)
  })

  it('applies skill level modifier', () => {
    const modifiers: SolverModifier[] = [{ dynamicType: 'Skill', refName: 'CookingSkill' }]
    expect(resolveModifiers(modifiers, baseContext).multiplier).toBeCloseTo(0.7)
  })

  it('clamps to last value if level exceeds array', () => {
    const ctx = { ...baseContext, skillLevel: 99 }
    const modifiers: SolverModifier[] = [{ dynamicType: 'Skill', refName: 'CookingSkill' }]
    expect(resolveModifiers(modifiers, ctx).multiplier).toBeCloseTo(0.5)
  })

  it('skips the skill modifier (no NaN) when laborReducePercent is empty', () => {
    const ctx = { ...baseContext, laborReducePercent: [] }
    const modifiers: SolverModifier[] = [{ dynamicType: 'Skill', refName: 'CookingSkill' }]
    expect(resolveModifiers(modifiers, ctx).multiplier).toBe(1)
  })

  it('clamps a negative skill level to the first value instead of indexing from the end', () => {
    const ctx = { ...baseContext, skillLevel: -1 }
    const modifiers: SolverModifier[] = [{ dynamicType: 'Skill', refName: 'CookingSkill' }]
    expect(resolveModifiers(modifiers, ctx).multiplier).toBeCloseTo(1.0)
  })

  it('applies talent modifier when talent is active', () => {
    const ctx = { ...baseContext, activeTalents: [{ name: 'CookingFocusedTalent', value: 0.85 }] }
    const modifiers: SolverModifier[] = [{ dynamicType: 'Talent', refName: 'CookingFocusedTalent' }]
    expect(resolveModifiers(modifiers, ctx).multiplier).toBeCloseTo(0.85)
  })

  it('ignores talent modifier when talent is not active', () => {
    const modifiers: SolverModifier[] = [{ dynamicType: 'Talent', refName: 'CookingFocusedTalent' }]
    expect(resolveModifiers(modifiers, baseContext).multiplier).toBe(1)
  })

  it('multiplies multiple modifiers together', () => {
    const ctx = {
      ...baseContext,
      activeTalents: [{ name: 'CookingLavishTalent', value: 0.85 }],
      moduleEffects: [fx('m1', 'ResourceCost', 'Multiplicative', 0.9)],
    }
    const modifiers: SolverModifier[] = [
      { dynamicType: 'Module', refName: 'CookingSkill' },
      { dynamicType: 'Talent', refName: 'CookingLavishTalent' },
    ]
    expect(resolveModifiers(modifiers, ctx).multiplier).toBeCloseTo(0.765)
  })

  it('routes an additive talent into `addend`, not `multiplier`', () => {
    // Mineral Baking: +1 Quicklime — a flat delta, not a multiplier.
    const ctx = {
      ...baseContext,
      activeTalents: [{ name: 'MasonryMineralBakingTalent:0', value: 1, isAdditive: true }],
    }
    const modifiers: SolverModifier[] = [
      { dynamicType: 'Talent', refName: 'MasonryMineralBakingTalent:0' },
    ]
    expect(resolveModifiers(modifiers, ctx)).toEqual({ multiplier: 1, addend: 1 })
  })

  it('accumulates several additive talents', () => {
    const ctx = {
      ...baseContext,
      activeTalents: [
        { name: 'A:0', value: 1, isAdditive: true },
        { name: 'B:0', value: 3, isAdditive: true },
      ],
    }
    const modifiers: SolverModifier[] = [
      { dynamicType: 'Talent', refName: 'A:0' },
      { dynamicType: 'Talent', refName: 'B:0' },
    ]
    expect(resolveModifiers(modifiers, ctx).addend).toBe(4)
  })

  it('keeps the additive and multiplicative channels independent', () => {
    const ctx = {
      ...baseContext,
      activeTalents: [
        { name: 'Mult:0', value: 0.5 },
        { name: 'Add:0', value: 2, isAdditive: true },
      ],
    }
    const modifiers: SolverModifier[] = [
      { dynamicType: 'Talent', refName: 'Mult:0' },
      { dynamicType: 'Talent', refName: 'Add:0' },
    ]
    expect(resolveModifiers(modifiers, ctx)).toEqual({ multiplier: 0.5, addend: 2 })
  })
})

describe('applyModifierEffect', () => {
  it('multiplies before adding, since scaling applies before flat deltas', () => {
    // 10 x 0.5 + 2 = 7, NOT (10 + 2) x 0.5 = 6.
    expect(applyModifierEffect(10, { multiplier: 0.5, addend: 2 })).toBe(7)
  })

  it('grows an ingredient magnitude, since ingredients are stored negated', () => {
    // A "+1" on an ingredient means one MORE consumed. Naive `base + addend`
    // would give -3 (one fewer) instead.
    expect(applyModifierEffect(-4, { multiplier: 1, addend: 1 })).toBe(-5)
  })

  it('treats a zero base as positive so the addend is not lost to sign(0)', () => {
    expect(applyModifierEffect(0, { multiplier: 1, addend: 1 })).toBe(1)
  })

  it('is a no-op for the identity effect', () => {
    expect(applyModifierEffect(7.5, { multiplier: 1, addend: 0 })).toBe(7.5)
  })
})

describe('applyRoundFactor', () => {
  it('returns value unchanged when roundFactor is 0', () => {
    expect(applyRoundFactor(1.35, 0)).toBeCloseTo(1.35)
  })
  it('rounds positive values up (ceiling)', () => {
    expect(applyRoundFactor(1.3, 2)).toBeCloseTo(1.5)
  })
  it('rounds negative values down (floor)', () => {
    expect(applyRoundFactor(-1.3, 2)).toBeCloseTo(-1.5)
  })
  it('handles roundFactor=4', () => {
    expect(applyRoundFactor(1.3, 4)).toBeCloseTo(1.5)
  })
  it('does not change whole numbers', () => {
    expect(applyRoundFactor(3.0, 2)).toBeCloseTo(3.0)
  })
  it('handles roundFactor=1 (round to integers)', () => {
    expect(applyRoundFactor(1.3, 1)).toBeCloseTo(2)
    expect(applyRoundFactor(-1.3, 1)).toBeCloseTo(-2)
  })
})

// ⚠️ THE MOST IMPORTANT TEST IN THE v14 WORK.
//
// v14 ResourceCost and LaborCost effects are ADDITIVE; CraftTime is
// MULTIPLICATIVE. Getting this wrong changes prices by ~20% on an upgraded
// table while still looking entirely plausible.
//
// The three-generic-slot rows are confirmed against a live v14 server (Icebox on
// a Carpentry Table: 10 HewnLog -> 6.5, 12 WoodBoard -> 7.8, 60 cal -> 45,
// 2min -> ~30s), so they are the rows with real ground truth. The values below
// are the extractor's own output for BasicUpgradeItem / AdvancedUpgradeItem /
// ModernUpgradeItem — verified against eco-game-files/v14.0.1, never transcribed
// from a design document.
describe('moduleFactor', () => {
  const BASIC = [
    fx('basic', 'ResourceCost', 'AdditivePercent', -0.1),
    fx('basic', 'LaborCost', 'AdditivePercent', -0.05),
    fx('basic', 'CraftTime', 'Multiplicative', 0.75),
  ]
  const ADVANCED = [
    fx('adv', 'ResourceCost', 'AdditivePercent', -0.1),
    fx('adv', 'LaborCost', 'AdditivePercent', -0.1),
    fx('adv', 'CraftTime', 'Multiplicative', 0.65),
  ]
  const MODERN = [
    fx('mod', 'ResourceCost', 'AdditivePercent', -0.15),
    fx('mod', 'LaborCost', 'AdditivePercent', -0.1),
    fx('mod', 'CraftTime', 'Multiplicative', 0.5),
  ]
  // CarpentryBasicUpgradeItem — scoped, and carries no labor effect.
  const CARPENTRY = [
    fx('carp', 'ResourceCost', 'AdditivePercent', -0.05, ['sk-carp']),
    fx('carp', 'CraftTime', 'Multiplicative', 0.75, ['sk-carp']),
  ]
  const GENERICS = [...BASIC, ...ADVANCED, ...MODERN]
  const ALL_FOUR = [...GENERICS, ...CARPENTRY]

  describe('v14, three generic slots (confirmed in-game)', () => {
    it('sums ResourceCost rather than multiplying: x0.65, not x0.6885', () => {
      expect(moduleFactor(GENERICS, 'resource', 'sk-carp')).toBeCloseTo(0.65, 10)
      // Icebox: the exact in-game observation.
      expect(10 * moduleFactor(GENERICS, 'resource', 'sk-carp')).toBeCloseTo(6.5, 10)
      expect(12 * moduleFactor(GENERICS, 'resource', 'sk-carp')).toBeCloseTo(7.8, 10)
    })

    it('sums LaborCost rather than multiplying: x0.75, not x0.7695', () => {
      expect(moduleFactor(GENERICS, 'labor', 'sk-carp')).toBeCloseTo(0.75, 10)
      expect(60 * moduleFactor(GENERICS, 'labor', 'sk-carp')).toBeCloseTo(45, 10)
    })

    it('multiplies CraftTime: x0.24375', () => {
      expect(moduleFactor(GENERICS, 'speed', 'sk-carp')).toBeCloseTo(0.24375, 10)
      // 2 min -> 29.25s, which the game tooltip rounds to 30s.
      expect(120 * moduleFactor(GENERICS, 'speed', 'sk-carp')).toBeCloseTo(29.25, 10)
    })
  })

  describe('v14, four slots (model prediction — specialty not yet server-verified)', () => {
    it('adds the specialty ResourceCost: x0.60, not x0.771', () => {
      expect(moduleFactor(ALL_FOUR, 'resource', 'sk-carp')).toBeCloseTo(0.6, 10)
    })

    it('leaves labor unchanged — no live specialty module has a LaborCost effect', () => {
      expect(moduleFactor(ALL_FOUR, 'labor', 'sk-carp')).toBeCloseTo(0.75, 10)
    })

    it('multiplies the specialty CraftTime in: x0.1828', () => {
      expect(moduleFactor(ALL_FOUR, 'speed', 'sk-carp')).toBeCloseTo(0.1828125, 10)
    })

    it('ignores the specialty module entirely on a different skill', () => {
      // A Masonry recipe on the same table gets only the three generics.
      expect(moduleFactor(ALL_FOUR, 'resource', 'sk-masonry')).toBeCloseTo(0.65, 10)
      expect(moduleFactor(ALL_FOUR, 'speed', 'sk-masonry')).toBeCloseTo(0.24375, 10)
    })
  })

  describe('v11-v13 legacy (proves the old numbers are unchanged)', () => {
    // One legacy module normalizes to four bonuses: unscoped Resource x0.8 and
    // CraftTime x0.8, plus own-skill Resource x0.75 and CraftTime x0.75.
    const LEGACY = [
      fx('legacy', 'ResourceCost', 'Multiplicative', 0.8),
      fx('legacy', 'ResourceCost', 'Multiplicative', 0.75, ['sk-carp']),
      fx('legacy', 'CraftTime', 'Multiplicative', 0.8),
      fx('legacy', 'CraftTime', 'Multiplicative', 0.75, ['sk-carp']),
    ]

    it('uses the own-skill percent when the skill matches: x0.75', () => {
      expect(moduleFactor(LEGACY, 'resource', 'sk-carp')).toBeCloseTo(0.75, 10)
      expect(moduleFactor(LEGACY, 'speed', 'sk-carp')).toBeCloseTo(0.75, 10)
    })

    it('uses the general percent when the skill does not match: x0.80', () => {
      expect(moduleFactor(LEGACY, 'resource', 'sk-other')).toBeCloseTo(0.8, 10)
      expect(moduleFactor(LEGACY, 'speed', 'sk-other')).toBeCloseTo(0.8, 10)
    })

    it('SUPERSEDES rather than stacks — 0.75, never 0.8 x 0.75 = 0.6', () => {
      // This precedence rule is invisible on v14 (no v14 module mixes scoped and
      // unscoped effects for one action) and load-bearing on v13, where 44 of 56
      // modules depend on it. It will look like dead code to anyone reading only
      // v14 data.
      expect(moduleFactor(LEGACY, 'resource', 'sk-carp')).not.toBeCloseTo(0.6, 5)
    })

    it('never reduces labor — legacy modules carry no LaborCost effect', () => {
      expect(moduleFactor(LEGACY, 'labor', 'sk-carp')).toBe(1)
    })
  })

  describe('scope fall-through', () => {
    it('falls back to unscoped effects when the scope matches nothing', () => {
      // Confirmed in-game: an unscoped module DOES discount a skill-less recipe
      // (Participation Trophy, whose ingredient is tagged with the abstract
      // `Skill` base type that no module binds to). Turning this fallback into
      // an early return would silently drop the discount on every such recipe.
      expect(moduleFactor(GENERICS, 'resource', undefined)).toBeCloseTo(0.65, 10)
      expect(moduleFactor(GENERICS, 'resource', 'sk-nonexistent')).toBeCloseTo(0.65, 10)
    })

    it('applies only the generics when a scoped module cannot match', () => {
      expect(moduleFactor(ALL_FOUR, 'resource', undefined)).toBeCloseTo(0.65, 10)
    })

    it('returns 1 when no module is installed', () => {
      expect(moduleFactor([], 'resource', 'sk-carp')).toBe(1)
      expect(moduleFactor([], 'labor', undefined)).toBe(1)
    })
  })
})
