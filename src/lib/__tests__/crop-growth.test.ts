import { describe, expect, it } from 'vitest'

import {
  computeHarvestWindow,
  type CropGrowth,
  cycleStartGrowth,
  firstYieldGrowth,
  formatTimeUntil,
  harvestProgress,
  hoursBetweenGrowth,
  isRegrowCrop,
} from '../crop-growth'

// Species fixtures transcribed from Eco v13.0.4's AutoGen/Plant/*.cs. The range
// is the species' ResourceList[0] Range; trees carry one but ignore it.
const species = {
  oak: { maturityAgeDays: 7, isTree: true, primaryResourceMin: 0, primaryResourceMax: 120 },
  birch: { maturityAgeDays: 5, isTree: true, primaryResourceMin: 0, primaryResourceMax: 75 },
  cedar: { maturityAgeDays: 5, isTree: true, primaryResourceMin: 0, primaryResourceMax: 75 },
  redwood: { maturityAgeDays: 30, isTree: true, primaryResourceMin: 700, primaryResourceMax: 800 },
  wheat: { maturityAgeDays: 0.8, primaryResourceMin: 1, primaryResourceMax: 3 },
  beets: { maturityAgeDays: 0.8, primaryResourceMin: 1, primaryResourceMax: 3 },
  camas: { maturityAgeDays: 0.8, primaryResourceMin: 1, primaryResourceMax: 3 },
  corn: { maturityAgeDays: 0.8, primaryResourceMin: 1, primaryResourceMax: 3 },
  sunflower: { maturityAgeDays: 0.8, primaryResourceMin: 1, primaryResourceMax: 3 },
  rice: { maturityAgeDays: 0.8, primaryResourceMin: 1, primaryResourceMax: 4 },
  flax: { maturityAgeDays: 0.8, primaryResourceMin: 1, primaryResourceMax: 4 },
  kelp: { maturityAgeDays: 0.8, primaryResourceMin: 2, primaryResourceMax: 7 },
  // Regrowing, early-pickable crops.
  tomatoes: {
    maturityAgeDays: 1.2,
    postHarvestingGrowth: 0.5,
    pickableAtPercent: 0.8,
    primaryResourceMin: 1,
    primaryResourceMax: 3,
  },
  huckleberry: {
    maturityAgeDays: 1.2,
    postHarvestingGrowth: 0.5,
    pickableAtPercent: 0.8,
    primaryResourceMin: 1,
    primaryResourceMax: 4,
  },
  pineapple: {
    maturityAgeDays: 1.2,
    postHarvestingGrowth: 0.5,
    pickableAtPercent: 0.8,
    primaryResourceMin: 1,
    primaryResourceMax: 1,
  },
  clam: {
    maturityAgeDays: 0.8,
    postHarvestingGrowth: 0.1,
    pickableAtPercent: 0.8,
    primaryResourceMin: 1,
    primaryResourceMax: 2,
  },
  // Regrows but has no early-pick window, so it exercises the post + 0.1 gate.
  bigBluestem: {
    maturityAgeDays: 0.8,
    postHarvestingGrowth: 0.05,
    primaryResourceMin: 1,
    primaryResourceMax: 4,
  },
} satisfies Record<string, CropGrowth>

const PLANTED = '2026-01-01T00:00:00.000Z'
const HOUR_MS = 60 * 60 * 1000
const hoursAfterPlanted = (date: Date) => (date.getTime() - Date.parse(PLANTED)) / HOUR_MS

const windowOrThrow = (
  crop: CropGrowth,
  rate: number,
  options?: { hasRegrown?: boolean; envFactor?: number }
) => {
  const w = computeHarvestWindow(PLANTED, crop, rate, options)
  if (!w) throw new Error('expected a harvest window')
  return w
}

describe('isRegrowCrop', () => {
  it('is true only when postHarvestingGrowth > 0', () => {
    expect(isRegrowCrop(species.tomatoes)).toBe(true)
    expect(isRegrowCrop(species.bigBluestem)).toBe(true)
    expect(isRegrowCrop(species.wheat)).toBe(false)
    expect(isRegrowCrop({})).toBe(false)
  })
})

