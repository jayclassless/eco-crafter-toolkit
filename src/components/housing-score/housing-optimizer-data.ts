// Store -> optimizer boundary: turns game data into the plain arrays
// `optimizeHousing` consumes, plus the small helpers the config panel and the
// result view need.
//
// This overlaps `buildFurnishingRows` in housing-data.ts by design rather than
// by accident. That builder produces a display row: localized strings and a
// UI-shaped `repeatReduction` (1 - multiplier), with Industrial rows already
// dropped. The solver needs the raw multipliers and the power type instead, so
// merging the two would leak every future solver need into the furnishings
// table's virtual-scrolled row type.
import type { Store } from 'tinybase'

import { getGameDataIndexes } from '@/lib/game-data-indexes'
import { computeReachableItemIds } from '@/lib/item-reachability'
import { type SkillSelectOption, UNSKILLED_SKILL_ID } from '@/lib/skill-options'

import {
  type CandidateFurnishing,
  type OptimizerCatalog,
  type OptimizerConfig,
  type OptimizerInput,
  POWER_TYPES,
  type PowerType,
} from './housing-optimizer-types'

/** Resolves an entity id to its localized name (the `useLocalizedName` hook's
 * `getName`). Passed in rather than hooked, so these stay pure. */
type GetName = (entityType: string, entityId: string) => string

const POWER_TYPE_SET = new Set<string>(POWER_TYPES)

export function buildOptimizerCatalog(
  store: Store,
  datasetId: string,
  getName: GetName
): OptimizerCatalog {
  const {
    housingItemIdsByDatasetId,
    roomCategoriesByDatasetId,
    roomTiersByDatasetId,
    skillIdsByItemId,
  } = getGameDataIndexes(store)

  const furnishings: CandidateFurnishing[] = []
  for (const itemId of housingItemIdsByDatasetId.get(datasetId) ?? []) {
    const row = store.getRow('items', itemId)
    const rawName = (row.name as string) ?? ''
    const powerType = (row.housingPowerType as string) ?? ''
    furnishings.push({
      itemId,
      categoryName: (row.housingCategory as string) ?? '',
      typeForRoomLimit: (row.housingTypeForRoomLimit as string) ?? '',
      baseValue: (row.housingBaseValue as number) ?? 0,
      // 1 means no repeat penalty; 0 would instead zero every repeat.
      dimMultiplier: (row.housingDiminishingReturnMultiplier as number) ?? 1,
      skillIds: skillIdsByItemId.get(itemId) ?? [],
      // An unrecognized grid is treated as "needs no power" rather than making
      // the furnishing unbuildable; import validation rejects those upstream.
      powerType: POWER_TYPE_SET.has(powerType) ? (powerType as PowerType) : '',
      // The localized index may not be warm on first paint, hence the fallback.
      name: getName('item', itemId) || rawName,
      rawName,
    })
  }

  return {
    furnishings,
    // Deliberately unfiltered by `affectsPropertyTypes`: that flag gates which
    // category may be a room's PRIMARY, but Cultural furniture still supports
    // Living Room and Outdoor on a Residence. Filtering here would silently
    // delete real score.
    categories: roomCategoriesByDatasetId.get(datasetId) ?? [],
    tiers: roomTiersByDatasetId.get(datasetId) ?? [],
  }
}

/** TinyBase cells hold scalars only, so the power selection round-trips through
 * a comma-joined string. '' means "no power available" and must never decode to
 * "all" — an empty grid is a legitimate, meaningful choice. */
export function serializePowerTypes(values: readonly PowerType[]): string {
  return POWER_TYPES.filter((t) => values.includes(t)).join(',')
}

export function parsePowerTypes(raw: string): PowerType[] {
  if (!raw) return []
  const seen = new Set(raw.split(','))
  return POWER_TYPES.filter((t) => seen.has(t))
}

/** Sentinel for "every skill unlocked", which is distinct from an empty
 * selection. Skill names never contain it. */
const ALL_SKILLS = '*'

/**
 * Encode the unlocked-skill selection for the ui store.
 *
 * Stored as the game's own skill NAMES, not row ids: ids are per-dataset uuids,
 * so a persisted id set would resolve to nothing after switching datasets and
 * silently exclude every furnishing. Names are stable across game versions.
 */
export function serializeSkillSelection(
  skillIds: string[] | null,
  options: readonly SkillSelectOption[]
): string {
  if (skillIds === null) return ALL_SKILLS
  const nameById = new Map(options.map((o) => [o.id, o.rawName || o.id]))
  return skillIds
    .map((id) => nameById.get(id))
    .filter((name): name is string => !!name)
    .join(',')
}

export function parseSkillSelection(
  raw: string,
  options: readonly SkillSelectOption[]
): string[] | null {
  if (raw === ALL_SKILLS) return null
  if (raw === '') return []
  const wanted = new Set(raw.split(','))
  const ids = options.filter((o) => wanted.has(o.rawName || o.id)).map((o) => o.id)
  // A stored selection that resolves to nothing is stale — a dataset that names
  // its skills differently — so fall back to "all" rather than handing the
  // solver an empty pool and reporting a zero-score house.
  return ids.length > 0 ? ids : null
}

/**
 * Everything the selected skills make obtainable, as the full crafting closure.
 *
 * Returns null for "no constraint" both when every skill is unlocked and when
 * the dataset has no recipes to walk — an empty graph would otherwise report
 * nothing as reachable and blank the whole result.
 *
 * The synthetic Unskilled entry is dropped before the closure runs: it is a
 * display toggle over furnishings nothing crafts, not a skill, and skill-less
 * recipes are usable regardless of it (they require no skill by definition).
 */
export function reachableItemIdsForSkills(
  store: Store,
  datasetId: string,
  skillIds: string[] | null
): Set<string> | null {
  if (skillIds === null) return null
  const graph = getGameDataIndexes(store).reachabilityGraphByDatasetId.get(datasetId)
  if (!graph) return null
  const unlocked = new Set(skillIds.filter((id) => id !== UNSKILLED_SKILL_ID))
  return computeReachableItemIds(graph, unlocked)
}

/** Split the synthetic Unskilled entry back out, and keep the tier honest
 * against datasets whose tier table differs from the persisted choice. */
export function toOptimizerInput(
  config: OptimizerConfig,
  catalog: OptimizerCatalog,
  reachableItemIds: ReadonlySet<string> | null
): OptimizerInput {
  const skillIds = config.skillIds
  const tiers = catalog.tiers.map((t) => t.tierVal)
  const tier = tiers.includes(config.tier) ? config.tier : (tiers[tiers.length - 1] ?? 0)
  return {
    tier,
    reachableItemIds,
    // null means "everything unlocked", which includes the unskilled items.
    includeUnskilled: skillIds ? skillIds.includes(UNSKILLED_SKILL_ID) : true,
    maxFurnishingRepeats: config.maxFurnishingRepeats,
    minFurnishingContribution: config.minFurnishingContribution,
    residents: config.residents,
    maxRoomRepeat: config.maxRoomRepeat,
    minRoomContribution: config.minRoomContribution,
    power: config.power,
  }
}
