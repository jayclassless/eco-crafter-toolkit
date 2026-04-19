import { describe, it, expect } from 'vitest'

import type { SolverModifier, SolverTalent, SolverPluginModule } from '@/types/solver'

import { resolveModifiers, applyRoundFactor } from '../dynamic-values'

describe('resolveModifiers', () => {
  const baseContext = {
    skillLevel: 3,
    laborReducePercent: [1.0, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5],
    activeTalents: [] as SolverTalent[],
    pluginModule: null as SolverPluginModule | null,
    speedPluginModule: null as SolverPluginModule | null,
    recipeSkillId: 'cooking',
  }

  it('returns 1 for empty modifiers', () => {
    expect(resolveModifiers([], baseContext)).toBe(1)
  })

  it('applies skill level modifier', () => {
    const modifiers: SolverModifier[] = [{ dynamicType: 'Skill', refName: 'CookingSkill' }]
    expect(resolveModifiers(modifiers, baseContext)).toBeCloseTo(0.7)
  })

  it('clamps to last value if level exceeds array', () => {
    const ctx = { ...baseContext, skillLevel: 99 }
    const modifiers: SolverModifier[] = [{ dynamicType: 'Skill', refName: 'CookingSkill' }]
    expect(resolveModifiers(modifiers, ctx)).toBeCloseTo(0.5)
  })

  it('applies talent modifier when talent is active', () => {
    const ctx = { ...baseContext, activeTalents: [{ name: 'CookingFocusedTalent', value: 0.85 }] }
    const modifiers: SolverModifier[] = [{ dynamicType: 'Talent', refName: 'CookingFocusedTalent' }]
    expect(resolveModifiers(modifiers, ctx)).toBeCloseTo(0.85)
  })

  it('ignores talent modifier when talent is not active', () => {
    const modifiers: SolverModifier[] = [{ dynamicType: 'Talent', refName: 'CookingFocusedTalent' }]
    expect(resolveModifiers(modifiers, baseContext)).toBe(1)
  })

  it('applies resource plugin module modifier', () => {
    const ctx = {
      ...baseContext,
      pluginModule: { percent: 0.8, skillId: 'cooking', skillPercent: 0.7 },
    }
    const modifiers: SolverModifier[] = [{ dynamicType: 'Module', refName: 'CookingSkill' }]
    expect(resolveModifiers(modifiers, ctx)).toBeCloseTo(0.7)
  })

  it('uses base percent when skill does not match module', () => {
    const ctx = {
      ...baseContext,
      pluginModule: { percent: 0.8, skillId: 'mining', skillPercent: 0.7 },
    }
    const modifiers: SolverModifier[] = [{ dynamicType: 'Module', refName: 'CookingSkill' }]
    expect(resolveModifiers(modifiers, ctx)).toBeCloseTo(0.8)
  })

  it('uses base percent when module has no skillPercent', () => {
    const ctx = { ...baseContext, pluginModule: { percent: 0.8 } }
    const modifiers: SolverModifier[] = [{ dynamicType: 'Module', refName: 'CookingSkill' }]
    expect(resolveModifiers(modifiers, ctx)).toBeCloseTo(0.8)
  })

  it('returns 1 for module modifier when no plugin module', () => {
    const modifiers: SolverModifier[] = [{ dynamicType: 'Module', refName: 'CookingSkill' }]
    expect(resolveModifiers(modifiers, baseContext)).toBe(1)
  })

  it('multiplies multiple modifiers together', () => {
    const ctx = {
      ...baseContext,
      activeTalents: [{ name: 'CookingLavishTalent', value: 0.85 }],
      pluginModule: { percent: 0.9 },
    }
    const modifiers: SolverModifier[] = [
      { dynamicType: 'Module', refName: 'CookingSkill' },
      { dynamicType: 'Talent', refName: 'CookingLavishTalent' },
    ]
    expect(resolveModifiers(modifiers, ctx)).toBeCloseTo(0.765)
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