describe('cycleStartGrowth', () => {
  it('is 0 for a fresh planting and the post-harvest growth for a regrow', () => {
    expect(cycleStartGrowth(species.tomatoes, false)).toBe(0)
    expect(cycleStartGrowth(species.tomatoes, true)).toBe(0.5)
    expect(cycleStartGrowth(species.clam, true)).toBe(0.1)
  })

  it('ignores the regrow flag for crops that do not regrow', () => {
    expect(cycleStartGrowth(species.wheat, true)).toBe(0)
  })
})

// The regression test that would have caught the fabricated quadratic: real
// in-game Soil Sampler readings, each predicted purely as
// `(1 - maturity) * MaturityAgeDays * 24 / rate`.
describe('hoursBetweenGrowth vs in-game Soil Sampler readings', () => {
  const readings: {
    label: string
    crop: CropGrowth
    rate: number
    maturity: number
    reportedHours: number
    // Fraction of the full cycle the prediction may be off by. The sampler
    // prints maturity as a whole percent, so ~0.5% is inherent.
    tolerance?: number
  }[] = [
    { label: 'Sunflower', crop: species.sunflower, rate: 1, maturity: 0.53, reportedHours: 9.0 },
    { label: 'Tomatoes 66%', crop: species.tomatoes, rate: 1, maturity: 0.66, reportedHours: 9.6 },
    { label: 'Tomatoes 50%', crop: species.tomatoes, rate: 1, maturity: 0.5, reportedHours: 14.4 },
    { label: 'Beets', crop: species.beets, rate: 1, maturity: 0.9, reportedHours: 2.0 },
    { label: 'Camas', crop: species.camas, rate: 1, maturity: 0.76, reportedHours: 4.7 },
    // Rice reads ~2% off, consistent with a stale simulation tick rather than a
    // modelling error. Called out explicitly so it can't be "fixed" by tuning.
    {
      label: 'Rice (known stale-tick outlier)',
      crop: species.rice,
      rate: 1,
      maturity: 0.65,
      reportedHours: 7.1,
      tolerance: 0.021,
    },
    { label: 'Birch', crop: species.birch, rate: 1, maturity: 0.44, reportedHours: 67.0 },
    { label: 'Oak', crop: species.oak, rate: 1, maturity: 0.86, reportedHours: 23.6 },
    { label: 'Flax', crop: species.flax, rate: 1, maturity: 0.69, reportedHours: 6.0 },
    { label: 'Cedar', crop: species.cedar, rate: 1, maturity: 0.42, reportedHours: 69.0 },
    { label: 'Wheat @2x', crop: species.wheat, rate: 2, maturity: 0, reportedHours: 9.6 },
    { label: 'Beets @2x', crop: species.beets, rate: 2, maturity: 0, reportedHours: 9.6 },
    { label: 'Corn @2x', crop: species.corn, rate: 2, maturity: 0, reportedHours: 9.6 },
    { label: 'Clam @2x', crop: species.clam, rate: 2, maturity: 0.15, reportedHours: 8.1 },
    { label: 'Pineapple @2x', crop: species.pineapple, rate: 2, maturity: 0.5, reportedHours: 7.2 },
  ]

  it.each(readings)(
    '$label predicts the reported hours-to-max',
    ({ crop, rate, maturity, reportedHours, tolerance = 0.007 }) => {
      const predicted = hoursBetweenGrowth(crop, maturity, 1, rate)
      const fullCycle = hoursBetweenGrowth(crop, 0, 1, rate)
      expect(Math.abs(predicted - reportedHours)).toBeLessThanOrEqual(fullCycle * tolerance)
    }
  )

  it('covers readings spanning many environment matches, none of which alter timing', () => {
    // Nothing in the model consumes an environment term for timing; this asserts
    // the signature can't quietly grow one.
    expect(hoursBetweenGrowth(species.wheat, 0, 1, 1)).toBeCloseTo(19.2)
  })
})

