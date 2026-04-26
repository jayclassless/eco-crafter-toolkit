// The Self Improvement skill is auto-added to every new build and is exempt
// from star-cost accounting. Identified by its raw (non-localized) game name.
export const SELF_IMPROVEMENT_SKILL_NAME = 'SelfImprovementSkill'

// Secondary products that are pure waste — never participate in the default
// "split some cost off to secondaries" allocation. Identified by raw
// (non-localized) game name. They always receive 0% share by default; users
// can still override per-recipe.
export const ZERO_SHARE_SECONDARY_ITEM_NAMES = new Set([
  'SlagItem',
  'TailingsItem',
  'WetTailingsItem',
])
