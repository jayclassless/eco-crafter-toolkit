import type { RoomCategory, RoomTier } from '@/types/game-data'

// The Housing Score optimizer: given a set of player constraints, work out the
// highest-scoring collection of furnishings for a Residence deed.
//
// Pure — it reads plain arrays and touches no store, so every rule below is
// directly testable. The scoring rules it reproduces are the game's own; the
// non-obvious ones are called out at the point they are implemented.
//
// Only Residence properties are modelled. Painted blocks, ground pollution and
// the architecture/culture multiplier are deliberately out of scope and held at
// their identity values.
import type {
  CandidateFurnishing,
  CategoryTotal,
  OptimizerCatalog,
  OptimizerInput,
  OptimizerResult,
  PlacedAlternative,
  PlacedCategory,
  PlacedFurnishing,
  RoomPlan,
} from './housing-optimizer-types'

const PROPERTY_TYPE = 'Residence'

/** RoomConfig.RoomCategoryDiminishingReturnRate — the base of the repeat-room
 * penalty. */
const ROOM_REPEAT_RATE = 0.1

/** RoomConfig.HousePointsMultiplierPerResidentsCount. Indexed by resident
 * count, clamped to the last entry. */
const CROWDING_FACTORS = [1, 1, 1.2, 1.15, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]

/** The threshold search settles in one or two passes; this is a safety stop, not
 * an expected bound. */
const MAX_THRESHOLD_PASSES = 12

/** The game rounds each category's contribution to 2dp before summing them. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * A room's material tier caps its value: everything below `softCap` is kept
 * whole, and the excess above it decays asymptotically toward `hardCap` without
 * ever reaching it.
 *
 * This is the game's `RoomTier.ApplyToValue`, built on
 * `DiminishingReturnExtra(d, v, range) = min(v, range * (1 - d^(v/range)))`.
 */
export function tierApply(value: number, tier: RoomTier): number {
  if (value <= 0) return 0
  if (value < tier.softCap) return value
  const range = tier.hardCap - tier.softCap
  if (range <= 0) return tier.softCap
  const excess = value - tier.softCap
  return (
    tier.softCap +
    Math.min(excess, range * (1 - Math.pow(tier.diminishingReturnPercent, excess / range)))
  )
}

/** How much of the primary category's value a supporting category may add.
 * Note this percentage belongs to the SUPPORTING category, not the primary, and
 * a per-primary override wins when present (Cultural into Outdoor is 100%). */
function supportPercent(support: RoomCategory, primaryName: string): number {
  const override = support.maxSupportPercentOfPrimaryPerCategory?.[primaryName]
  return override ?? support.maxSupportPercentOfPrimary
}

/** Categories that may contribute to a room with this primary: the ones it
 * lists, plus Decoration/Lighting which support every room type. */
function supportersOf(primary: RoomCategory, categories: RoomCategory[]): RoomCategory[] {
  return categories.filter(
    (c) =>
      c.name !== primary.name &&
      (c.supportForAnyRoomType || primary.supportingRoomCategoryNames.includes(c.name))
  )
}

/** Canonical arrangement within a furniture-type group: the game sorts by value
 * descending, and we break ties by multiplier ascending. See the tie caveat in
 * `dedupeByStats`. */
function compareForPlacement(a: CandidateFurnishing, b: CandidateFurnishing): number {
  return b.baseValue - a.baseValue || a.dimMultiplier - b.dimMultiplier
}

function statsKey(f: CandidateFurnishing): string {
  return JSON.stringify([f.categoryName, f.typeForRoomLimit, f.baseValue, f.dimMultiplier])
}

/**
 * Collapse furnishings that are mechanically identical — same category,
 * furniture type, base value and repeat multiplier — to one representative,
 * remembering the rest so the UI can offer them as alternatives. The seven
 * Ashlar fireplaces are one such group.
 *
 * Caveat: a handful of groups hold two items with equal base value but
 * DIFFERENT multipliers (Seating/Chair at 1.5 with 0.7 and 0.5). The game sorts
 * stably over an enumeration order the player cannot control, so their relative
 * arrangement is genuinely undetermined; `compareForPlacement` picks a canonical
 * one. Every affected item is a low-value tail object that the default
 * contribution threshold drops anyway.
 */