describe('hoursBetweenGrowth', () => {
  it('scales linearly with the growth-rate modifier for crops AND trees', () => {
    // Oak: 7 days = 168h at rate 1. Trees take the modifier linearly, exactly
    // like food crops — NOT squared (which would give 42h at rate 2).
    expect(hoursBetweenGrowth(species.oak, 0, 1, 1)).toBeCloseTo(168)
    expect(hoursBetweenGrowth(species.oak, 0, 1, 2)).toBeCloseTo(84)
    expect(hoursBetweenGrowth(species.oak, 0, 1, 0.5)).toBeCloseTo(336)
    expect(hoursBetweenGrowth(species.oak, 0, 1, 2)).not.toBeCloseTo(42)
  })

  it('measures a delta between two growth fractions', () => {
    expect(hoursBetweenGrowth(species.tomatoes, 0.5, 0.8, 1)).toBeCloseTo(8.64)
    expect(hoursBetweenGrowth(species.tomatoes, 0, 1, 1)).toBeCloseTo(28.8)
  })

  it('returns 0 for a backwards or empty span', () => {
    expect(hoursBetweenGrowth(species.wheat, 0.8, 0.2, 1)).toBe(0)
    expect(hoursBetweenGrowth(species.wheat, 0.5, 0.5, 1)).toBe(0)
  })

  it('treats a non-positive modifier as 1', () => {
    expect(hoursBetweenGrowth(species.wheat, 0, 1, 0)).toBeCloseTo(19.2)
    expect(hoursBetweenGrowth(species.wheat, 0, 1, -5)).toBeCloseTo(19.2)
  })

  it('returns 0 for non-crop input', () => {
    expect(hoursBetweenGrowth({}, 0, 1, 1)).toBe(0)
    expect(hoursBetweenGrowth({ maturityAgeDays: 0 }, 0, 1, 1)).toBe(0)
  })
})

describe('firstYieldGrowth', () => {
  it('gates every tree at the 0.3 sapling threshold', () => {
    expect(firstYieldGrowth(species.oak)).toBeCloseTo(0.3)
    expect(firstYieldGrowth(species.birch)).toBeCloseTo(0.3)
    expect(firstYieldGrowth(species.redwood)).toBeCloseTo(0.3)
  })

  it('gates a 1-3 crop where its yield reaches 1, at 1/sqrt(2)', () => {
    expect(firstYieldGrowth(species.wheat)).toBeCloseTo(Math.SQRT1_2, 6)
    expect(firstYieldGrowth(species.beets)).toBeCloseTo(Math.SQRT1_2, 6)
  })

  it('gates a 1-4 crop at 1/sqrt(3)', () => {
    expect(firstYieldGrowth(species.rice)).toBeCloseTo(1 / Math.sqrt(3), 6)
    expect(firstYieldGrowth(species.flax)).toBeCloseTo(1 / Math.sqrt(3), 6)
  })

  it('gates a 2-7 crop at 0.5', () => {
    expect(firstYieldGrowth(species.kelp)).toBeCloseTo(0.5, 6)
  })

  it('gates early-pickable crops on their pick threshold when it comes later', () => {
    // Huckleberry's 1-4 range would yield at 1/sqrt(3), but CanHarvest holds it
    // back to PickableAtPercent.
    expect(firstYieldGrowth(species.huckleberry)).toBeCloseTo(0.8, 6)
    expect(firstYieldGrowth(species.tomatoes)).toBeCloseTo(0.8, 6)
  })

  it('gates a zero-width range at full growth', () => {
    // Pineapple is 1-1, so diff = 0 and the yield only reaches 1 at growth 1.0 —
    // its 80% pick window produces nothing.
    expect(firstYieldGrowth(species.pineapple)).toBe(1)
  })

  it('applies the post-harvest margin to a regrow crop with no pick window', () => {
    // BigBluestem: post 0.05 -> gate 0.15, but its 1-4 yield gate at 1/sqrt(3)
    // is later and wins.
    expect(firstYieldGrowth(species.bigBluestem)).toBeCloseTo(1 / Math.sqrt(3), 6)
    // A high floor reaches 1 at ~0.14 growth, leaving the post + 0.1 gate binding.
    const highFloor = { ...species.bigBluestem, primaryResourceMin: 50, primaryResourceMax: 60 }
    expect(firstYieldGrowth(highFloor)).toBeCloseTo(0.15, 6)
  })

  it('falls back to full growth when the dataset carries no range', () => {
    expect(firstYieldGrowth({ maturityAgeDays: 0.8 })).toBe(1)
    expect(firstYieldGrowth({ maturityAgeDays: 0.8, primaryResourceMax: 0 })).toBe(1)
  })

  it('still gates a tree at 0.3 without range data', () => {
    expect(firstYieldGrowth({ maturityAgeDays: 7, isTree: true })).toBeCloseTo(0.3)
  })

  describe('envFactor', () => {
    // A bare 1-2 crop, no pick/regrow gates, so only the yield gate is in play.
    const range1to2: CropGrowth = {
      maturityAgeDays: 0.8,
      primaryResourceMin: 1,
      primaryResourceMax: 2,
    }

    it('pushes a crop threshold later in a poor environment', () => {
      expect(firstYieldGrowth(range1to2, 1)).toBeCloseTo(Math.SQRT1_2, 6)
      // At 0.6 match the rounded yield term stays 0 until 0.6g >= 0.5.
      expect(firstYieldGrowth(range1to2, 0.6)).toBeCloseTo(5 / 6, 6)
    })

    it('never moves earlier than the perfect-match case', () => {
      for (const env of [0.4, 0.55, 0.7, 0.9]) {
        expect(firstYieldGrowth(range1to2, env)).toBeGreaterThanOrEqual(
          firstYieldGrowth(range1to2, 1) - 1e-9
        )
      }
    })

    it('leaves trees untouched at every environment match', () => {
      for (const env of [0.2, 0.5, 0.8, 1]) {
        expect(firstYieldGrowth(species.oak, env)).toBeCloseTo(0.3)
      }
    })
  })
})

