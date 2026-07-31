import { describe, expect, it } from 'vitest'

import {
  caloriesPerAction,
  computeGathering,
  damagePerHit,
  strategyAt,
  type GatheringInputs,
  type GatheringTalentState,
} from '../gathering-calc'

const NO_TALENTS: GatheringTalentState = {
  efficiency: false,
  efficiencyValue: 0.8,
  strength: false,
  strengthValue: 1,
  empower: false,
  empowerValue: 1,
  luckyBreak: false,
  deadeye: false,
  arrowRecovery: false,
  arrowRecoveryValue: 0.5,
}

/** A steel pickaxe on granite at Mining 0, no clothing, $20/1000 cal. */
function rockInputs(overrides: Partial<GatheringInputs> = {}): GatheringInputs {
  return {
    target: {
      kind: 'rock',
      hardness: 3,
      itemsPerBlock: 4,
      maxItemsPerBlock: 4,
      extraHitsPerBlock: 0.75,
    },
    tool: { kind: 'Pickaxe', baseCalories: 20, baseDamage: 3, damageUsesToolCurve: false },
    skillLevel: 0,
    talents: { ...NO_TALENTS },
    clothingCalorieMultiplier: 1,
    calorieCost: 20,
    caloriesPerRubblePickup: 1,
    ...overrides,
  }
}

function shovelInputs(overrides: Partial<GatheringInputs> = {}): GatheringInputs {
  return {
    target: { kind: 'excavatable' },
    tool: { kind: 'Shovel', baseCalories: 20, baseDamage: 1, damageUsesToolCurve: true },
    skillLevel: 0,
    talents: { ...NO_TALENTS },
    clothingCalorieMultiplier: 1,
    calorieCost: 20,
    ...overrides,
  }
}

/** A steel axe on an oak at Logging 0. */
function logInputs(overrides: Partial<GatheringInputs> = {}): GatheringInputs {
  return {
    target: { kind: 'log', treeHealth: 30 },
    tool: { kind: 'Axe', baseCalories: 20, baseDamage: 2, damageUsesToolCurve: true },
    skillLevel: 0,
    talents: { ...NO_TALENTS },
    clothingCalorieMultiplier: 1,
    calorieCost: 20,
    logsPerTree: 60,
    ...overrides,
  }
}

/** A wooden bow on an elk at Hunting 0. */
function carcassInputs(overrides: Partial<GatheringInputs> = {}): GatheringInputs {
  return {
    target: { kind: 'carcass', animalHealth: 8.5 },
    tool: { kind: 'Bow', baseCalories: 20, baseDamage: 1, damageUsesToolCurve: true },
    skillLevel: 0,
    talents: { ...NO_TALENTS },
    clothingCalorieMultiplier: 1,
    calorieCost: 20,
    hitRate: 1,
    arrowPrice: 0.5,
    ...overrides,
  }
}

describe('strategyAt', () => {
  it('clamps past the end of the curve, matching GetAtIndexOrLast', () => {
    // Skills can exceed level 7 on modded servers without breaking the server.
    expect(strategyAt([1, 0.9, 0.8], 2, 1)).toBe(0.8)
    expect(strategyAt([1, 0.9, 0.8], 99, 1)).toBe(0.8)
  })

  it('clamps a negative level to zero and falls back on an empty curve', () => {
    expect(strategyAt([1, 0.9], -3, 1)).toBe(1)
    expect(strategyAt([], 4, 0.5)).toBe(0.5)
  })
})

describe('caloriesPerAction', () => {
  it('scales by the tool curve, not the skill strategy', () => {
    // ToolItem's calorie curve is {1, .95, .93, .9, .88, .85, .83, .8}, so a
    // maxed skill saves 20% — NOT the 50% the skill's own laborReducePercent
    // would give. Getting this wrong overstates every gathered price.
    expect(caloriesPerAction(rockInputs({ skillLevel: 0 }))).toBe(20)
    expect(caloriesPerAction(rockInputs({ skillLevel: 2 }))).toBe(18.6)
    expect(caloriesPerAction(rockInputs({ skillLevel: 7 }))).toBe(16)
  })

  it('applies the efficiency talent and clothing on top', () => {
    // Builder Boots (-0.3) + Work Backpack (-0.1) occupy different slots and
    // stack: 1 - 0.3 - 0.1 = 0.6.
    const inputs = rockInputs({
      skillLevel: 7,
      talents: { ...NO_TALENTS, efficiency: true },
      clothingCalorieMultiplier: 0.6,
    })
    expect(caloriesPerAction(inputs)).toBeCloseTo(16 * 0.8 * 0.6, 10)
  })

  it('ignores an efficiency talent the tool cannot have', () => {
    // Shovels and bows name the abstract ToolEfficiencyTalent, which is never
    // granted, so the store gives them no talent id and the flag stays false.
    expect(caloriesPerAction(shovelInputs({ skillLevel: 5 }))).toBe(17)
  })
})

