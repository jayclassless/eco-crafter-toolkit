// Crop growth math for the Crop Tracker.
//
// Growth is purely time-based. The server hands every living, unblocked plant a
// per-tick increment of `tickDays / MaturityAgeDays` and scales it by the
// server's plant-growth-rate multiplier, so crossing a growth interval takes
//
//   hours(g0 -> g1) = (g1 - g0) * MaturityAgeDays * 24 / growthRateMultiplier
//
// identically for crops and trees. No biome, habitability, rainfall or soil
// term appears in the growth path — the environment affects how *much* a plant
// yields, never how fast it grows.
//
// What differs between species is which growth fraction first counts as
// harvestable, and that is what this module computes: two milestones per
// planting.
//
//   first yield — the earliest growth at which harvesting returns anything
//   full yield  — growth 1.0, where every species peaks
//
// The yield formulas below exist only to locate the first-yield threshold (a
// 1-3 crop crosses it at 1/sqrt(2), a 1-4 crop at 1/sqrt(3)). The tracker does
// not predict harvest quantities, so they stay module-private.
//
// Sources, Eco v13.0.4: `Mods/__core__/Objects/TreeObject.cs` for the tree
// gates; `Plant.Ripe` / `Plant.CalculateResourceYield` and
// `PlantEntity.CanHarvest` for the crop gates.

const HOURS_PER_MATURITY_DAY = 24
const MS_PER_HOUR = 60 * 60 * 1000

// `TreeEntity.Ripe` gates purely on the sapling stage — a tree is harvestable
// once past `TreeObject.SaplingGrowthPercent`, a constant 0.3 across species
// and versions. Below it `TryKillSapling` returns nothing.
const TREE_FIRST_YIELD_GROWTH = 0.3

// `PlantEntity.CanHarvest`: a regrowing plant with no early-pick window has to
// clear its post-harvest growth by this margin before it can be harvested again.
const REGROW_HARVEST_MARGIN = 0.1

// The subset of an Item's fields this module needs. Accepting a narrow shape
// keeps the math easy to unit-test without constructing full store rows.
export interface CropGrowth {
  maturityAgeDays?: number
  postHarvestingGrowth?: number
  pickableAtPercent?: number
  isTree?: boolean
  // Yield range of the species' primary resource (its `ResourceList[0]`), which
  // is what the ripeness gate reads. Both 0 when the dataset predates range
  // extraction; see `firstYieldGrowth`.
  primaryResourceMin?: number
  primaryResourceMax?: number
}

// The two milestones for one growth cycle, plus the growth fractions they sit
// at (the UI needs those to place a marker on the progress bar).
export interface HarvestWindow {
  firstYieldAt: Date
  maxYieldAt: Date
  firstYieldGrowth: number
  cycleStartGrowth: number
}

export function isRegrowCrop(crop: CropGrowth): boolean {
  return (crop.postHarvestingGrowth ?? 0) > 0
}

// Where a cycle begins: 0 for a fresh planting, and the post-harvest growth for
// a regrowing plant, which resumes partway up rather than from bare ground.
export function cycleStartGrowth(crop: CropGrowth, hasRegrown: boolean): number {
  return hasRegrown && isRegrowCrop(crop) ? (crop.postHarvestingGrowth ?? 0) : 0
}

// Eco's `Mathf.RoundPositively` — rounds .5 up rather than to even. Only ever
// applied to non-negative values here.
const roundHalfUp = (value: number) => Math.floor(value + 0.5)

// `YieldPercent` is a second accumulator, separate from growth: it advances by
// `envFactor * growthDelta`, where `envFactor` is the plant's habitability times
// its worst soil nutrient — the "% match" the in-game Soil Sampler prints. On
// harvest the game resets it to the post-harvest growth, which is why a regrown
// crop out-yields a first-growth one in a poor location.
function yieldPercentAt(
  crop: CropGrowth,
  growth: number,
  envFactor: number,
  hasRegrown: boolean
): number {
  const start = cycleStartGrowth(crop, hasRegrown)
  return Math.min(1, start + envFactor * Math.max(0, growth - start))
}

// `Plant.CalculateResourceYield`. Non-decreasing in `growth`, so a crop's
// maximum is always at growth 1.0.
function cropYield(min: number, max: number, growth: number, yieldPercent: number): number {
  return Math.floor((roundHalfUp((max - min) * yieldPercent) + min) * growth * growth)
}

// Smallest growth at which the primary resource yields at least one item.
//
// `cropYield` is non-decreasing in growth (both factors are non-negative and
// non-decreasing), so a bisection lands on the exact crossing. That matters:
// the thresholds are irrational for most species — 1/sqrt(2) for a 1-3 range,
// 1/sqrt(3) for 1-4 — and a fixed scan grid would round them off.
function solveYieldGate(
  crop: CropGrowth,
  min: number,
  max: number,
  envFactor: number,
  hasRegrown: boolean
): number {
  const yieldsSomething = (growth: number) =>
    cropYield(min, max, growth, yieldPercentAt(crop, growth, envFactor, hasRegrown)) >= 1
  // A zero-width range (Pineapple's 1-1) only reaches 1 at full growth.
  if (!yieldsSomething(1)) return 1
  let lo = 0 // growth 0 always yields 0
  let hi = 1
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (yieldsSomething(mid)) hi = mid
    else lo = mid
  }
  return hi
}

