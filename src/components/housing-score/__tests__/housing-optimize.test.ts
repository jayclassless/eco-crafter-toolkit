import { describe, expect, it } from 'vitest'

import type { RoomCategory, RoomTier } from '@/types/game-data'

import { estimatePrimaryCategory, optimizeHousing, tierApply } from '../housing-optimize'
import type {
  CandidateFurnishing,
  OptimizerCatalog,
  OptimizerInput,
  PowerType,
} from '../housing-optimizer-types'

// Hand-built fixtures with values worked out by hand — no store, no dataset.

function category(name: string, over: Partial<RoomCategory> = {}): RoomCategory {
  return {
    id: name,
    datasetId: 'ds',
    name,
    color: '#000000',
    index: 0,
    affectsPropertyTypes: ['Residence'],
    supportingRoomCategoryNames: [],
    maxSupportPercentOfPrimary: 1,
    maxSupportPercentOfPrimaryPerCategory: {},
    capToPercentOfRestOfProperty: 0,
    canBeRoomCategory: true,
    supportForAnyRoomType: false,
    shouldCapFromRoomMaterials: true,
    canAutoChooseCategory: true,
    negatesValue: false,
    ...over,
  }
}

function tier(tierVal: number, softCap: number, hardCap: number): RoomTier {
  return {
    id: String(tierVal),
    datasetId: 'ds',
    tierVal,
    softCap,
    hardCap,
    diminishingReturnPercent: 0.65,
  }
}

function item(over: Partial<CandidateFurnishing> & { itemId: string }): CandidateFurnishing {
  return {
    categoryName: 'Bedroom',
    typeForRoomLimit: 'Bed',
    baseValue: 10,
    dimMultiplier: 1,
    skillIds: [],
    powerType: '',
    name: over.itemId,
    rawName: over.itemId,
    ...over,
  }
}

/** A tier with caps far above anything the fixtures reach, so the material soft
 * cap never interferes with a test that is about something else. */
const UNCAPPED = tier(9, 10_000, 20_000)

function input(over: Partial<OptimizerInput> = {}): OptimizerInput {
  return {
    tier: 9,
    skillIds: null,
    includeUnskilled: true,
    maxFurnishingRepeats: 3,
    minFurnishingContribution: 0,
    residents: 1,
    maxRoomRepeat: 1,
    minRoomContribution: 0,
    power: ['Heat', 'Mechanical', 'Electric'],
    ...over,
  }
}

function catalog(
  furnishings: CandidateFurnishing[],
  categories: RoomCategory[] = [category('Bedroom')],
  tiers: RoomTier[] = [UNCAPPED]
): OptimizerCatalog {
  return { furnishings, categories, tiers }
}

/** Total score of the single room in a result. */
function onlyRoom(result: ReturnType<typeof optimizeHousing>) {
  expect(result.rooms).toHaveLength(1)
  return result.rooms[0]
}

describe('tierApply', () => {
  it('leaves value below the soft cap untouched', () => {
    expect(tierApply(10, tier(5, 25, 50))).toBe(10)
  })

  it('decays the excess toward the hard cap without reaching it', () => {
    // 25 + min(15, 25 * (1 - 0.65^(15/25))) = 25 + 25 * 0.2277 = 30.69
    expect(tierApply(40, tier(5, 25, 50))).toBeCloseTo(30.69, 2)
    // Mathematically the excess only approaches the hard cap; in floating
    // point 0.65^399 underflows, so a huge room lands exactly on it.
    expect(tierApply(60, tier(5, 25, 50))).toBeLessThan(50)
    expect(tierApply(10_000, tier(5, 25, 50))).toBeLessThanOrEqual(50)
  })

  it('returns 0 for a valueless room', () => {
    expect(tierApply(0, tier(5, 25, 50))).toBe(0)
  })
})