describe('computeHarvestWindow', () => {
  // Section 2.2 of the plan: expected milestones for a fresh seed at a perfect
  // environment match, verified against MaturityAgeDays from the game files.
  const expected: {
    label: string
    crop: CropGrowth
    rate: number
    hasRegrown?: boolean
    first: number
    full: number
  }[] = [
    { label: 'Oak', crop: species.oak, rate: 1, first: 50.4, full: 168 },
    { label: 'Oak @2x', crop: species.oak, rate: 2, first: 25.2, full: 84 },
    { label: 'Birch', crop: species.birch, rate: 1, first: 36, full: 120 },
    { label: 'Redwood', crop: species.redwood, rate: 1, first: 216, full: 720 },
    { label: 'Wheat', crop: species.wheat, rate: 1, first: 13.58, full: 19.2 },
    { label: 'Rice', crop: species.rice, rate: 1, first: 11.09, full: 19.2 },
    { label: 'Kelp', crop: species.kelp, rate: 1, first: 9.6, full: 19.2 },
    { label: 'Tomatoes', crop: species.tomatoes, rate: 1, first: 23.04, full: 28.8 },
    { label: 'Tomatoes @2x', crop: species.tomatoes, rate: 2, first: 11.52, full: 14.4 },
    { label: 'Pineapple', crop: species.pineapple, rate: 1, first: 28.8, full: 28.8 },
    { label: 'Huckleberry', crop: species.huckleberry, rate: 1, first: 23.04, full: 28.8 },
    { label: 'Clam', crop: species.clam, rate: 1, first: 15.36, full: 19.2 },
    // Regrow cycles resume from the post-harvest growth.
    {
      label: 'Tomatoes regrow',
      crop: species.tomatoes,
      rate: 1,
      hasRegrown: true,
      first: 8.64,
      full: 14.4,
    },
    {
      label: 'Clam regrow',
      crop: species.clam,
      rate: 1,
      hasRegrown: true,
      first: 13.44,
      full: 17.28,
    },
    {
      label: 'Pineapple regrow',
      crop: species.pineapple,
      rate: 1,
      hasRegrown: true,
      first: 14.4,
      full: 14.4,
    },
  ]

  it.each(expected)(
    '$label reaches first yield at $first h and full yield at $full h',
    ({ crop, rate, hasRegrown, first, full }) => {
      const w = windowOrThrow(crop, rate, { hasRegrown })
      expect(hoursAfterPlanted(w.firstYieldAt)).toBeCloseTo(first, 1)
      expect(hoursAfterPlanted(w.maxYieldAt)).toBeCloseTo(full, 1)
    }
  )

  it('does not double-scale a regrow cycle', () => {
    // The old bug multiplied the cycle length by (1 - postHarvestingGrowth) and
    // then by pickableAtPercent again, giving 11.52h instead of 8.64h.
    const w = windowOrThrow(species.tomatoes, 1, { hasRegrown: true })
    expect(hoursAfterPlanted(w.firstYieldAt)).toBeCloseTo(8.64, 2)
    expect(hoursAfterPlanted(w.firstYieldAt)).not.toBeCloseTo(11.52, 2)
  })

  it('scales trees linearly, not quadratically', () => {
    const atRate2 = windowOrThrow(species.oak, 2)
    expect(hoursAfterPlanted(atRate2.maxYieldAt)).toBeCloseTo(84)
    expect(hoursAfterPlanted(atRate2.maxYieldAt)).not.toBeCloseTo(42)
    expect(hoursAfterPlanted(atRate2.firstYieldAt)).toBeCloseTo(25.2)
  })

  it('reports the growth fractions behind the milestones', () => {
    const oak = windowOrThrow(species.oak, 1)
    expect(oak.firstYieldGrowth).toBeCloseTo(0.3)
    expect(oak.cycleStartGrowth).toBe(0)

    const regrown = windowOrThrow(species.tomatoes, 1, { hasRegrown: true })
    expect(regrown.firstYieldGrowth).toBeCloseTo(0.8)
    expect(regrown.cycleStartGrowth).toBe(0.5)
  })

  it('collapses both milestones when first yield only arrives at full growth', () => {
    const w = windowOrThrow(species.pineapple, 1)
    expect(w.firstYieldAt.getTime()).toBe(w.maxYieldAt.getTime())
  })

  it('never places first yield before the start of a regrow cycle', () => {
    // Defensive: no shipped species regrows past its own pick threshold, but if
    // one did it would be harvestable immediately rather than at a negative
    // offset. Pick window 0.5, regrows from 0.9.
    const alreadyPast: CropGrowth = {
      maturityAgeDays: 0.8,
      postHarvestingGrowth: 0.9,
      pickableAtPercent: 0.5,
      primaryResourceMin: 20,
      primaryResourceMax: 40,
    }
    const w = windowOrThrow(alreadyPast, 1, { hasRegrown: true })
    expect(hoursAfterPlanted(w.firstYieldAt)).toBe(0)
    expect(hoursAfterPlanted(w.maxYieldAt)).toBeCloseTo(1.92)
  })

  it('defers first yield to full growth when the dataset carries no ranges', () => {
    const noRange: CropGrowth = { maturityAgeDays: 0.8 }
    const w = windowOrThrow(noRange, 1)
    expect(w.firstYieldGrowth).toBe(1)
    expect(w.firstYieldAt.getTime()).toBe(w.maxYieldAt.getTime())
  })

  it('returns null for non-crop input or an invalid date', () => {
    expect(computeHarvestWindow(PLANTED, {}, 1)).toBeNull()
    expect(computeHarvestWindow(PLANTED, { maturityAgeDays: 0 }, 1)).toBeNull()
    expect(computeHarvestWindow('not-a-date', species.wheat, 1)).toBeNull()
  })
})

