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

// Secondary products that are reusable containers/tools returned to the user
// after being consumed upstream (e.g. a Barrel that carried the Petroleum a
// recipe consumes). When one of these is produced as a non-primary product it
// defaults to reintegrated — its value is credited against the recipe cost
// rather than treated as a sellable co-product. Identified by raw
// (non-localized) game name; curated, not auto-derived. Users can still
// override per-recipe. See `computeReintegratedProductIds`.
export const AUTO_REINTEGRATE_SECONDARY_ITEM_NAMES = new Set(['BarrelItem'])

// ---------------------------------------------------------------------------
// The critical, counter-intuitive part: `CreateCalorieValue`/`CreateDamageValue`
// do NOT use the named skill's own MultiplicativeStrategy (the
// `laborReducePercent` array we ship, {1, .8, ... .5}). They use these two fixed
// tool-wide curves; the skill only supplies WHICH LEVEL indexes the array. So a
// maxed Mining skill cuts pickaxe calories by 20%, not 50%.
// ---------------------------------------------------------------------------

/** `ToolItem.calorieMultiplicativeStrategy`. Indexed by the user's level in the
 * tool's calorie skill; levels past the end clamp to the last entry. */
export const TOOL_CALORIE_STRATEGY = [1, 0.95, 0.93, 0.9, 0.88, 0.85, 0.83, 0.8]

/** `ToolItem.damageMultiplicativeStrategy`. Applies only to tools whose damage
 * came from `CreateDamageValue()` — pickaxes use `ConstantValue()` and get no
 * level scaling at all. */
export const TOOL_DAMAGE_STRATEGY = [1, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2]

/** `AtomicActions.CaloriesBurntToPickUpRubble`. Charged once per rubble object
 * picked up, so a 4-rubble block costs 4 before the CalorieRate modifier.
 * MiningSweepingHandsTalent does not reduce this — it batches the pickups into
 * one action pack but still increments the per-rubble counter. */
export const CALORIES_PER_RUBBLE_PICKUP = 1

/** `TreeEntity.MaxTrunkPickupSize`. A felled trunk must be sliced until every
 * piece yields at most this many logs before any of it can be picked up, so it
 * sets the number of slicing swings: `ceil(logsPerTree / 5) - 1`.
 *
 * Slicing is NOT damage-gated — `TreeEntity.TrySliceTrunk` performs the cut in a
 * post-effect with no health check, so one swing is always one slice regardless
 * of axe damage. (`TreeSpecies.LogHealth` looks like it should govern this, but
 * nothing in the game ever reads it.) */
export const MAX_TRUNK_PICKUP_SIZE = 5

/** Talent that grants +1 flat damage to axes and pickaxes via
 * `BonusAction.UseTool`. The only UseTool bonus in the shipped datasets. */
export const EMPOWER_TALENT_NAME = 'BlacksmithEmpowerTalent'

/** Tool kinds whose damage `BlacksmithEmpowerTalent` boosts. */
export const EMPOWER_TOOL_KINDS = new Set(['Pickaxe', 'Axe'])
