import {
  BOW_HEADSHOT_MULTIPLIER_DEADEYE_LEGACY,
  BOW_HEADSHOT_MULTIPLIER_LEGACY,
  CALORIES_PER_RUBBLE_PICKUP,
  MAX_TRUNK_PICKUP_SIZE,
  POWER_SHOT_BONUS_APPLIED_FIRST,
  TOOL_CALORIE_STRATEGY,
  TOOL_DAMAGE_STRATEGY,
} from './game-constants'

/**
 * Cost of acquiring a raw material from the world, in calories and then in
 * currency via the build's $/1000 cal figure.
 *
 * The one that trips people up: a tool's calorie and damage values are NOT
 * scaled by the named skill's own MultiplicativeStrategy (the
 * `laborReducePercent` array used for crafting labor). They use fixed,
 * tool-wide curves, and the skill only decides which level indexes them.
 *
 * Tool durability is deliberately out of scope. The one place it leaks into the
 * real game is `ToolItem.DurabilityCalorieMultiplier`, which is 5x on a fully
 * broken tool and 1x otherwise; we always assume the latter.
 */

export type GatheringKind = 'rock' | 'excavatable' | 'log' | 'carcass'

export interface GatheringTarget {
  kind: GatheringKind
  /** rock: `[Minable(N)]` hardness of the source block. */
  hardness?: number
  /** rock: pickupable rubble a block breaks into. */
  itemsPerBlock?: number
  /** rock: yield when MiningLuckyBreakTalent forces the max-chunk set. */
  maxItemsPerBlock?: number
  /** rock: expected extra swings to split MinableRubble chunks. */
  extraHitsPerBlock?: number
  /** log: swings to fell the trunk are amortized over `logsPerTree`. */
  treeHealth?: number
  /** carcass: the species' health. */
  animalHealth?: number
}

export interface GatheringTool {
  kind: string
  baseCalories: number
  baseDamage: number
  /** True when the C# used `CreateDamageValue()`, so the tool damage curve
   * scales base damage by skill level. Pickaxes use `ConstantValue()` and are
   * flat; axes and bows are not. */
  damageUsesToolCurve: boolean
}

/**
 * How the installed dataset's bow damage works.
 *
 * The engine rewrote this in v14.1: Deadeye and Power Shot stopped being plain
 * talent values and became bonuses run through the shared bonus pipeline. Both
 * shapes still ship, because the app supports v11-v14 datasets and the older
 * maths remain correct for the older ones.
 *
 * Dataset-derived and never user-toggled, so it is an input rather than part of
 * `GatheringTalentState` (which is the dialog's mutable state).
 */
export type BowDamageModel =
  | {
      /** v11 - v14.0.x: one of two fixed multipliers, chosen by Deadeye. */
      era: 'legacy'
      headshotMultiplier: number
      headshotMultiplierDeadeye: number
    }
  | {
      /** v14.1+: bonuses. The pipeline applies EVERY bonus matching the action
       * and tool, with no per-talent isolation — holding one talent does not
       * stop the other's bonus from taking part. What each guard decides is
       * only WHETHER a given value is transformed at all. */
      era: 'bonus'
      headshotMultiplier: number
      /** Deadeye's additive bonus. */
      deadeyeAdditive: number
      /** Power Shot's multiplicative bonus. */
      powerShotMultiplicative: number
    }

/** Used when a dataset predates `GatheringConstants`; such a dataset is always
 * pre-v14.1, so the legacy maths are the right assumption. */
export const LEGACY_BOW_DAMAGE_MODEL: BowDamageModel = {
  era: 'legacy',
  headshotMultiplier: BOW_HEADSHOT_MULTIPLIER_LEGACY,
  headshotMultiplierDeadeye: BOW_HEADSHOT_MULTIPLIER_DEADEYE_LEGACY,
}