function dedupeByStats(pool: CandidateFurnishing[]): {
  representatives: CandidateFurnishing[]
  equivalents: Map<string, PlacedAlternative[]>
} {
  const groups = new Map<string, CandidateFurnishing[]>()
  for (const f of pool) {
    const key = statsKey(f)
    const bucket = groups.get(key)
    if (bucket) bucket.push(f)
    else groups.set(key, [f])
  }
  const representatives: CandidateFurnishing[] = []
  const equivalents = new Map<string, PlacedAlternative[]>()
  for (const bucket of groups.values()) {
    // Stable pick so the same catalog always yields the same plan.
    const sorted = [...bucket].sort((a, b) =>
      a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0
    )
    const [rep, ...rest] = sorted
    representatives.push(rep)
    equivalents.set(
      rep.itemId,
      rest.map((f) => ({ itemId: f.itemId, name: f.name }))
    )
  }
  return { representatives, equivalents }
}

interface PlacedCopy {
  furnishing: CandidateFurnishing
  contribution: number
}

/**
 * Best arrangement of one furniture-type group.
 *
 * Within a group the game sorts by value descending and charges the item at
 * index `i` a factor of ITS OWN multiplier raised to `i`. Because the multiplier
 * is per-item, placing fewer copies of a strong item can score better — a
 * bedroom does better with 2 Nylon Futon Beds plus 2 Wooden Straw Beds (19.12)
 * than with 3 Futons (18.92). A greedy pass misses that, so this is an exact DP
 * over (item, positions filled).
 *
 * `threshold` drops any copy whose own contribution falls below it. Since
 * contributions decay monotonically with position, hitting it once ends that
 * item.
 */
function solveGroup(
  items: CandidateFurnishing[],
  maxRepeats: number,
  threshold: number
): PlacedCopy[] {
  const maxPositions = items.length * maxRepeats
  if (maxPositions === 0) return []
  let best = new Float64Array(maxPositions + 1).fill(Number.NEGATIVE_INFINITY)
  best[0] = 0
  let choice: ({ prev: number; index: number; count: number } | null)[] = Array.from({
    length: maxPositions + 1,
  })

  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    // Carrying the arrays forward is the "use none of this item" transition.
    const nextBest = best.slice()
    const nextChoice = choice.slice()
    for (let pos = 0; pos <= maxPositions; pos++) {
      if (best[pos] === Number.NEGATIVE_INFINITY) continue
      let added = 0
      for (let count = 1; count <= maxRepeats && pos + count <= maxPositions; count++) {
        const contribution = item.baseValue * Math.pow(item.dimMultiplier, pos + count - 1)
        if (contribution < threshold) break
        added += contribution
        if (best[pos] + added > nextBest[pos + count]) {
          nextBest[pos + count] = best[pos] + added
          nextChoice[pos + count] = { prev: pos, index, count }
        }
      }
    }
    best = nextBest
    choice = nextChoice
  }

  let bestTotal = 0
  let bestPos = 0
  for (let pos = 1; pos <= maxPositions; pos++) {
    if (best[pos] > bestTotal) {
      bestTotal = best[pos]
      bestPos = pos
    }
  }

  const chosen: CandidateFurnishing[] = []
  for (let pos = bestPos; pos > 0;) {
    const step = choice[pos]
    if (!step) break
    for (let k = 0; k < step.count; k++) chosen.push(items[step.index])
    pos = step.prev
  }
  chosen.sort(compareForPlacement)
  return chosen.map((furnishing, i) => ({
    furnishing,
    contribution: furnishing.baseValue * Math.pow(furnishing.dimMultiplier, i),
  }))
}

interface CategoryFill {
  rawValue: number
  copies: PlacedCopy[]
}

/**
 * Best set of furnishings for one category, optionally stopping at `cap`.
 *
 * Filling a capped supporting category past its cap is not just wasted effort:
 * the game's category estimator sums UN-penalized values, so an over-stuffed
 * support category can win the label and re-score the whole room. Trimming is
 * position-safe because contributions decrease monotonically with position
 * inside a group, so a global sort by contribution keeps each group's prefix.
 */