describe('in-room repeat penalty', () => {
  it('charges each copy its own multiplier raised to its position', () => {
    // 10 * 0.5^0 + 10 * 0.5^1 + 10 * 0.5^2 = 17.5
    const result = optimizeHousing(
      input(),
      catalog([item({ itemId: 'bed', baseValue: 10, dimMultiplier: 0.5 })])
    )
    expect(onlyRoom(result).roomValue).toBeCloseTo(17.5, 6)
  })

  it('groups repeats by furniture type, so different types never penalize each other', () => {
    const result = optimizeHousing(
      input({ maxFurnishingRepeats: 2 }),
      catalog([
        item({ itemId: 'bed', typeForRoomLimit: 'Bed', baseValue: 10, dimMultiplier: 0.5 }),
        item({ itemId: 'dresser', typeForRoomLimit: 'Dresser', baseValue: 10, dimMultiplier: 0.5 }),
      ])
    )
    // Each group restarts at position 0: (10 + 5) * 2.
    expect(onlyRoom(result).roomValue).toBeCloseTo(30, 6)
  })

  it('prefers fewer copies of a strong item when weaker ones hold their value better', () => {
    // 3 futons + 3 straw => 18.6 + (0.32 + 0.128 + 0.0512) = 19.099
    // 2 futons + 3 straw => 18 + (0.8 + 0.32 + 0.128)      = 19.248  <- best
    // The room total is then rounded to 2dp per category, as the game does.
    // Dropping the third futon promotes every straw bed a position, which is
    // worth more than the 0.6 that third futon would have added.
    const result = optimizeHousing(
      input(),
      catalog([
        item({ itemId: 'futon', baseValue: 15, dimMultiplier: 0.2 }),
        item({ itemId: 'straw', baseValue: 5, dimMultiplier: 0.4 }),
      ])
    )
    const room = onlyRoom(result)
    expect(room.roomValue).toBeCloseTo(19.25, 6)
    const placed = room.categories[0].furnishings
    expect(placed.find((f) => f.itemId === 'futon')?.count).toBe(2)
    expect(placed.find((f) => f.itemId === 'straw')?.count).toBe(3)
  })
})

describe('support categories', () => {
  const categories = [
    category('Bedroom', { supportingRoomCategoryNames: ['Seating'] }),
    category('Seating', {
      canBeRoomCategory: false,
      maxSupportPercentOfPrimary: 0.3,
    }),
  ]

  it('caps a supporting category at a percentage of the primary, using the SUPPORTER percentage', () => {
    const result = optimizeHousing(
      input({ maxFurnishingRepeats: 1 }),
      catalog(
        [
          item({ itemId: 'bed', baseValue: 10 }),
          item({
            itemId: 'chair',
            categoryName: 'Seating',
            typeForRoomLimit: 'Chair',
            baseValue: 50,
          }),
        ],
        categories
      )
    )
    // Seating is worth 50 on its own but may only add 30% of the bedroom's 10.
    expect(onlyRoom(result).roomValue).toBeCloseTo(13, 6)
  })

  it('honours a per-primary override of the support percentage', () => {
    const overridden = [
      category('Bedroom', { supportingRoomCategoryNames: ['Seating'] }),
      category('Seating', {
        canBeRoomCategory: false,
        maxSupportPercentOfPrimary: 0.3,
        maxSupportPercentOfPrimaryPerCategory: { Bedroom: 1 },
      }),
    ]
    const result = optimizeHousing(
      input({ maxFurnishingRepeats: 1 }),
      catalog(
        [
          item({ itemId: 'bed', baseValue: 10 }),
          item({
            itemId: 'chair',
            categoryName: 'Seating',
            typeForRoomLimit: 'Chair',
            baseValue: 50,
          }),
        ],
        overridden
      )
    )
    expect(onlyRoom(result).roomValue).toBeCloseTo(20, 6)
  })

  it('lets a category that supports any room type in without being listed', () => {
    const withDecor = [
      category('Bedroom'),
      category('Decoration', {
        canBeRoomCategory: false,
        supportForAnyRoomType: true,
        maxSupportPercentOfPrimary: 0.5,
      }),
    ]
    const result = optimizeHousing(
      input({ maxFurnishingRepeats: 1 }),
      catalog(
        [
          item({ itemId: 'bed', baseValue: 10 }),
          item({
            itemId: 'rug',
            categoryName: 'Decoration',
            typeForRoomLimit: 'Rug',
            baseValue: 50,
          }),
        ],
        withDecor
      )
    )
    expect(onlyRoom(result).roomValue).toBeCloseTo(15, 6)
  })
})