export interface GatheringTalentState {
  /** Multiplies calories, e.g. 0.8 for Mining/Logging Tool Efficiency. Never
   * available for shovels or bows, whose C# names an abstract talent that is
   * never granted. */
  efficiency: boolean
  efficiencyValue: number
  /** The tool's strength talent. Adds flat damage on every version for axes and
   * pickaxes; for bows it added a flat point through v14.0.x and became a
   * damage MULTIPLIER in v14.1 (see `BowDamageModel`), at which point
   * `strengthValue` reads 0 and the multiplier carries the effect. */
  strength: boolean
  strengthValue: number
  /** BlacksmithEmpowerTalent: +1 damage to axes and pickaxes. */
  empower: boolean
  empowerValue: number
  /** rock: MiningLuckyBreakTalent forces the max-chunk rubble set, which
   * removes the rubble-splitting swings rather than adding yield. */
  luckyBreak: boolean
  /** carcass: HuntingDeadeyeTalent raises the headshot multiplier. How much
   * depends on the dataset's era — see `BowDamageModel`. */
  deadeye: boolean
  /** carcass: HuntingArrowRecoveryTalent recovers a fraction of the arrows
   * lodged in the animal (misses are never recoverable). */
  arrowRecovery: boolean
  arrowRecoveryValue: number
}

export interface GatheringInputs {
  target: GatheringTarget
  tool: GatheringTool
  /** The user's level in the tool's calorie skill. */
  skillLevel: number
  talents: GatheringTalentState
  /** `1 + sum of equipped UserStatType.CalorieRate`. Applies to every calorie
   * burn, including rubble pickup. */
  clothingCalorieMultiplier: number
  /** $ per 1000 calories — the same figure and convention the solver uses. */
  calorieCost: number
  /** rock: calories per rubble picked up. 1 in the shipped game versions, but
   * user-editable since it is a compiled constant rather than dataset data. */
  caloriesPerRubblePickup?: number
  /** carcass: how this dataset's bow damage works. Defaults to the pre-v14.1
   * maths, which is what a dataset without `GatheringConstants` describes. */
  bow?: BowDamageModel
  /** log: the piece size a felled trunk must be sliced to. Dataset-driven;
   * falls back to the built-in constant. */
  maxTrunkPickupSize?: number
  /** log: how many logs one tree yields, over which felling is amortized. */
  logsPerTree?: number
  /** carcass: fraction of shots that connect. Misses still burn a shot, an
   * arrow and the calories. */
  hitRate?: number
  /** carcass: aim for the head (exact for a pure strategy; a blended rate
   * would be wrong, because ceil() does not commute with expectation). */
  headshot?: boolean
  /** carcass: unit price of an arrow, from the solver. */
  arrowPrice?: number
}

/** One row of the cost breakdown. Every field is per one gathered item, so the
 * lines sum exactly to the totals. */
interface GatheringLine {
  key: 'break' | 'split' | 'pickup' | 'fell' | 'slice' | 'dig' | 'shots' | 'arrows'
  /** Actions per source (block / tree / animal) — the figure a player can check
   * against the game. Fractional only where the game itself averages, e.g. the
   * expected rubble-splitting swings. */
  count: number
  /** Calories per source. */
  caloriesPerSource: number
  /** Calories per gathered item, i.e. `caloriesPerSource / itemsPerSource`. */
  calories: number
  /** Cost per gathered item. */
  cost: number
}

export interface GatheringResult {
  caloriesPerAction: number
  damagePerHit: number
  /** Items yielded per block / tree / animal. */
  itemsPerSource: number
  caloriesPerItem: number
  calorieCostPerItem: number
  /** Arrows; zero for the other three kinds. */
  consumableCostPerItem: number
  pricePerItem: number
  lines: GatheringLine[]
}

/** Reads a skill-indexed curve, clamping past the end the way Eco's
 * `MultiplicativeStrategy` does via `GetAtIndexOrLast`. */
export function strategyAt(values: readonly number[], level: number, fallback: number): number {
  if (values.length === 0) return fallback
  const idx = Math.min(Math.max(Math.trunc(level), 0), values.length - 1)
  return values[idx] ?? fallback
}

// Eco rounds each level's value to 2dp when it precomputes the curve
// (SkillModifiedValue.Init -> MultiplicativeStrategy.ModifiedValue), so a
// 20-calorie tool at level 2 is exactly 18.6, not 18.599999999999998.
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function caloriesPerAction(inputs: GatheringInputs): number {
  const { tool, talents, skillLevel, clothingCalorieMultiplier } = inputs
  const scaled = round2(tool.baseCalories * strategyAt(TOOL_CALORIE_STRATEGY, skillLevel, 1))
  const efficiency = talents.efficiency ? talents.efficiencyValue : 1
  return scaled * efficiency * clothingCalorieMultiplier
}