describe('damagePerHit', () => {
  it('leaves pickaxe damage flat across skill levels', () => {
    // Pickaxes override damage with ConstantValue(tier), so the tool damage
    // curve never applies to them.
    expect(damagePerHit(rockInputs({ skillLevel: 0 }))).toBe(3)
    expect(damagePerHit(rockInputs({ skillLevel: 7 }))).toBe(3)
  })

  it('scales axe damage by the tool curve', () => {
    // Axes use CreateDamageValue(), so {1, 1.4, ... 2.0} applies: a steel axe
    // hits for 4 at Logging 7.
    expect(damagePerHit(logInputs({ skillLevel: 0 }))).toBe(2)
    expect(damagePerHit(logInputs({ skillLevel: 1 }))).toBe(2.8)
    expect(damagePerHit(logInputs({ skillLevel: 7 }))).toBe(4)
  })

  it('adds strength and empower flatly', () => {
    expect(damagePerHit(rockInputs({ talents: { ...NO_TALENTS, strength: true } }))).toBe(4)
    expect(damagePerHit(rockInputs({ talents: { ...NO_TALENTS, empower: true } }))).toBe(4)
    expect(
      damagePerHit(rockInputs({ talents: { ...NO_TALENTS, strength: true, empower: true } }))
    ).toBe(5)
  })
})

describe('computeGathering — rock', () => {
  it('splits a block across its rubble', () => {
    const r = computeGathering(rockInputs())!
    // 1 swing to break (hardness 3 / damage 3) + 0.75 expected split swings,
    // at 20 cal each, over 4 items; plus 1 cal per rubble picked up.
    expect(r.caloriesPerItem).toBeCloseTo((1.75 * 20) / 4 + 1, 10)
    expect(r.itemsPerSource).toBe(4)
    expect(r.pricePerItem).toBeCloseTo(r.caloriesPerItem * 0.02, 10)
  })

  it('needs more swings for a harder rock and fewer with strength', () => {
    const basalt = {
      kind: 'rock' as const,
      hardness: 5,
      itemsPerBlock: 4,
      maxItemsPerBlock: 4,
      extraHitsPerBlock: 0.75,
    }
    const stonePick = {
      kind: 'Pickaxe',
      baseCalories: 20,
      baseDamage: 1,
      damageUsesToolCurve: false,
    }
    const plain = computeGathering(rockInputs({ target: basalt, tool: stonePick }))!
    const strong = computeGathering(
      rockInputs({ target: basalt, tool: stonePick, talents: { ...NO_TALENTS, strength: true } })
    )!
    expect(plain.lines.find((l) => l.key === 'break')!.count).toBe(5)
    // damage 2 => ceil(5/2) = 3 swings
    expect(strong.lines.find((l) => l.key === 'break')!.count).toBe(3)
  })

  it('drops the splitting swings under Lucky Break', () => {
    // The talent forces the 4-chunk rubble set, which needs no splitting — it
    // saves calories rather than adding yield.
    const r = computeGathering(rockInputs({ talents: { ...NO_TALENTS, luckyBreak: true } }))!
    expect(r.lines.find((l) => l.key === 'split')).toBeUndefined()
    expect(r.itemsPerSource).toBe(4)
    expect(r.caloriesPerItem).toBeCloseTo(20 / 4 + 1, 10)
  })

  it('applies clothing to rubble pickup as well as swings', () => {
    // Pickup bypasses the skill curve and the efficiency talent, but still runs
    // through Stomach.BurnCalories(useCalorieModifier: true).
    const r = computeGathering(rockInputs({ clothingCalorieMultiplier: 0.6 }))!
    expect(r.lines.find((l) => l.key === 'pickup')!.calories).toBeCloseTo(0.6, 10)
  })

  it('honours a custom rubble pickup cost', () => {
    const r = computeGathering(rockInputs({ caloriesPerRubblePickup: 5 }))!
    expect(r.lines.find((l) => l.key === 'pickup')!.calories).toBe(5)
  })

  it('returns null for a rock with no rubble yield', () => {
    // v11's Slag is Minable(4) with no rubble file; dividing by its yield
    // would produce Infinity.
    expect(
      computeGathering(
        rockInputs({ target: { kind: 'rock', hardness: 4, itemsPerBlock: 0, maxItemsPerBlock: 0 } })
      )
    ).toBeNull()
  })
})

