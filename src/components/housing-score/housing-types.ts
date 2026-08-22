// Shared types for the Housing Score section.

/** Which browser the section is showing. A third view (the score calculator)
 * will join this union. */
export type HousingView = 'furnishings' | 'materials'

export type HousingSortDir = 'asc' | 'desc'

export type FurnishingSortField =
  | 'name'
  | 'category'
  | 'type'
  | 'baseValue'
  | 'repeatReduction'
  | 'skill'

export type MaterialSortField = 'name' | 'tier' | 'softCap' | 'hardCap' | 'skill'

/** A room category, reduced to what the browser renders. */
export interface RoomCategoryView {
  name: string
  /** Localized label. */
  displayName: string
  /** '#RRGGBB', or '' when the category has no color of its own — consumers
   * must fall back to the default text color rather than assuming one. */
  color: string
  /** True for Industrial: one such object zeroes its whole room, which is why
   * these categories are hidden from the furnishings browser. */
  negatesValue: boolean
}

/** Soft/hard housing-value caps for one material tier. */
export interface RoomTierView {
  tier: number
  softCap: number
  hardCap: number
}

interface SkillFields {
  skillIds: string[]
  /** Localized skill names, sorted. */
  skillNames: string[]
  /** Raw game names — the key ItemIcon/SkillIcon use to load the sprite. */
  skillRawNames: string[]
  /** The joined localized names, i.e. exactly the rendered text, so sorting by
   * skill matches what the user sees. '' when nothing crafts the item. */
  skillLabel: string
}

export interface FurnishingRow extends SkillFields {
  itemId: string
  /** Localized item name. */
  name: string
  /** Raw game name — the icon key. */
  rawName: string
  categoryName: string
  categoryDisplayName: string
  categoryColor: string
  /** The furniture type that groups repeats within a room. Note the game
   * sometimes sets this to the item's own name (each flower is its own group),
   * so a type matching the name is data, not a bug.
   *
   * This is the raw English key. It is translatable in-game, but localizing it
   * would need a per-locale name row for every furnishing; unobservable while
   * the app ships only en-US, and additive to add later since the raw key is
   * the join key. */
  typeForRoomLimit: string
  baseValue: number
  /** How much value each additional copy of this furniture type loses within a
   * room: 0.6 multiplier -> 0.4. `null` means no penalty at all (multiplier 1),
   * which renders as an em-dash rather than "-0%". */
  repeatReduction: number | null
}

export interface MaterialRow extends SkillFields {
  itemId: string
  name: string
  rawName: string
  /** Tier 0 is a real tier (Mortared Basalt), not "missing". */
  tier: number
  /** null when the dataset's tier table has no row for this tier. */
  softCap: number | null
  hardCap: number | null
}

/** Multi-select filter state for the furnishings browser. `null` means "all",
 * which is distinct from an empty array ("none selected"). */
export interface FurnishingFilterState {
  categories: string[] | null
  types: string[] | null
  skillIds: string[] | null
}

export const ALL_SELECTED: FurnishingFilterState = {
  categories: null,
  types: null,
  skillIds: null,
}