function fillCategory(
  pool: CandidateFurnishing[],
  maxRepeats: number,
  threshold: number,
  cap: number | null
): CategoryFill {
  const byType = new Map<string, CandidateFurnishing[]>()
  for (const f of pool) {
    const bucket = byType.get(f.typeForRoomLimit)
    if (bucket) bucket.push(f)
    else byType.set(f.typeForRoomLimit, [f])
  }
  let copies: PlacedCopy[] = []
  let rawValue = 0
  for (const group of byType.values()) {
    const items = [...group].sort(compareForPlacement)
    const solved = solveGroup(items, maxRepeats, threshold)
    for (const copy of solved) rawValue += copy.contribution
    copies.push(...solved)
  }
  copies.sort((a, b) => b.contribution - a.contribution)
  if (cap != null && rawValue > cap) {
    const kept: PlacedCopy[] = []
    let running = 0
    for (const copy of copies) {
      if (running >= cap) break
      kept.push(copy)
      running += copy.contribution
    }
    copies = kept
    rawValue = running
  }
  return { rawValue, copies }
}

/**
 * The game's `EstimateHighestCategory`: which category a room would be labelled
 * with. It deliberately sums UN-penalized values and ignores the material cap —
 * it only picks the label, and the value is recomputed properly afterwards.
 */
export function estimatePrimaryCategory(
  rawByCategory: Map<string, number>,
  categories: RoomCategory[]
): string | null {
  let bestName: string | null = null
  let bestScore = 0
  for (const own of categories) {
    if (!own.canBeRoomCategory || !own.canAutoChooseCategory) continue
    if (!own.affectsPropertyTypes.includes(PROPERTY_TYPE)) continue
    const ownRaw = rawByCategory.get(own.name) ?? 0
    if (ownRaw <= 0) continue
    let score = ownRaw
    for (const support of supportersOf(own, categories)) {
      const raw = rawByCategory.get(support.name) ?? 0
      score += Math.min(raw, ownRaw * supportPercent(support, own.name))
    }
    if (score > bestScore) {
      bestScore = score
      bestName = own.name
    }
  }
  return bestName
}

interface RoomDraft {
  rawTotal: number
  roomValue: number
  fills: { category: RoomCategory; cap: number | null; fill: CategoryFill }[]
  copies: PlacedCopy[]
}

function buildRoom(
  primary: RoomCategory,
  byCategory: Map<string, CandidateFurnishing[]>,
  categories: RoomCategory[],
  tier: RoomTier,
  maxRepeats: number,
  threshold: number
): RoomDraft | null {
  const primaryFill = fillCategory(byCategory.get(primary.name) ?? [], maxRepeats, threshold, null)
  if (primaryFill.rawValue <= 0) return null

  const fills: RoomDraft['fills'] = [{ category: primary, cap: null, fill: primaryFill }]
  const copies: PlacedCopy[] = [...primaryFill.copies]
  let rawTotal = round2(primaryFill.rawValue)

  for (const support of supportersOf(primary, categories)) {
    const pool = byCategory.get(support.name)
    if (!pool?.length) continue
    const cap = primaryFill.rawValue * supportPercent(support, primary.name)
    const fill = fillCategory(pool, maxRepeats, threshold, cap)
    if (!fill.copies.length) continue
    rawTotal += round2(Math.min(fill.rawValue, cap))
    fills.push({ category: support, cap, fill })
    copies.push(...fill.copies)
  }

  // The material soft cap is applied LAST, to the room's whole total. Outdoor
  // rooms have no walls, so they skip it entirely.
  const roomValue = primary.shouldCapFromRoomMaterials ? tierApply(rawTotal, tier) : rawTotal
  return { rawTotal, roomValue, fills, copies }
}

/**
 * Resolve the raw per-copy threshold that corresponds to the user's
 * "minimum points a furnishing must contribute".
 *
 * The user's number is in real score, but the material soft cap compresses a
 * room hard — a tier-5 room accumulates ~114 raw points and scores ~44 — so the
 * two are far apart. A single global conversion rate is also wrong: the early
 * copies land below the soft cap where the rate is 1.0, and at low tiers a
 * global rate drives the threshold to infinity and empties the house.
 *
 * So each copy is measured against the room total as it stands when that copy is
 * added: `tierApply(running + c) - tierApply(running)`. Walk the copies in
 * descending order, cut at the first that falls short, and re-solve with that
 * copy's raw value as the new threshold. Settles in one or two passes.
 */