describe('computeGathering — excavatable', () => {
  it('costs the same per item on every shovel tier', () => {
    // MaxTake is the carried stack cap, not a per-swing yield. Reading it as a
    // yield would make a Modern Shovel look 10x cheaper than a Wooden one.
    const tiers = [1, 2, 3, 4].map(() => computeGathering(shovelInputs())!.pricePerItem)
    expect(new Set(tiers).size).toBe(1)
  })

  it('caps Self Improvement savings at level 5', () => {
    // The shovel calorie skill is Self Improvement, but the curve applied is
    // still ToolItem's, which keeps improving to level 7.
    expect(computeGathering(shovelInputs({ skillLevel: 5 }))!.caloriesPerItem).toBe(17)
    expect(computeGathering(shovelInputs({ skillLevel: 7 }))!.caloriesPerItem).toBe(16)
  })

  it('ignores damage entirely', () => {
    // Shovels declare CreateDamageValue(1, SelfImprovementSkill, ...), and that
    // skill's additive array holds stomach calories {0,0,250,500,...}. Digging
    // must never consult damage, or a stray additive rule would run wild.
    const flat = computeGathering(
      shovelInputs({
        tool: { kind: 'Shovel', baseCalories: 20, baseDamage: 1, damageUsesToolCurve: false },
      })
    )!
    const curved = computeGathering(shovelInputs())!
    expect(flat.pricePerItem).toBe(curved.pricePerItem)
  })
})

describe('computeGathering — log', () => {
  it('counts felling swings from trunk health and slices from the pickup cap', () => {
    const r = computeGathering(logInputs())!
    // Steel axe (damage 2) fells a 30 HP oak in 15 swings. Slicing is NOT
    // damage-gated and NOT per log: the felled trunk only has to be cut until
    // each piece yields <= 5 logs, so 60 logs is 12 pieces = 11 cuts.
    expect(r.lines.find((l) => l.key === 'fell')!.count).toBe(15)
    expect(r.lines.find((l) => l.key === 'slice')!.count).toBe(11)
    expect(r.caloriesPerItem).toBeCloseTo((26 * 20) / 60, 10)
  })

  it('reports per-tree calories alongside the per-log share', () => {
    // The per-log share of felling is a small fraction, which on its own reads
    // as though felling were nearly free. The per-source figure is the one a
    // player can count against the game.
    const r = computeGathering(logInputs())!
    const fell = r.lines.find((l) => l.key === 'fell')!
    expect(fell.caloriesPerSource).toBeCloseTo(300, 10)
    expect(fell.calories).toBeCloseTo(5, 10)
  })

  it('needs no slicing when the whole trunk fits in one pickup', () => {
    const r = computeGathering(logInputs({ logsPerTree: 5 }))!
    expect(r.lines.find((l) => l.key === 'slice')).toBeUndefined()
    expect(r.caloriesPerItem).toBeCloseTo((15 * 20) / 5, 10)
  })

  it('makes the felling share dominate for a low log count', () => {
    const one = computeGathering(logInputs({ logsPerTree: 1 }))!
    const many = computeGathering(logInputs({ logsPerTree: 100 }))!
    expect(one.caloriesPerItem).toBeGreaterThan(many.caloriesPerItem)
    expect(one.caloriesPerItem).toBeCloseTo(15 * 20, 10)
  })

  it('fells faster with a chainsaw but slices the same', () => {
    // Slicing costs one swing per cut regardless of damage, so a better axe
    // only helps with felling.
    const r = computeGathering(
      logInputs({
        tool: { kind: 'Axe', baseCalories: 20, baseDamage: 15, damageUsesToolCurve: true },
      })
    )!
    expect(r.lines.find((l) => l.key === 'fell')!.count).toBe(2)
    expect(r.lines.find((l) => l.key === 'slice')!.count).toBe(11)
  })

  it('matches an in-game spruce felled with an iron axe', () => {
    // Spruce: 15 trunk HP, 0-75 logs. Iron axe (1.5 base) at Logging 3 hits for
    // round(1.5 x 1.6) = 2.4, so ceil(15 / 2.4) = 7 swings to fell — inside the
    // 7-11 swings observed in game.
    const r = computeGathering(
      logInputs({
        target: { kind: 'log', treeHealth: 15 },
        tool: { kind: 'Axe', baseCalories: 20, baseDamage: 1.5, damageUsesToolCurve: true },
        skillLevel: 3,
        talents: { ...NO_TALENTS, efficiency: true },
        logsPerTree: 75,
      })
    )!
    expect(r.damagePerHit).toBe(2.4)
    expect(r.caloriesPerAction).toBeCloseTo(14.4, 10) // 20 x 0.9 x 0.8
    const fell = r.lines.find((l) => l.key === 'fell')!
    expect(fell.count).toBe(7)
    expect(fell.caloriesPerSource).toBeCloseTo(100.8, 6)
    expect(r.lines.find((l) => l.key === 'slice')!.count).toBe(14)
    expect(r.caloriesPerItem).toBeCloseTo((21 * 14.4) / 75, 6)
  })

  it('returns null without a logs-per-tree estimate', () => {
    expect(computeGathering(logInputs({ logsPerTree: 0 }))).toBeNull()
    expect(computeGathering(logInputs({ logsPerTree: undefined }))).toBeNull()
  })
})