/** The tool's own damage, before any talent. */
function toolBaseDamage(inputs: GatheringInputs): number {
  const { tool, skillLevel } = inputs
  return tool.damageUsesToolCurve
    ? round2(tool.baseDamage * strategyAt(TOOL_DAMAGE_STRATEGY, skillLevel, 1))
    : tool.baseDamage
}

/**
 * A bow's body damage and headshot multiplier.
 *
 * Returned together because from v14.1 they are not independent: the same
 * ordered bonus list feeds both, so a headshot is not a fixed multiple of a body
 * shot.
 *
 * The asymmetry below is deliberate and reproduces the engine — do NOT
 * "symmetrize" it. Body damage is transformed only when Power Shot is held and
 * the headshot multiplier only when Deadeye is held, so holding Deadeye ALONE
 * adds nothing to body damage even though its bonus is additive. Holding both
 * makes each transform apply both bonuses.
 */
function bowDamage(inputs: GatheringInputs): {
  bodyDamage: number
  headshotMultiplier: number
} {
  const { talents } = inputs
  const model = inputs.bow ?? LEGACY_BOW_DAMAGE_MODEL
  // The bow's damage value sums the skill curve with its strength talent. That
  // term is present in both eras; from v14.1 the talent's own value is 0 and the
  // effect moved into the multiplicative bonus below, so keeping the sum here
  // covers both and stays right if a future version restores the flat point.
  const base = toolBaseDamage(inputs) + (talents.strength ? talents.strengthValue : 0)

  if (model.era === 'legacy') {
    return {
      bodyDamage: base,
      headshotMultiplier: talents.deadeye
        ? model.headshotMultiplierDeadeye
        : model.headshotMultiplier,
    }
  }

  const applyBonuses = (value: number): number => {
    let v = value
    if (POWER_SHOT_BONUS_APPLIED_FIRST) {
      if (talents.strength) v *= model.powerShotMultiplicative
      if (talents.deadeye) v += model.deadeyeAdditive
    } else {
      if (talents.deadeye) v += model.deadeyeAdditive
      if (talents.strength) v *= model.powerShotMultiplicative
    }
    return v
  }

  return {
    bodyDamage: talents.strength ? applyBonuses(base) : base,
    headshotMultiplier: talents.deadeye
      ? applyBonuses(model.headshotMultiplier)
      : model.headshotMultiplier,
  }
}

export function damagePerHit(inputs: GatheringInputs): number {
  // Bows run their own pipeline, and can never carry Empower — the game scopes
  // that talent to pickaxes and axes.
  if (inputs.tool.kind === 'Bow') return bowDamage(inputs).bodyDamage
  const { talents } = inputs
  const strength = talents.strength ? talents.strengthValue : 0
  const empower = talents.empower ? talents.empowerValue : 0
  return toolBaseDamage(inputs) + strength + empower
}

/** Swings to destroy something with `health` hit points. */
function swingsFor(health: number, damage: number): number {
  return Math.ceil(health / damage)
}

/** Builds a line from per-source figures, splitting them across the yield. */
function line(
  key: GatheringLine['key'],
  count: number,
  caloriesPerSource: number,
  itemsPerSource: number,
  calorieCost: number
): GatheringLine {
  const calories = caloriesPerSource / itemsPerSource
  return { key, count, caloriesPerSource, calories, cost: (calories * calorieCost) / 1000 }
}

/**
 * Cost to gather one unit of `target`. Returns null when the inputs can't
 * produce a meaningful number — a rock with no rubble yield (v11's Slag), a
 * tool that does no damage, or a log with no logs-per-tree estimate — so
 * callers surface "not available" rather than Infinity or NaN.
 */
