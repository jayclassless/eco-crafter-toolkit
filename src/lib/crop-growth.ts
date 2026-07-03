// Crop growth math for the Crop Tracker.
//
// Growth times are derived from the dataset's per-crop values rather than
// hardcoded. In the game, `MaturityAgeDays` is expressed in simulation days;
// at the default plant-growth rate one simulation day equals 24 real hours, so
// the real time to fully grow is `MaturityAgeDays * 24 / growthRateModifier`.
// Regenerating crops (`postHarvestingGrowth > 0`) regrow from a fraction of
// maturity after harvest, so subsequent cycles take `(1 - postHarvestingGrowth)`
// of the base time. Crops with `pickableAtPercent > 0` can be picked early, at
// that fraction of the growth time (before reaching full yield).
//
// Trees are a special case in two independent ways:
//  1. In the game a tree becomes harvestable ("Ripe") once it grows past the
//     sapling stage — `TreeObject.SaplingGrowthPercent`, a constant 0.3 across
//     species/versions — not at full `MaturityAgeDays` maturity. So a tree's
//     harvest time is only 30% of its full growth time; treating it as 100%
//     (like a food crop) over-predicts harvest by ~3.3x.
//  2. Trees respond to the server growth-rate modifier *quadratically* while
//     food crops respond linearly. In-game soil-sampler readings across growth
//     rates 1 and 2 show food full-growth time scaling as `24 / rate` but tree
//     full-growth time scaling as `24 / rate^2` (at rate 1 the two coincide, so
//     the divergence only shows once the rate leaves 1). The mechanism lives in
//     Eco's closed-source simulation; this is an empirical fit, cleanest as a
//     square.

const HOURS_PER_MATURITY_DAY = 24
const MS_PER_HOUR = 60 * 60 * 1000

// Growth fraction at which a tree becomes harvestable (past the sapling stage).
// Mirrors Eco's `TreeObject.SaplingGrowthPercent => 0.3f`.
const TREE_HARVEST_GROWTH_PERCENT = 0.3

// The subset of an Item's fields this module needs. Accepting a narrow shape
// keeps the math easy to unit-test without constructing full store rows.
export interface CropGrowth {
  maturityAgeDays?: number
  postHarvestingGrowth?: number
  pickableAtPercent?: number
  isTree?: boolean
}

export function isRegrowCrop(crop: CropGrowth): boolean {
  return (crop.postHarvestingGrowth ?? 0) > 0
}

// The growth fraction at which this plant is considered harvestable: trees at
// the sapling threshold, food crops only when fully grown.
function harvestGrowthFraction(crop: CropGrowth): number {
  return crop.isTree ? TREE_HARVEST_GROWTH_PERCENT : 1
}

// Real hours from planting to fully grown, accounting for the server growth
// rate and whether this is a regrow cycle. Returns 0 for non-crop input.
export function growthHours(
  crop: CropGrowth,
  growthRateModifier: number,
  hasRegrown: boolean
): number {
  const maturity = crop.maturityAgeDays ?? 0
  if (maturity <= 0) return 0
  const modifier = growthRateModifier > 0 ? growthRateModifier : 1
  // Trees take the growth-rate modifier quadratically, food crops linearly.
  const effectiveModifier = crop.isTree ? modifier * modifier : modifier
  let hours = (maturity * HOURS_PER_MATURITY_DAY) / effectiveModifier
  if (hasRegrown && isRegrowCrop(crop)) {
    hours *= 1 - (crop.postHarvestingGrowth ?? 0)
  }
  return hours
}

// The harvestable moment — full maturity for food crops, but the 30% sapling
// threshold for trees (see `TREE_HARVEST_GROWTH_PERCENT`). Returns null if the
// input isn't a crop or `plantedAtIso` is missing/invalid.
export function computeHarvestDate(
  plantedAtIso: string,
  crop: CropGrowth,
  growthRateModifier: number,
  hasRegrown: boolean
): Date | null {
  const plantedMs = Date.parse(plantedAtIso)
  if (Number.isNaN(plantedMs)) return null
  const hours = growthHours(crop, growthRateModifier, hasRegrown)
  if (hours <= 0) return null
  return new Date(plantedMs + hours * harvestGrowthFraction(crop) * MS_PER_HOUR)
}

// The early-pickable moment. Null when the crop has no early-pick window
// (`pickableAtPercent <= 0`) — those crops are only pickable when fully grown.
export function computePickableDate(
  plantedAtIso: string,
  crop: CropGrowth,
  growthRateModifier: number,
  hasRegrown: boolean
): Date | null {
  const pickAt = crop.pickableAtPercent ?? 0
  if (pickAt <= 0) return null
  const plantedMs = Date.parse(plantedAtIso)
  if (Number.isNaN(plantedMs)) return null
  const hours = growthHours(crop, growthRateModifier, hasRegrown)
  if (hours <= 0) return null
  return new Date(plantedMs + hours * pickAt * MS_PER_HOUR)
}

// A compact "time remaining" string from `now` until `target`, showing the two
// largest non-zero units — e.g. "2d 3h", "5h 12m", "8m", or "<1m". Returns null
// when `target` is at or before `now` (nothing left to count down to).
export function formatTimeUntil(target: Date, now: Date): string | null {
  let remaining = target.getTime() - now.getTime()
  if (remaining <= 0) return null
  const minuteMs = 60 * 1000
  const hourMs = 60 * minuteMs
  const dayMs = 24 * hourMs
  const days = Math.floor(remaining / dayMs)
  remaining -= days * dayMs
  const hours = Math.floor(remaining / hourMs)
  remaining -= hours * hourMs
  const minutes = Math.floor(remaining / minuteMs)
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  // A sub-minute remainder still counts down — show "<1m" rather than nothing.
  if (parts.length === 0) return '<1m'
  return parts.slice(0, 2).join(' ')
}

// Growth progress in [0, 1] from planting to the fully-grown date.
export function harvestProgress(plantedAt: Date, harvestDate: Date, now: Date): number {
  const total = harvestDate.getTime() - plantedAt.getTime()
  if (total <= 0) return 1
  const elapsed = now.getTime() - plantedAt.getTime()
  if (elapsed <= 0) return 0
  if (elapsed >= total) return 1
  return elapsed / total
}
