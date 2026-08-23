// Types for the Housing Score optimizer: the solver's input catalog, the
// user-facing config, and the result it renders from.
//
// These live apart from housing-types.ts because that module describes the two
// reference browsers, whose row shapes are display view-models. The solver needs
// the raw game numbers instead (see CandidateFurnishing), so the two clusters
// deliberately do not share types.
import type { RoomCategory, RoomTier } from '@/types/game-data'

/** The power grids a furnishing can draw from, matching the dataset's
 * `HousingPowerType`. A furnishing needing none carries ''. */
export type PowerType = 'Heat' | 'Mechanical' | 'Electric'

/** Declaration order, which is also display order in the config panel. */
export const POWER_TYPES: readonly PowerType[] = ['Heat', 'Mechanical', 'Electric']

/**
 * Stands in for "furnishings nothing crafts" in the unlocked-skills selection —
 * flowers, torch stands, stump furniture, trophies. They need no skill to
 * obtain, but leaving them permanently in would make the skill filter quietly
 * incomplete, so the user gets an explicit entry to toggle.
 *
 * Skill row ids are UUIDv4, so the '!' prefix cannot collide with one.
 */
export const UNSKILLED_SKILL_ID = '!unskilled'

/** One placeable furnishing, reduced to what the solver needs plus the two
 * display fields the result table renders. `optimizeHousing` must never read
 * `name`/`rawName` — keeping them here is what lets the result render without a
 * second lookup pass, and test fixtures can leave them ''. */
export interface CandidateFurnishing {
  itemId: string
  /** A RoomCategory.name — categories are referenced by name, not row id. */
  categoryName: string
  /** Groups repeats within a room. '' means ungrouped, which makes every such
   * item share one group. */
  typeForRoomLimit: string
  baseValue: number
  /** In-room repeat multiplier. 1 = no penalty; each item uses its OWN value at
   * whatever position it lands in, which is why the group solve needs a DP. */
  dimMultiplier: number
  /** Every skill that can craft this. Empty when nothing crafts it. */
  skillIds: string[]
  /** '' when the furnishing needs no power. */
  powerType: PowerType | ''
  name: string
  rawName: string
}

/** Everything the solver reads, as plain arrays. Built by
 * `buildOptimizerCatalog`; `optimizeHousing` touches no store. */
export interface OptimizerCatalog {
  furnishings: CandidateFurnishing[]
  categories: RoomCategory[]
  tiers: RoomTier[]
}

/** The config panel's state. `skillIds: null` means "all", which is distinct
 * from [] ("none") — the same convention as FurnishingFilterState. */
export interface OptimizerConfig {
  tier: number
  skillIds: string[] | null
  maxFurnishingRepeats: number
  minFurnishingContribution: number
  residents: number
  maxRoomRepeat: number
  minRoomContribution: number
  power: PowerType[]
}

export const DEFAULT_OPTIMIZER_CONFIG: OptimizerConfig = {
  // Highest tier: the interesting question is what a finished house can reach.
  tier: 5,
  skillIds: null,
  maxFurnishingRepeats: 3,
  minFurnishingContribution: 0.2,
  residents: 1,
  maxRoomRepeat: 2,
  minRoomContribution: 2,
  power: ['Heat', 'Mechanical'],
}

/** `OptimizerConfig` with the synthetic Unskilled entry split back out. */
export interface OptimizerInput {
  tier: number
  /** null = every skill is unlocked. */
  skillIds: string[] | null
  includeUnskilled: boolean
  maxFurnishingRepeats: number
  minFurnishingContribution: number
  residents: number
  maxRoomRepeat: number
  minRoomContribution: number
  power: PowerType[]
}

/** A furnishing that would score exactly the same as the one placed. */
export interface PlacedAlternative {
  itemId: string
  name: string
}

export interface PlacedFurnishing {
  itemId: string
  name: string
  rawName: string
  /** Other furnishings that are mechanically identical here — same category,
   * furniture type, base value and repeat multiplier — so the player can build
   * whichever they have access to. Excludes the placed item itself. Named, not
   * just counted: "6 alternatives" is not actionable without knowing which. */
  equivalents: PlacedAlternative[]
  count: number
  /** In-room value after the repeat penalty, before any cap. */
  rawContribution: number
  /** Points this actually adds to the room's score, after the support-category
   * cap and the material soft cap. These sum to `RoomPlan.roomValue`. */
  contribution: number
}

export interface PlacedCategory {
  categoryName: string
  /** Total before the support cap. */
  rawValue: number
  /** null for the room's primary category, which is never capped. */
  cap: number | null
  cappedValue: number
  furnishings: PlacedFurnishing[]
}

export interface RoomPlan {
  /** The room's primary category, as the game's own estimator would label it. */
  categoryName: string
  /** Score of ONE copy, after the material soft cap. */
  roomValue: number
  /** Sum of the rounded per-category values, before the material soft cap. */
  rawTotal: number
  categories: PlacedCategory[]
  /** What each copy contributes at the property level, after the repeat-room
   * penalty. Length is the number of copies actually built. */
  copyContributions: number[]
}

export interface CategoryTotal {
  categoryName: string
  /** Final contribution, after the repeat-room penalty and the property cap. */
  value: number
  /** Before `capToPercentOfRestOfProperty` was applied. */
  uncappedValue: number
  capped: boolean
}

export interface OptimizerResult {
  /** XP/day each resident receives — this is the number the game adds to a
   * resident's skill rate. */
  perResident: number
  /** XP/day the household produces in total. Differs from `perResident`
   * whenever there is more than one resident. */
  houseTotal: number
  byCategory: CategoryTotal[]
  rooms: RoomPlan[]
}