export function computeGathering(inputs: GatheringInputs): GatheringResult | null {
  const { target, talents, calorieCost } = inputs
  const calPerAction = caloriesPerAction(inputs)
  const dmg = damagePerHit(inputs)
  if (!(calPerAction >= 0) || !Number.isFinite(calPerAction)) return null

  const lines: GatheringLine[] = []
  let itemsPerSource = 1

  switch (target.kind) {
    case 'rock': {
      const hardness = target.hardness ?? 0
      const perBlock = talents.luckyBreak
        ? (target.maxItemsPerBlock ?? target.itemsPerBlock ?? 0)
        : (target.itemsPerBlock ?? 0)
      if (!(hardness > 0) || !(perBlock > 0) || !(dmg > 0)) return null
      itemsPerSource = perBlock

      const breakSwings = swingsFor(hardness, dmg)
      // Lucky Break forces the rubble set that needs no splitting, so it saves
      // swings rather than adding yield.
      const splitSwings = talents.luckyBreak ? 0 : (target.extraHitsPerBlock ?? 0)
      const pickupEach = inputs.caloriesPerRubblePickup ?? CALORIES_PER_RUBBLE_PICKUP

      lines.push(line('break', breakSwings, breakSwings * calPerAction, perBlock, calorieCost))
      if (splitSwings > 0) {
        lines.push(line('split', splitSwings, splitSwings * calPerAction, perBlock, calorieCost))
      }
      // Picking rubble up is not a tool action: it bypasses the skill curve and
      // the efficiency talent, but still goes through Stomach.BurnCalories, so
      // the clothing modifier does apply.
      lines.push(
        line(
          'pickup',
          perBlock,
          perBlock * pickupEach * inputs.clothingCalorieMultiplier,
          perBlock,
          calorieCost
        )
      )
      break
    }

    case 'excavatable': {
      // One dig destroys one block and yields one item. MaxTake is the carried
      // stack cap, not a per-swing yield, so every shovel tier costs the same
      // per item and damage never enters the calculation.
      lines.push(line('dig', 1, calPerAction, 1, calorieCost))
      break
    }

    case 'log': {
      const treeHealth = target.treeHealth ?? 0
      const logsPerTree = inputs.logsPerTree ?? 0
      if (!(treeHealth > 0) || !(logsPerTree > 0) || !(dmg > 0)) return null
      itemsPerSource = logsPerTree

      const fellSwings = swingsFor(treeHealth, dmg)
      // Slicing is not damage-gated and is not per log: the felled trunk only
      // has to be cut until every piece yields at most MAX_TRUNK_PICKUP_SIZE
      // logs, and n pieces take n-1 cuts. A tree small enough to carry whole
      // needs no cuts at all.
      const maxTrunkPickup = inputs.maxTrunkPickupSize ?? MAX_TRUNK_PICKUP_SIZE
      const sliceSwings = Math.max(0, Math.ceil(logsPerTree / maxTrunkPickup) - 1)

      lines.push(line('fell', fellSwings, fellSwings * calPerAction, logsPerTree, calorieCost))
      if (sliceSwings > 0) {
        lines.push(line('slice', sliceSwings, sliceSwings * calPerAction, logsPerTree, calorieCost))
      }
      // Picking a trunk piece up costs nothing — TreeEntity's pickup path never
      // burns calories, unlike rubble.
      break
    }

    case 'carcass': {
      const health = target.animalHealth ?? 0
      const hitRate = inputs.hitRate ?? 1
      if (!(health > 0) || !(dmg > 0) || !(hitRate > 0) || hitRate > 1) return null

      const { bodyDamage, headshotMultiplier } = bowDamage(inputs)
      const arrowsToKill = swingsFor(
        health,
        inputs.headshot ? bodyDamage * headshotMultiplier : bodyDamage
      )
      const shots = arrowsToKill / hitRate
      // Recovery only applies to arrows lodged in the harvested animal, so it
      // scales with hits landed, never with total shots fired.
      const recovered = talents.arrowRecovery ? talents.arrowRecoveryValue * arrowsToKill : 0
      const netArrows = Math.max(0, shots - recovered)

      lines.push(line('shots', shots, shots * calPerAction, 1, calorieCost))
      lines.push({
        key: 'arrows',
        count: netArrows,
        caloriesPerSource: 0,
        calories: 0,
        cost: netArrows * (inputs.arrowPrice ?? 0),
      })
      break
    }
  }

  const caloriesPerItem = lines.reduce((sum, l) => sum + l.calories, 0)
  const pricePerItem = lines.reduce((sum, l) => sum + l.cost, 0)
  const consumableCostPerItem = lines
    .filter((l) => l.calories === 0)
    .reduce((sum, l) => sum + l.cost, 0)

  return {
    caloriesPerAction: calPerAction,
    damagePerHit: dmg,
    itemsPerSource,
    caloriesPerItem,
    calorieCostPerItem: pricePerItem - consumableCostPerItem,
    consumableCostPerItem,
    pricePerItem,
    lines,
  }
}