describe('material soft cap', () => {
  it('is applied last, to the whole room total rather than per category', () => {
    const categories = [
      category('Bedroom', { supportingRoomCategoryNames: ['Seating'] }),
      category('Seating', { canBeRoomCategory: false, maxSupportPercentOfPrimary: 1 }),
    ]
    const result = optimizeHousing(
      input({ tier: 5, maxFurnishingRepeats: 1 }),
      catalog(
        [
          item({ itemId: 'bed', baseValue: 20 }),
          item({
            itemId: 'chair',
            categoryName: 'Seating',
            typeForRoomLimit: 'Chair',
            baseValue: 20,
          }),
        ],
        categories,
        [tier(5, 25, 50)]
      )
    )
    // Raw 40 capped once as a whole => 30.69. Capping per category would give
    // 20 + 20 = 40, which is above the room's hard cap entirely.
    expect(onlyRoom(result).roomValue).toBeCloseTo(30.69, 2)
  })

  it('skips the cap for a category that has no walls', () => {
    const outdoor = [
      category('Outdoor', { shouldCapFromRoomMaterials: false, canAutoChooseCategory: false }),
    ]
    const result = optimizeHousing(
      input({ tier: 5, maxFurnishingRepeats: 1 }),
      catalog([item({ itemId: 'fountain', categoryName: 'Outdoor', baseValue: 200 })], outdoor, [
        tier(5, 25, 50),
      ])
    )
    expect(onlyRoom(result).roomValue).toBeCloseTo(200, 6)
  })

  it('still produces a non-empty room at the lowest tier', () => {
    // A global conversion rate would drive the contribution threshold to
    // infinity here and return an empty house.
    const result = optimizeHousing(
      input({ tier: 0, minFurnishingContribution: 0.2 }),
      catalog(
        [item({ itemId: 'bed', baseValue: 10, dimMultiplier: 0.5 })],
        [category('Bedroom')],
        [tier(0, 2, 4)]
      )
    )
    const room = onlyRoom(result)
    expect(room.roomValue).toBeGreaterThan(0)
    expect(room.categories[0].furnishings.length).toBeGreaterThan(0)
  })
})

describe('excluded candidates', () => {
  it('never places a category that zeroes its room', () => {
    const categories = [category('Bedroom'), category('Industrial', { negatesValue: true })]
    const result = optimizeHousing(
      input(),
      catalog(
        [
          item({ itemId: 'bed', baseValue: 10, dimMultiplier: 0 }),
          item({ itemId: 'machine', categoryName: 'Industrial', baseValue: 100 }),
        ],
        categories
      )
    )
    expect(result.rooms.map((r) => r.categoryName)).toEqual(['Bedroom'])
    expect(onlyRoom(result).roomValue).toBeCloseTo(10, 6)
  })

  it('drops furnishings needing a power type the player has not selected', () => {
    const furnishings = [
      item({
        itemId: 'fire',
        typeForRoomLimit: 'Fireplace',
        baseValue: 10,
        powerType: 'Heat' as PowerType,
      }),
      item({
        itemId: 'lamp',
        typeForRoomLimit: 'Lights',
        baseValue: 40,
        powerType: 'Electric' as PowerType,
      }),
    ]
    const withElectric = optimizeHousing(
      input({ maxFurnishingRepeats: 1, power: ['Heat', 'Electric'] }),
      catalog(furnishings)
    )
    const heatOnly = optimizeHousing(
      input({ maxFurnishingRepeats: 1, power: ['Heat'] }),
      catalog(furnishings)
    )
    expect(onlyRoom(withElectric).roomValue).toBeCloseTo(50, 6)
    expect(onlyRoom(heatOnly).roomValue).toBeCloseTo(10, 6)
  })

  it('filters on unlocked skills, with skill-less items gated separately', () => {
    const furnishings = [
      item({
        itemId: 'crafted',
        typeForRoomLimit: 'Bed',
        baseValue: 10,
        skillIds: ['carpentry'],
        dimMultiplier: 0,
      }),
      item({
        itemId: 'flower',
        typeForRoomLimit: 'Flower',
        baseValue: 5,
        skillIds: [],
        dimMultiplier: 0,
      }),
    ]
    expect(
      onlyRoom(
        optimizeHousing(
          input({ skillIds: ['carpentry'], includeUnskilled: true }),
          catalog(furnishings)
        )
      ).roomValue
    ).toBeCloseTo(15, 6)
    expect(
      onlyRoom(
        optimizeHousing(
          input({ skillIds: ['carpentry'], includeUnskilled: false }),
          catalog(furnishings)
        )
      ).roomValue
    ).toBeCloseTo(10, 6)
    expect(
      onlyRoom(
        optimizeHousing(input({ skillIds: [], includeUnskilled: true }), catalog(furnishings))
      ).roomValue
    ).toBeCloseTo(5, 6)
  })

  it('drops any copy contributing less than the minimum', () => {
    const result = optimizeHousing(
      input({ minFurnishingContribution: 6 }),
      catalog([item({ itemId: 'bed', baseValue: 10, dimMultiplier: 0.5 })])
    )
    // 10 then 5: only the first clears a threshold of 6.
    expect(onlyRoom(result).categories[0].furnishings[0].count).toBe(1)
  })
})

