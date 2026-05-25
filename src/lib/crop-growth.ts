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

const HOURS_PER_MATURITY_DAY = 24
const MS_PER_HOUR = 60 * 60 * 1000

// The subset of an Item's fields this module needs. Accepting a narrow shape
// keeps the math easy to unit-test without constructing full store rows.
export interface CropGrowth {
  maturityAgeDays?: number
  postHarvestingGrowth?: number
  pickableAtPercent?: number
}

export function isRegrowCrop(crop: CropGrowth): boolean {
  return (crop.postHarvestingGrowth ?? 0) > 0
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
  let hours = (maturity * HOURS_PER_MATURITY_DAY) / modifier
  if (hasRegrown && isRegrowCrop(crop)) {
    hours *= 1 - (crop.postHarvestingGrowth ?? 0)
  }
  return hours
}

// The fully-grown / full-yield moment. Returns null if the input isn't a crop
// or `plantedAtIso` is missing/invalid.
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
  return new Date(plantedMs + hours * MS_PER_HOUR)
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

// Growth progress in [0, 1] from planting to the fully-grown date.
export function harvestProgress(plantedAt: Date, harvestDate: Date, now: Date): number {
  const total = harvestDate.getTime() - plantedAt.getTime()
  if (total <= 0) return 1
  const elapsed = now.getTime() - plantedAt.getTime()
  if (elapsed <= 0) return 0
  if (elapsed >= total) return 1
  return elapsed / total
}