describe('computeGathering — carcass', () => {
  it('counts arrows from health and damage', () => {
    // Elk 8.5 HP, wooden bow damage 1 => 9 arrows.
    const r = computeGathering(carcassInputs())!
    expect(r.lines.find((l) => l.key === 'shots')!.count).toBe(9)
    expect(r.caloriesPerItem).toBe(9 * 20)
    expect(r.consumableCostPerItem).toBeCloseTo(9 * 0.5, 10)
  })

  it('lets skill level and Power Shot cut the arrow count', () => {
    // Hunting 7 doubles bow damage via the tool curve (1 -> 2), and Power Shot
    // adds another flat point.
    expect(computeGathering(carcassInputs({ skillLevel: 7 }))!.lines[0].count).toBe(5)
    expect(
      computeGathering(
        carcassInputs({ skillLevel: 7, talents: { ...NO_TALENTS, strength: true } })
      )!.lines[0].count
    ).toBe(3)
  })

  it('stacks headshots with Deadeye', () => {
    const body = computeGathering(carcassInputs())!
    const head = computeGathering(carcassInputs({ headshot: true }))!
    const deadeye = computeGathering(
      carcassInputs({ headshot: true, talents: { ...NO_TALENTS, deadeye: true } })
    )!
    expect(body.lines[0].count).toBe(9) // ceil(8.5 / 1)
    expect(head.lines[0].count).toBe(6) // ceil(8.5 / 1.5)
    expect(deadeye.lines[0].count).toBe(5) // ceil(8.5 / 2)
  })

  it('charges misses for both calories and arrows', () => {
    const r = computeGathering(carcassInputs({ hitRate: 0.5 }))!
    expect(r.lines.find((l) => l.key === 'shots')!.count).toBe(18)
    expect(r.caloriesPerItem).toBe(18 * 20)
    expect(r.lines.find((l) => l.key === 'arrows')!.count).toBe(18)
  })

  it('recovers arrows from hits only, never from misses', () => {
    // Recovery applies to arrows lodged in the harvested animal, so it scales
    // with the 9 that landed, not the 18 fired.
    const r = computeGathering(
      carcassInputs({ hitRate: 0.5, talents: { ...NO_TALENTS, arrowRecovery: true } })
    )!
    expect(r.lines.find((l) => l.key === 'shots')!.count).toBe(18)
    expect(r.lines.find((l) => l.key === 'arrows')!.count).toBe(18 - 4.5)
  })

  it('returns null for an impossible hit rate', () => {
    expect(computeGathering(carcassInputs({ hitRate: 0 }))).toBeNull()
    expect(computeGathering(carcassInputs({ hitRate: 1.5 }))).toBeNull()
  })
})

describe('computeGathering — totals', () => {
  it('converts calories at the solver rate', () => {
    // solver.ts uses laborAmount * calorieCost / 1000; gathering must match.
    const r = computeGathering(shovelInputs({ calorieCost: 20 }))!
    expect(r.calorieCostPerItem).toBeCloseTo(r.caloriesPerItem * 0.02, 10)
  })

  it('keeps the lines summing to the totals for every kind', () => {
    const cases = [rockInputs(), shovelInputs(), logInputs(), carcassInputs()]
    for (const inputs of cases) {
      const r = computeGathering(inputs)!
      const calories = r.lines.reduce((s, l) => s + l.calories, 0)
      const cost = r.lines.reduce((s, l) => s + l.cost, 0)
      expect(calories).toBeCloseTo(r.caloriesPerItem, 10)
      expect(cost).toBeCloseTo(r.pricePerItem, 10)
      expect(r.calorieCostPerItem + r.consumableCostPerItem).toBeCloseTo(r.pricePerItem, 10)
    }
  })

  it('reports no consumable cost outside hunting', () => {
    for (const inputs of [rockInputs(), shovelInputs(), logInputs()]) {
      expect(computeGathering(inputs)!.consumableCostPerItem).toBe(0)
    }
  })
})