describe('formatTimeUntil', () => {
  const now = new Date('2026-01-01T00:00:00.000Z')
  const after = (ms: number) => new Date(now.getTime() + ms)
  const MIN = 60 * 1000
  const HOUR = 60 * MIN
  const DAY = 24 * HOUR

  it('returns null when the target is at or before now', () => {
    expect(formatTimeUntil(now, now)).toBeNull()
    expect(formatTimeUntil(after(-HOUR), now)).toBeNull()
  })

  it('shows the two largest non-zero units', () => {
    expect(formatTimeUntil(after(2 * DAY + 3 * HOUR + 15 * MIN), now)).toBe('2d 3h')
    expect(formatTimeUntil(after(5 * HOUR + 12 * MIN), now)).toBe('5h 12m')
    expect(formatTimeUntil(after(8 * MIN), now)).toBe('8m')
  })

  it('skips a zero middle unit', () => {
    expect(formatTimeUntil(after(2 * DAY + 5 * MIN), now)).toBe('2d 5m')
  })

  it('shows "<1m" for a sub-minute remainder', () => {
    expect(formatTimeUntil(after(30 * 1000), now)).toBe('<1m')
  })
})

describe('harvestProgress', () => {
  const planted = new Date('2026-01-01T00:00:00.000Z')
  const harvest = new Date('2026-01-01T10:00:00.000Z')

  it('is 0 before planting time and 1 at/after harvest', () => {
    expect(harvestProgress(planted, harvest, planted)).toBe(0)
    expect(harvestProgress(planted, harvest, harvest)).toBe(1)
    expect(harvestProgress(planted, harvest, new Date('2026-01-02T00:00:00.000Z'))).toBe(1)
  })

  it('is the elapsed fraction mid-growth', () => {
    expect(harvestProgress(planted, harvest, new Date('2026-01-01T05:00:00.000Z'))).toBeCloseTo(0.5)
  })

  it('returns 1 for a non-positive span', () => {
    expect(harvestProgress(harvest, planted, planted)).toBe(1)
  })
})