function solveRoom(
  primary: RoomCategory,
  byCategory: Map<string, CandidateFurnishing[]>,
  categories: RoomCategory[],
  tier: RoomTier,
  maxRepeats: number,
  minContribution: number
): RoomDraft | null {
  const capped = primary.shouldCapFromRoomMaterials
  let threshold = 0
  let draft = buildRoom(primary, byCategory, categories, tier, maxRepeats, threshold)
  for (let pass = 0; pass < MAX_THRESHOLD_PASSES && draft; pass++) {
    const ordered = [...draft.copies].sort((a, b) => b.contribution - a.contribution)
    let running = 0
    let rejectedAt: number | null = null
    // The SMALLEST contribution that cleared the bar. Using it as the next
    // threshold keeps exactly the copies that passed — setting the threshold to
    // the failing copy's own value would instead let that copy back in, since
    // the group solve keeps anything at or above the threshold.
    let weakestKept: number | null = null
    for (const copy of ordered) {
      const marginal = capped
        ? tierApply(running + copy.contribution, tier) - tierApply(running, tier)
        : copy.contribution
      if (marginal < minContribution) {
        rejectedAt = copy.contribution
        break
      }
      running += copy.contribution
      weakestKept = copy.contribution
    }
    if (rejectedAt == null) break
    // Nothing cleared the bar, so there is no room worth building.
    if (weakestKept == null) return null

    let next = weakestKept
    if (next === threshold) {
      // Two copies share this contribution but straddle the test, because the
      // running total advanced between them. A per-copy threshold cannot split
      // a tie, so raise the bar past the tied value entirely. Slightly
      // conservative — it also drops the tied copies that did pass — but it
      // keeps the promise that everything placed earns its keep, and
      // guarantees the loop makes progress.
      let above = Number.POSITIVE_INFINITY
      for (const copy of ordered) {
        if (copy.contribution > rejectedAt && copy.contribution < above) above = copy.contribution
      }
      if (!Number.isFinite(above)) return null
      next = above
    }
    threshold = next
    draft = buildRoom(primary, byCategory, categories, tier, maxRepeats, threshold)
  }
  return draft
}

/** Turn a draft into the rendered plan, scaling each furnishing's raw value into
 * real points. Two scalings apply in order — the support-category cap, then the
 * material cap — so the placements sum to the room's score rather than
 * over-crediting whatever sat in a capped category. */
function toPlacedCategories(
  draft: RoomDraft,
  equivalents: Map<string, PlacedAlternative[]>
): PlacedCategory[] {
  const roomScale = draft.rawTotal > 0 ? draft.roomValue / draft.rawTotal : 0
  return draft.fills.map(({ category, cap, fill }) => {
    const cappedValue = cap == null ? fill.rawValue : Math.min(fill.rawValue, cap)
    const categoryScale = fill.rawValue > 0 ? round2(cappedValue) / fill.rawValue : 0
    const merged = new Map<string, PlacedFurnishing>()
    for (const copy of fill.copies) {
      const existing = merged.get(copy.furnishing.itemId)
      if (existing) {
        existing.count += 1
        existing.rawContribution += copy.contribution
        existing.contribution += copy.contribution * categoryScale * roomScale
        continue
      }
      merged.set(copy.furnishing.itemId, {
        itemId: copy.furnishing.itemId,
        name: copy.furnishing.name,
        rawName: copy.furnishing.rawName,
        equivalents: equivalents.get(copy.furnishing.itemId) ?? [],
        count: 1,
        rawContribution: copy.contribution,
        contribution: copy.contribution * categoryScale * roomScale,
      })
    }
    return {
      categoryName: category.name,
      rawValue: fill.rawValue,
      cap,
      cappedValue,
      furnishings: [...merged.values()].sort((a, b) => b.contribution - a.contribution),
    }
  })
}

/** Per-resident share of the house's value. Note this is not the same number as
 * the repeat-room penalty's divisor, though both come from the resident count:
 * two roommates each receive 60%, so the house yields 120% overall. */
function occupancyMultiplier(residents: number): number {
  if (residents <= 1) return 1
  const index = Math.min(Math.max(residents, 0), CROWDING_FACTORS.length - 1)
  return (1 / residents) * CROWDING_FACTORS[index]
}

