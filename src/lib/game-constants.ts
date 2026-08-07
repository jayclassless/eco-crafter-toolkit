// The Self Improvement skill is auto-added to every new build and is exempt
// from star-cost accounting. Identified by its raw (non-localized) game name.
export const SELF_IMPROVEMENT_SKILL_NAME = 'SelfImprovementSkill'

/**
 * `Balance.{Basic,Advanced,Modern,Specialty}ModuleStarCost` from
 * `Eco_Data/Server/Configs/Balance.eco.template` (verified against v14.0.1).
 * Charged per module installed, not per table.
 *
 * `Specialty: 0` is what makes legacy datasets contribute zero module star cost
 * with no version check — every v11–v13 module normalizes to the Specialty slot.
 *
 * ⚠️ This is one of only two game values the app hardcodes; everything else
 * comes from the extracted dataset and refreshes on re-extraction. Nothing reads
 * `Balance.eco.template`, so a future v14.x that rebalances a slot cost would
 * leave the star badge silently wrong. If the badge is ever reported as off,
 * check here first. (The other hardcoded value, `CRAFT_GARBAGE_RATIO`, arrives
 * with the garbage UI and is display-only.)
 */
export const MODULE_SLOT_STAR_COSTS = {
  Basic: 1,
  Advanced: 1,
  Modern: 1,
  Specialty: 0,
} as const

/**
 * `Balance.CraftGarbageRatio` from `Eco_Data/Server/Configs/Balance.eco.template`
 * (verified against v14.0.1 and unchanged in v14.0.2). Every craft emits this
 * fraction of each consumed ingredient's `SalvageCost` as garbage.
 *
 * It scales ONLY the salvage-derived half. A recipe's explicit `GarbageOutputs`
 * are literal quantities and must not be multiplied by it — confirmed against
 * the game UI for `AdvancedCircuitRecipe`, whose 0.1 Chemical Waste appears
 * unscaled alongside ratio-scaled scrap.
 *
 * The second of the two hardcoded game values (see `MODULE_SLOT_STAR_COSTS`),
 * but the harmless one: garbage is display-only — it stays out of `SolverOutput`
 * and out of the price signal — so a wrong ratio cannot move a price. It is also
 * inert on v11–v13, which ship no `SalvageCost` data at all.
 */
export const CRAFT_GARBAGE_RATIO = 0.08

// Secondary products that are pure waste — never participate in the default
// "split some cost off to secondaries" allocation. Identified by raw
// (non-localized) game name. They always receive 0% share by default; users
// can still override per-recipe.
//
// Version note: in v14 `TailingsItem` / `WetTailingsItem` stopped being recipe
// Products and moved into the garbage system (v13 ships them as products of 2
// and 6 recipes respectively; v14 ships them as products of none). This list
// deliberately stays flat rather than becoming dataset-aware, because it is only
// ever matched against a recipe's *product* list (see `computeAutoShares`) — so
// on a v14 dataset the two entries simply never match, and on v11–v13 they are
// still required. `SlagItem` is a real product in both.
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