describe('repeat-room penalty', () => {
  const single = () => catalog([item({ itemId: 'bed', baseValue: 10, dimMultiplier: 0 })])

  it('divides the copy index by the resident count using INTEGER division', () => {
    const contributions = (residents: number) =>
      onlyRoom(
        optimizeHousing(input({ residents, maxRoomRepeat: 4 }), single())
      ).copyContributions.map((v) => Number(v.toFixed(4)))

    // One resident: each further copy is worth a tenth of the last.
    expect(contributions(1)).toEqual([10, 1, 0.1, 0.01])
    // Two residents: the first TWO copies are full value, then the step.
    expect(contributions(2)).toEqual([10, 10, 1, 1])
    expect(contributions(3)).toEqual([10, 10, 10, 1])
  })

  it('stops adding copies once one falls below the minimum room value', () => {
    const room = onlyRoom(
      optimizeHousing(input({ maxRoomRepeat: 4, minRoomContribution: 5 }), single())
    )
    expect(room.copyContributions).toHaveLength(1)
  })

  it('allows only one copy of the synthetic outdoor room', () => {
    const outdoor = [
      category('Outdoor', { shouldCapFromRoomMaterials: false, canAutoChooseCategory: false }),
    ]
    const room = onlyRoom(
      optimizeHousing(
        input({ maxRoomRepeat: 5 }),
        catalog([item({ itemId: 'pond', categoryName: 'Outdoor', baseValue: 10 })], outdoor)
      )
    )
    expect(room.copyContributions).toHaveLength(1)
  })
})

describe('property-level category caps', () => {
  const categories = [
    category('Bedroom'),
    category('Bathroom', { capToPercentOfRestOfProperty: 0.33 }),
  ]
  const furnishings = [
    item({ itemId: 'bed', baseValue: 10, dimMultiplier: 0 }),
    item({
      itemId: 'toilet',
      categoryName: 'Bathroom',
      typeForRoomLimit: 'Toilet',
      baseValue: 100,
      dimMultiplier: 0,
    }),
  ]

  it('measures a capped category against the UNCAPPED categories only', () => {
    const result = optimizeHousing(input(), catalog(furnishings, categories))
    const bathroom = result.byCategory.find((c) => c.categoryName === 'Bathroom')
    // 33% of the bedroom's 10, not of the whole property.
    expect(bathroom?.value).toBeCloseTo(3.3, 6)
    expect(bathroom?.capped).toBe(true)
    expect(result.perResident).toBeCloseTo(13.3, 6)
  })

  it('scores zero when nothing uncapped exists to measure against', () => {
    const result = optimizeHousing(input(), catalog([furnishings[1]], categories))
    expect(result.rooms).toHaveLength(1)
    expect(result.perResident).toBe(0)
  })
})

describe('occupancy multiplier', () => {
  it('is per resident, so the household total differs from the individual share', () => {
    const single = catalog([item({ itemId: 'bed', baseValue: 10, dimMultiplier: 0 })])
    const one = optimizeHousing(input({ residents: 1 }), single)
    const two = optimizeHousing(input({ residents: 2 }), single)
    expect(one.perResident).toBeCloseTo(10, 6)
    expect(one.houseTotal).toBeCloseTo(10, 6)
    // Two roommates each get 60%, so the house yields 120%.
    expect(two.perResident).toBeCloseTo(6, 6)
    expect(two.houseTotal).toBeCloseTo(12, 6)
  })
})