export function optimizeHousing(input: OptimizerInput, catalog: OptimizerCatalog): OptimizerResult {
  const empty: OptimizerResult = { perResident: 0, houseTotal: 0, byCategory: [], rooms: [] }
  const tier = catalog.tiers.find((t) => t.tierVal === input.tier)
  if (!tier) return empty

  const categoriesByName = new Map(catalog.categories.map((c) => [c.name, c]))
  const skills = input.skillIds ? new Set(input.skillIds) : null
  const power = new Set(input.power)

  const candidates = catalog.furnishings.filter((f) => {
    // A zero-value furnishing can never contribute, and Industrial ones zero
    // their whole room, so neither belongs in a plan.
    if (f.baseValue <= 0) return false
    if (categoriesByName.get(f.categoryName)?.negatesValue !== false) return false
    if (f.powerType && !power.has(f.powerType)) return false
    if (f.skillIds.length === 0) return input.includeUnskilled
    return !skills || f.skillIds.some((id) => skills.has(id))
  })

  const { representatives, equivalents } = dedupeByStats(candidates)
  const byCategory = new Map<string, CandidateFurnishing[]>()
  for (const f of representatives) {
    const bucket = byCategory.get(f.categoryName)
    if (bucket) bucket.push(f)
    else byCategory.set(f.categoryName, [f])
  }

  const maxRepeats = Math.max(1, Math.floor(input.maxFurnishingRepeats))
  const residents = Math.max(1, Math.floor(input.residents))
  const maxRoomRepeat = Math.max(0, Math.floor(input.maxRoomRepeat))

  const rooms: RoomPlan[] = []
  const categorySums = new Map<string, number>()

  for (const primary of catalog.categories) {
    if (!primary.canBeRoomCategory || primary.negatesValue) continue
    if (!primary.affectsPropertyTypes.includes(PROPERTY_TYPE)) continue

    const draft = solveRoom(
      primary,
      byCategory,
      catalog.categories,
      tier,
      maxRepeats,
      input.minFurnishingContribution
    )
    if (!draft || draft.roomValue <= 0) continue

    // A category that cannot be auto-chosen is only reachable as the deed's
    // synthetic outdoor room, of which there is exactly one per property.
    const isOutdoor = !primary.canAutoChooseCategory
    if (!isOutdoor) {
      // Confirm the game would actually label the room the way we built it.
      // Capping support fills normally guarantees this; bail rather than report
      // a score the player would not get.
      const rawByCategory = new Map<string, number>()
      for (const { category, fill } of draft.fills) {
        let raw = 0
        for (const copy of fill.copies) raw += copy.furnishing.baseValue
        rawByCategory.set(category.name, raw)
      }
      if (estimatePrimaryCategory(rawByCategory, catalog.categories) !== primary.name) continue
    }

    const copyLimit = isOutdoor ? Math.min(1, maxRoomRepeat) : maxRoomRepeat
    const copyContributions: number[] = []
    for (let i = 0; i < copyLimit; i++) {
      // Integer division: N residents buy N full-value rooms of a category
      // before the penalty starts compounding.
      const multiplier = Math.pow(ROOM_REPEAT_RATE, Math.floor(i / residents))
      const contribution = draft.roomValue * multiplier
      if (contribution < input.minRoomContribution) break
      copyContributions.push(contribution)
    }
    if (copyContributions.length === 0) continue

    rooms.push({
      categoryName: primary.name,
      roomValue: draft.roomValue,
      rawTotal: draft.rawTotal,
      categories: toPlacedCategories(draft, equivalents),
      copyContributions,
    })
    categorySums.set(
      primary.name,
      copyContributions.reduce((sum, v) => sum + v, 0)
    )
  }

  // Bathroom and Outdoor are measured against the UNCAPPED categories, summed
  // before any capping. A property with no uncapped category therefore scores
  // zero however much is in it.
  let uncappedTotal = 0
  for (const [name, sum] of categorySums) {
    if ((categoriesByName.get(name)?.capToPercentOfRestOfProperty ?? 0) === 0) uncappedTotal += sum
  }

  const byCategoryTotals: CategoryTotal[] = []
  let propertyValue = 0
  for (const [name, sum] of categorySums) {
    const limitPercent = categoriesByName.get(name)?.capToPercentOfRestOfProperty ?? 0
    let value = sum
    let capped = false
    if (limitPercent > 0) {
      const limit = round2(limitPercent * uncappedTotal)
      if (sum > limit) {
        value = limit
        capped = true
      }
    }
    propertyValue += value
    byCategoryTotals.push({ categoryName: name, value, uncappedValue: sum, capped })
  }
  byCategoryTotals.sort((a, b) => b.value - a.value)

  const perResident = propertyValue * occupancyMultiplier(residents)
  return {
    perResident,
    houseTotal: perResident * residents,
    byCategory: byCategoryTotals,
    rooms,
  }
}
