// Named progression stages for the optimizer's three "how far along am I"
// constraints: wall material tier, unlocked skills, and available power.
//
// Presets are derived, never stored. Picking one writes those three constraints;
// the active preset is recomputed from the constraints on every render, so
// hand-editing them back into a stage's shape re-activates that stage. The five
// numeric knobs (residents, repeat limits, contribution thresholds) are
// deliberately outside a preset's scope — household size and pruning thresholds
// are not a function of game stage.
import { type SkillSelectOption, UNSKILLED_SKILL_ID } from '@/lib/skill-options'

import type { OptimizerConfig, PowerType } from './housing-optimizer-types'

export type HousingPresetId = 'day0' | 'earlyGame' | 'midGame' | 'lateGame' | 'endGame'

export interface HousingPreset {
  id: HousingPresetId
  tier: number
  power: readonly PowerType[]
  /**
   * Cumulative selection tokens, or null for "every skill".
   *
   * A token is `option.rawName || option.id` — the same key
   * `parseSkillSelection` matches on, so the game's own skill names work
   * directly and the synthetic Unskilled entry rides along as its id.
   */
  skillTokens: readonly string[] | null
}

/** What each stage ADDS to the one before it. Rolled up below, so the source
 * stays readable rather than repeating 25 skill names by the last row. */
interface PresetDelta {
  id: HousingPresetId
  tier: number
  power: readonly PowerType[]
  /** null = "every skill", which ends the cumulative chain. */
  addSkills: readonly string[] | null
}

// Several of these skills craft no furnishings in the current datasets
// (Gathering, Mining, Campfire Cooking, Butchery, Basic Engineering, Milling,
// Baking, Cooking, Recycling). They still matter, and are still resolved: the
// unlocked-skills constraint walks the whole crafting tree, so a skill earns
// its place by gating an INGREDIENT of a furnishing, not only by crafting one.
// Mining unlocks no furnishing directly and gates every stone one.
const PRESET_DELTAS: readonly PresetDelta[] = [
  {
    id: 'day0',
    tier: 1,
    power: ['Heat'],
    addSkills: [
      UNSKILLED_SKILL_ID,
      'GatheringSkill',
      'MiningSkill',
      'LoggingSkill',
      'CampfireCookingSkill',
      'HuntingSkill',
    ],
  },
  {
    id: 'earlyGame',
    tier: 2,
    power: ['Heat', 'Mechanical'],
    addSkills: [
      'CarpentrySkill',
      'MasonrySkill',
      'FarmingSkill',
      'ShipwrightSkill',
      'BasicEngineeringSkill',
      'ButcherySkill',
      'TailoringSkill',
    ],
  },
  {
    id: 'midGame',
    tier: 3,
    power: ['Heat', 'Mechanical'],
    addSkills: [
      'SmeltingSkill',
      'BlacksmithSkill',
      'MillingSkill',
      'FertilizersSkill',
      'PotterySkill',
      'GlassworkingSkill',
      'PaintingSkill',
      'PaperMillingSkill',
      'BakingSkill',
      'CookingSkill',
    ],
  },
  {
    id: 'lateGame',
    tier: 4,
    power: ['Heat', 'Mechanical', 'Electric'],
    addSkills: [
      'MechanicsSkill',
      'AdvancedSmeltingSkill',
      'RecyclingSkill',
      'IndustrySkill',
      'ElectronicsSkill',
      'OilDrillingSkill',
    ],
  },
  {
    id: 'endGame',
    tier: 5,
    power: ['Heat', 'Mechanical', 'Electric'],
    addSkills: null,
  },
]

/** The stages in progression order, with each one's skills rolled up from every
 * earlier stage. */
export const HOUSING_PRESETS: readonly HousingPreset[] = (() => {
  const accumulated: string[] = []
  return PRESET_DELTAS.map(({ id, tier, power, addSkills }) => {
    if (addSkills === null) return { id, tier, power, skillTokens: null }
    accumulated.push(...addSkills)
    return { id, tier, power, skillTokens: [...accumulated] }
  })
})()

/**
 * Resolve a stage's tokens to the skill row ids the config holds.
 *
 * Tokens that no option carries are dropped, since skill sets differ between
 * game versions. That is now a narrow case: the optimizer's dropdown lists
 * every crafting skill, not just the ones that craft a furnishing.
 * A selection covering every option normalizes to null, matching what
 * `SkillMultiSelect` emits — otherwise an applied preset and a hand-made
 * identical selection would compare unequal.
 */
function resolveSkillIds(
  preset: HousingPreset,
  options: readonly SkillSelectOption[]
): string[] | null {
  if (preset.skillTokens === null) return null
  const wanted = new Set(preset.skillTokens)
  const ids = options.filter((o) => wanted.has(o.rawName || o.id)).map((o) => o.id)
  return ids.length === options.length ? null : ids
}

/**
 * The config patch that applies a stage. Always carries the `skillIds` key,
 * because `OptimizerView.onConfigChange` tests for it with `in` — null there is
 * meaningful ("all"), not "unset".
 */
export function housingPresetPatch(
  preset: HousingPreset,
  options: readonly SkillSelectOption[]
): Partial<OptimizerConfig> {
  return {
    tier: preset.tier,
    power: [...preset.power],
    skillIds: resolveSkillIds(preset, options),
  }
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const seen = new Set(a)
  return b.every((value) => seen.has(value))
}

/**
 * Which stage the current constraints correspond to, or null for a custom set.
 *
 * Compares only tier, power and skills. Stages differ by tier, so at most one
 * can ever match.
 */
export function matchHousingPreset(
  config: OptimizerConfig,
  options: readonly SkillSelectOption[]
): HousingPresetId | null {
  for (const preset of HOUSING_PRESETS) {
    if (preset.tier !== config.tier) continue
    if (!sameSet(preset.power, config.power)) continue
    const skillIds = resolveSkillIds(preset, options)
    if (skillIds === null) {
      if (config.skillIds !== null) continue
    } else if (config.skillIds === null || !sameSet(skillIds, config.skillIds)) {
      continue
    }
    return preset.id
  }
  return null
}