describe('estimatePrimaryCategory', () => {
  const categories = [
    category('Bedroom', { supportingRoomCategoryNames: ['Living Room'] }),
    category('Living Room', { maxSupportPercentOfPrimary: 0.25 }),
  ]

  it('picks the category whose own total plus capped support is highest', () => {
    expect(
      estimatePrimaryCategory(
        new Map([
          ['Bedroom', 30],
          ['Living Room', 5],
        ]),
        categories
      )
    ).toBe('Bedroom')
  })

  it('lets an over-stuffed support category win the label', () => {
    // This is why support fills are capped: un-penalized sums decide the label.
    expect(
      estimatePrimaryCategory(
        new Map([
          ['Bedroom', 30],
          ['Living Room', 200],
        ]),
        categories
      )
    ).toBe('Living Room')
  })

  it('ignores categories that cannot be auto-chosen or do not apply', () => {
    const outdoor = [category('Outdoor', { canAutoChooseCategory: false })]
    expect(estimatePrimaryCategory(new Map([['Outdoor', 50]]), outdoor)).toBeNull()
    const cultural = [category('Cultural', { affectsPropertyTypes: ['Cultural'] })]
    expect(estimatePrimaryCategory(new Map([['Cultural', 50]]), cultural)).toBeNull()
  })
})

describe('result shape', () => {
  it('has placement contributions that sum to the room score', () => {
    const categories = [
      category('Bedroom', { supportingRoomCategoryNames: ['Seating'] }),
      category('Seating', { canBeRoomCategory: false, maxSupportPercentOfPrimary: 0.3 }),
    ]
    const room = onlyRoom(
      optimizeHousing(
        input({ tier: 5 }),
        catalog(
          [
            item({ itemId: 'bed', baseValue: 15, dimMultiplier: 0.3 }),
            item({
              itemId: 'chair',
              categoryName: 'Seating',
              typeForRoomLimit: 'Chair',
              baseValue: 9,
              dimMultiplier: 0.5,
            }),
          ],
          categories,
          [tier(5, 25, 50)]
        )
      )
    )
    const summed = room.categories
      .flatMap((c) => c.furnishings)
      .reduce((total, f) => total + f.contribution, 0)
    expect(summed).toBeCloseTo(room.roomValue, 6)
  })

  it('reports mechanically identical furnishings as alternatives to the one it picked', () => {
    const stats = { baseValue: 10, dimMultiplier: 0.1, typeForRoomLimit: 'Fireplace' }
    const room = onlyRoom(
      optimizeHousing(
        input({ maxFurnishingRepeats: 1 }),
        catalog([
          item({ itemId: 'ashlarBasalt', name: 'Ashlar Basalt Fireplace', ...stats }),
          item({ itemId: 'ashlarGneiss', name: 'Ashlar Gneiss Fireplace', ...stats }),
          item({ itemId: 'ashlarStone', name: 'Ashlar Stone Fireplace', ...stats }),
        ])
      )
    )
    const placed = room.categories[0].furnishings
    // Only one is placed; the other two are offered as swaps for it.
    expect(placed).toHaveLength(1)
    expect(placed[0].equivalents).toHaveLength(2)
    expect(placed[0].equivalents.map((a) => a.itemId)).not.toContain(placed[0].itemId)
    // Named, not just counted — a bare count gives the player nothing to act on.
    expect(placed[0].equivalents.every((a) => a.name.length > 0)).toBe(true)
  })

  it('is deterministic for the same input', () => {
    const c = catalog([
      item({ itemId: 'a', baseValue: 10, dimMultiplier: 0.5 }),
      item({ itemId: 'b', baseValue: 10, dimMultiplier: 0.5 }),
    ])
    expect(JSON.stringify(optimizeHousing(input(), c))).toBe(
      JSON.stringify(optimizeHousing(input(), c))
    )
  })

  it('returns an empty result when the dataset has no such tier', () => {
    const result = optimizeHousing(input({ tier: 42 }), catalog([item({ itemId: 'bed' })]))
    expect(result).toEqual({ perResident: 0, houseTotal: 0, byCategory: [], rooms: [] })
  })
})
