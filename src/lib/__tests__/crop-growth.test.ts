import { describe, expect, it } from 'vitest'

import {
  computeHarvestDate,
  computePickableDate,
  growthHours,
  harvestProgress,
  isRegrowCrop,
} from '../crop-growth'

// Reference values from the game files: non-regen crops have MaturityAgeDays
// 0.8 (-> 19.2h at default rate); regen crops have 1.2 (-> 28.8h), regrow from
// 50% (PostHarvestingGrowth 0.5 -> 14.4h), and are pickable at 80%.
const nonRegen = { maturityAgeDays: 0.8, postHarvestingGrowth: 0, pickableAtPercent: 0 }
const regen = { maturityAgeDays: 1.2, postHarvestingGrowth: 0.5, pickableAtPercent: 0.8 }

const PLANTED = '2026-01-01T00:00:00.000Z'
const hoursAfterPlanted = (date: Date | null) => {
  if (!date) throw new Error('expected a date')
  return (date.getTime() - Date.parse(PLANTED)) / (60 * 60 * 1000)
}

describe('isRegrowCrop', () => {
  it('is true only when postHarvestingGrowth > 0', () => {
    expect(isRegrowCrop(regen)).toBe(true)
    expect(isRegrowCrop(nonRegen)).toBe(false)
    expect(isRegrowCrop({})).toBe(false)
  })
})

describe('growthHours', () => {
  it('matches the reference buckets at default rate', () => {
    expect(growthHours(nonRegen, 1, false)).toBeCloseTo(19.2)
    expect(growthHours(regen, 1, false)).toBeCloseTo(28.8)
  })

  it('halves the time on a regrow cycle for regen crops', () => {
    expect(growthHours(regen, 1, true)).toBeCloseTo(14.4)
  })

  it('ignores the regrow flag for non-regen crops', () => {
    expect(growthHours(nonRegen, 1, true)).toBeCloseTo(19.2)
  })

  it('scales inversely with the growth-rate modifier', () => {
    expect(growthHours(nonRegen, 2, false)).toBeCloseTo(9.6)
  })

  it('treats a non-positive modifier as 1', () => {
    expect(growthHours(nonRegen, 0, false)).toBeCloseTo(19.2)
    expect(growthHours(nonRegen, -5, false)).toBeCloseTo(19.2)
  })

  it('returns 0 for non-crop input', () => {
    expect(growthHours({}, 1, false)).toBe(0)
    expect(growthHours({ maturityAgeDays: 0 }, 1, false)).toBe(0)
  })
})

describe('computeHarvestDate', () => {
  it('offsets the planted time by the full growth duration', () => {
    expect(hoursAfterPlanted(computeHarvestDate(PLANTED, nonRegen, 1, false))).toBeCloseTo(19.2)
    expect(hoursAfterPlanted(computeHarvestDate(PLANTED, regen, 1, true))).toBeCloseTo(14.4)
  })

  it('returns null for non-crop input or an invalid date', () => {
    expect(computeHarvestDate(PLANTED, {}, 1, false)).toBeNull()
    expect(computeHarvestDate('not-a-date', nonRegen, 1, false)).toBeNull()
  })
})

describe('computePickableDate', () => {
  it('is null when the crop has no early-pick window', () => {
    expect(computePickableDate(PLANTED, nonRegen, 1, false)).toBeNull()
  })

  it('is pickableAtPercent of the growth time for regen crops', () => {
    // 28.8h * 0.8 = 23.04h on the first cycle.
    expect(hoursAfterPlanted(computePickableDate(PLANTED, regen, 1, false))).toBeCloseTo(23.04)
    // On a regrow cycle: 14.4h * 0.8 = 11.52h.
    expect(hoursAfterPlanted(computePickableDate(PLANTED, regen, 1, true))).toBeCloseTo(11.52)
  })

  it('returns null for an invalid date', () => {
    expect(computePickableDate('nope', regen, 1, false)).toBeNull()
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