// The earliest growth fraction at which harvesting this plant returns anything.
//
// `envFactor` is the environment match in [0, 1]; lower values push crop
// thresholds later (a 1-2 crop moves 0.7071 -> 0.8333 at 0.6) and never affect
// trees. It is plumbed through but not yet user-facing, so it defaults to the
// optimistic case.
export function firstYieldGrowth(crop: CropGrowth, envFactor = 1, hasRegrown = false): number {
  // `TreeEntity.Ripe` overrides the crop rules outright: trees gate on the
  // sapling stage and ignore both yield ranges and the environment.
  if (crop.isTree) return TREE_FIRST_YIELD_GROWTH

  const min = crop.primaryResourceMin ?? 0
  const max = crop.primaryResourceMax ?? 0
  // Datasets extracted before ranges were captured: report "fully grown" rather
  // than inventing a threshold from data we do not have.
  if (!(max > 0)) return 1

  const yieldGate = solveYieldGate(crop, min, max, envFactor, hasRegrown)

  // `PlantEntity.CanHarvest`. An early-pick window supersedes the regrow margin;
  // plants with neither are gated on the yield alone.
  const pickAt = crop.pickableAtPercent ?? 0
  const post = crop.postHarvestingGrowth ?? 0
  const harvestGate = pickAt > 0 ? pickAt : post > 0 ? post + REGROW_HARVEST_MARGIN : 0

  return Math.min(1, Math.max(yieldGate, harvestGate))
}

// Real hours to grow from one growth fraction to another. Every duration in
// this module is a delta between two fractions — chaining multipliers instead
// (`hours * postHarvest * pickableAt`) double-counts the regrow cycle.
export function hoursBetweenGrowth(
  crop: CropGrowth,
  from: number,
  to: number,
  growthRateModifier: number
): number {
  const maturity = crop.maturityAgeDays ?? 0
  if (!(maturity > 0)) return 0
  const rate = growthRateModifier > 0 ? growthRateModifier : 1
  return (Math.max(0, to - from) * maturity * HOURS_PER_MATURITY_DAY) / rate
}

// Both harvest milestones for a planting. Returns null if the input isn't a
// crop or `plantedAtIso` is missing/invalid.
export function computeHarvestWindow(
  plantedAtIso: string,
  crop: CropGrowth,
  growthRateModifier: number,
  options: { hasRegrown?: boolean; envFactor?: number } = {}
): HarvestWindow | null {
  const plantedMs = Date.parse(plantedAtIso)
  if (Number.isNaN(plantedMs)) return null
  if (!((crop.maturityAgeDays ?? 0) > 0)) return null

  const hasRegrown = options.hasRegrown ?? false
  const envFactor = options.envFactor ?? 1
  const start = cycleStartGrowth(crop, hasRegrown)
  // A regrow cycle resumes mid-growth, so clamp to the cycle start: a threshold
  // the plant is already past is reached immediately, not in negative time.
  const first = Math.max(start, firstYieldGrowth(crop, envFactor, hasRegrown))
  const dateAt = (growth: number) =>
    new Date(plantedMs + hoursBetweenGrowth(crop, start, growth, growthRateModifier) * MS_PER_HOUR)

  return {
    firstYieldAt: dateAt(first),
    maxYieldAt: dateAt(1),
    firstYieldGrowth: first,
    cycleStartGrowth: start,
  }
}

export interface TimeUntilParts {
  days: number
  hours: number
  minutes: number
}

const UNIT_ORDER = ['days', 'hours', 'minutes'] as const

/**
 * The time remaining from `now` until `target`, as the two largest non-zero
 * units — 2d 3h 15m yields `{ days: 2, hours: 3, minutes: 0 }`, and a zero
 * middle unit is skipped rather than counted (2d 0h 5m keeps both).
 *
 * Returns null when `target` is at or before `now` (nothing left to count down
 * to). A sub-minute remainder returns all-zero parts: time is still left, but
 * no unit here can express it, so the caller supplies its own "less than a
 * minute" phrasing.
 *
 * Deliberately returns parts rather than text — unit abbreviations, their
 * order, and the separator are locale-dependent, so rendering belongs to
 * `useLocalization().formatDurationParts`.
 */
export function timeUntilParts(target: Date, now: Date): TimeUntilParts | null {
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

  const parts: TimeUntilParts = { days, hours, minutes }
  let kept = 0
  for (const unit of UNIT_ORDER) {
    if (parts[unit] === 0) continue
    if (kept === 2) parts[unit] = 0
    else kept++
  }
  return parts
}

// Growth progress in [0, 1] from planting to the given target date.
export function harvestProgress(plantedAt: Date, harvestDate: Date, now: Date): number {
  const total = harvestDate.getTime() - plantedAt.getTime()
  if (total <= 0) return 1
  const elapsed = now.getTime() - plantedAt.getTime()
  if (elapsed <= 0) return 0
  if (elapsed >= total) return 1
  return elapsed / total
}
