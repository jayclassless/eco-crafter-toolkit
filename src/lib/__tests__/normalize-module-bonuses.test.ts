import { describe, it, expect } from 'vitest'

import type { ItemJson } from '@/types/dataset-json'

import { normalizeModuleBonuses } from '../normalize-module-bonuses'

/** A v11–v13 module: `base(ModuleTypes.ResourceEfficiency | SpeedEfficiency,
 * 0.8f, typeof(CarpentrySkill), 0.75f)`. 44 of the 56 shipped legacy modules
 * carry the own-skill percent; the other 12 omit it. */
function legacyModule(overrides: Partial<ItemJson> = {}): ItemJson {
  return {
    Name: 'CarpentryUpgradeItem',
    LocalizedName: { 'en-US': 'Carpentry Upgrade' },
    IsPluginModule: true,
    PluginType: 'Resource&Speed',
    PluginModulePercent: 0.8,
    PluginModuleSkill: 'CarpentrySkill',
    PluginModuleSkillPercent: 0.75,
    ...overrides,
  }
}

function v14Module(overrides: Partial<ItemJson> = {}): ItemJson {
  return {
    Name: 'BasicUpgradeItem',
    LocalizedName: { 'en-US': 'Basic Upgrade' },
    IsPluginModule: true,
    ModuleSlot: 'Basic',
    ModuleBonuses: [
      { Action: 'ResourceCost', EffectType: 'AdditivePercent', Value: -0.1, Scope: {} },
      { Action: 'LaborCost', EffectType: 'AdditivePercent', Value: -0.05, Scope: {} },
      { Action: 'CraftTime', EffectType: 'Multiplicative', Value: 0.75, Scope: {} },
    ],
    ...overrides,
  }
}

describe('normalizeModuleBonuses — legacy v11-v13 shape', () => {
  it('produces four bonuses for a module with an own-skill percent', () => {
    const { slot, bonuses } = normalizeModuleBonuses(legacyModule())

    // Legacy datasets had one implicit slot. Mapping it to Specialty is what
    // makes the four-slot UI and the star cost fall out with no version check —
    // Specialty is the zero-star slot.
    expect(slot).toBe('Specialty')
    expect(bonuses).toEqual([
      { action: 'ResourceCost', effectType: 'Multiplicative', value: 0.8, skillTypes: [] },
      {
        action: 'ResourceCost',
        effectType: 'Multiplicative',
        value: 0.75,
        skillTypes: ['CarpentrySkill'],
      },
      { action: 'CraftTime', effectType: 'Multiplicative', value: 0.8, skillTypes: [] },
      {
        action: 'CraftTime',
        effectType: 'Multiplicative',
        value: 0.75,
        skillTypes: ['CarpentrySkill'],
      },
    ])
  })

  it('produces two bonuses for a module with no own-skill percent', () => {
    const { bonuses } = normalizeModuleBonuses(
      legacyModule({ PluginModuleSkill: undefined, PluginModuleSkillPercent: undefined })
    )
    expect(bonuses).toEqual([
      { action: 'ResourceCost', effectType: 'Multiplicative', value: 0.8, skillTypes: [] },
      { action: 'CraftTime', effectType: 'Multiplicative', value: 0.8, skillTypes: [] },
    ])
  })

  it('never synthesizes a LaborCost bonus', () => {
    // v11-v13 modules did not reduce labor. Inventing one here would silently
    // cut labor costs on every legacy build.
    const { bonuses } = normalizeModuleBonuses(legacyModule())
    expect(bonuses.some((b) => b.action === 'LaborCost')).toBe(false)
  })

  it('reads the PluginType flags individually rather than string-matching', () => {
    const resourceOnly = normalizeModuleBonuses(legacyModule({ PluginType: 'Resource' }))
    expect(resourceOnly.bonuses.map((b) => b.action)).toEqual(['ResourceCost', 'ResourceCost'])

    const speedOnly = normalizeModuleBonuses(legacyModule({ PluginType: 'Speed' }))
    expect(speedOnly.bonuses.map((b) => b.action)).toEqual(['CraftTime', 'CraftTime'])
  })

  it('emits nothing usable when the percent is missing', () => {
    const { bonuses } = normalizeModuleBonuses(
      legacyModule({ PluginModulePercent: undefined, PluginModuleSkillPercent: undefined })
    )
    expect(bonuses).toEqual([])
  })
})

describe('normalizeModuleBonuses — v14 shape', () => {
  it('passes bonuses through unchanged and takes the declared slot', () => {
    const { slot, bonuses } = normalizeModuleBonuses(v14Module())
    expect(slot).toBe('Basic')
    expect(bonuses).toEqual([
      { action: 'ResourceCost', effectType: 'AdditivePercent', value: -0.1, skillTypes: [] },
      { action: 'LaborCost', effectType: 'AdditivePercent', value: -0.05, skillTypes: [] },
      { action: 'CraftTime', effectType: 'Multiplicative', value: 0.75, skillTypes: [] },
    ])
  })

  it('preserves a skill scope', () => {
    const { slot, bonuses } = normalizeModuleBonuses(
      v14Module({
        Name: 'CarpentryBasicUpgradeItem',
        ModuleSlot: 'Specialty',
        ModuleBonuses: [
          {
            Action: 'ResourceCost',
            EffectType: 'AdditivePercent',
            Value: -0.05,
            Scope: { SkillTypes: ['CarpentrySkill'] },
          },
        ],
      })
    )
    expect(slot).toBe('Specialty')
    expect(bonuses[0].skillTypes).toEqual(['CarpentrySkill'])
  })

  it('takes the v14 shape even when legacy fields are also present', () => {
    // The extractor emits one shape or the other, so this should never occur.
    // But a v14 module misread as legacy would find no PluginType and price at
    // no discount at all, so ModuleBonuses must win.
    const { slot, bonuses } = normalizeModuleBonuses(
      v14Module({ PluginType: 'Resource&Speed', PluginModulePercent: 1 })
    )
    expect(slot).toBe('Basic')
    expect(bonuses).toHaveLength(3)
    expect(bonuses.some((b) => b.value === 1)).toBe(false)
  })

  it('falls back to Specialty for a deprecated module with no slot', () => {
    // The 12 tier-ladder `*Lvl1-4` modules carry no slot tag. A build that
    // already references one still needs a slot to hang it on.
    const { slot } = normalizeModuleBonuses(
      v14Module({ ModuleSlot: undefined, IsDeprecated: true })
    )
    expect(slot).toBe('Specialty')
  })

  it('drops bonuses with an unmodelled action or effect type', () => {
    const { bonuses } = normalizeModuleBonuses(
      v14Module({
        ModuleBonuses: [
          { Action: 'ResourceCost', EffectType: 'AdditivePercent', Value: -0.1, Scope: {} },
          { Action: 'SkillGain', EffectType: 'Multiplicative', Value: 1.2, Scope: {} },
          { Action: 'CraftTime', EffectType: 'Diminishing', Value: 0.5, Scope: {} },
          { Action: 'CraftTime', EffectType: 'Multiplicative', Value: NaN, Scope: {} },
        ],
      })
    )
    expect(bonuses).toEqual([
      { action: 'ResourceCost', effectType: 'AdditivePercent', value: -0.1, skillTypes: [] },
    ])
  })

  it('accepts an explicitly empty bonus list without inventing effects', () => {
    const { bonuses } = normalizeModuleBonuses(v14Module({ ModuleBonuses: [] }))
    expect(bonuses).toEqual([])
  })
})
