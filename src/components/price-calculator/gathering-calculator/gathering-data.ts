import type { Store } from 'tinybase'

import { type Compare, compareKeys } from '@/lib/collator'
import {
  BOW_HEADSHOT_MULTIPLIER_BONUS_ERA,
  BOW_HEADSHOT_MULTIPLIER_DEADEYE_LEGACY,
  BOW_HEADSHOT_MULTIPLIER_LEGACY,
  EMPOWER_TALENT_NAME,
  EMPOWER_TOOL_KINDS,
  MAX_TRUNK_PICKUP_SIZE,
} from '@/lib/game-constants'
import { getGameDataIndexes } from '@/lib/game-data-indexes'
import type {
  BowDamageModel,
  GatheringKind,
  GatheringTalentState,
  GatheringTarget,
  GatheringTool,
} from '@/lib/gathering-calc'

/** Kinds of tool that can gather each kind of target. Rock drills are absent
 * on purpose — `DrillItem` only prospects and never breaks a block, so the
 * extractor doesn't emit them. */
const TOOL_KIND_BY_TARGET: Record<GatheringKind, string> = {
  rock: 'Pickaxe',
  excavatable: 'Shovel',
  log: 'Axe',
  carcass: 'Bow',
}

/** Talents that apply to one gathering kind rather than to a tool. Resolved by
 * raw game name, following the `SELF_IMPROVEMENT_SKILL_NAME` precedent. */
const LUCKY_BREAK_TALENT_NAME = 'MiningLuckyBreakTalent'
const DEADEYE_TALENT_NAME = 'HuntingDeadeyeTalent'
const ARROW_RECOVERY_TALENT_NAME = 'HuntingArrowRecoveryTalent'
const POWER_SHOT_TALENT_NAME = 'HuntingPowerShotTalent'

/** One tree species behind a log item. A log can have several (Redwood and
 * Old-Growth Redwood both yield Redwood Log). */
export interface GatheringSpeciesOption {
  id: string
  name: string
  treeHealth: number
  logsPerTreeMin: number
  logsPerTreeMax: number
}

export interface GatheringOption {
  itemId: string
  kind: GatheringKind
  name: string
  rawName: string
  target: GatheringTarget
  /** Logs only. Present with at least one entry; a picker is only worth showing
   * when there is more than one. */
  species?: GatheringSpeciesOption[]
}

export interface GatheringToolOption {
  itemId: string
  name: string
  rawName: string
  kind: string
  tier: number
  tool: GatheringTool
  calorieSkillId: string
  efficiencyTalentId: string
  strengthTalentId: string
}

export interface GatheringClothingOption {
  itemId: string
  name: string
  rawName: string
  calorieRate: number
}

export interface GatheringCatalog {
  options: GatheringOption[]
  byItemId: Map<string, GatheringOption>
  tools: GatheringToolOption[]
  clothing: GatheringClothingOption[]
  /** Dataset-wide values the calculation needs. Not per-option, but built from
   * the same pass and invalidated on the same memo. */
  constants: { bow: BowDamageModel; maxTrunkPickupSize: number }
}

type GetNameFn = (entityType: string, entityId: string) => string

/**
 * Everything the Gathering Calculator can offer, from one pass over `items`
 * plus the two gathering tables. Cheap enough to run on dialog open (the same
 * cost profile as the production planner's catalog build), so it is not cached.
 *
 * An empty catalog means the installed dataset predates gathering extraction —
 * the dialog surfaces that rather than rendering zeros.
 */
export function buildGatheringCatalog(
  gameDataStore: Store,
  datasetId: string,
  getName: GetNameFn,
  compare: Compare
): GatheringCatalog {
  const options: GatheringOption[] = []
  const clothing: GatheringClothingOption[] = []

  // Species grouped by the log item they yield, so a log surfaces as one
  // option carrying every species that produces it.
  const speciesByLogItem = new Map<string, GatheringSpeciesOption[]>()
  for (const speciesId of gameDataStore.getRowIds('treeSpecies')) {
    const row = gameDataStore.getRow('treeSpecies', speciesId)
    if (row.datasetId !== datasetId) continue
    const logItemId = row.logItemId as string
    if (!logItemId) continue
    const list = speciesByLogItem.get(logItemId) ?? []
    list.push({
      id: speciesId,
      name: getName('treeSpecies', speciesId) || (row.name as string),
      treeHealth: row.treeHealth as number,
      logsPerTreeMin: row.logsPerTreeMin as number,
      logsPerTreeMax: row.logsPerTreeMax as number,
    })
    speciesByLogItem.set(logItemId, list)
  }

  for (const itemId of gameDataStore.getRowIds('items')) {
    const row = gameDataStore.getRow('items', itemId)
    if (row.datasetId !== datasetId || row.isTag) continue
    const rawName = row.name as string
    const name = getName('item', itemId) || rawName

    const rate = (row.clothingCalorieRate as number) ?? 0
    if (rate !== 0) clothing.push({ itemId, name, rawName, calorieRate: rate })

    const hardness = (row.minableHardness as number) ?? 0
    const itemsPerBlock = (row.rubbleItemsPerBlock as number) ?? 0
    const animalHealth = (row.animalHealth as number) ?? 0
    const species = speciesByLogItem.get(itemId)

    // Classification is "first match wins", which is only safe because the
    // classes are disjoint — asserted over the shipped data in
    // bundled-data.test.ts.
    if (hardness > 0 && itemsPerBlock > 0) {
      options.push({
        itemId,
        kind: 'rock',
        name,
        rawName,
        target: {
          kind: 'rock',
          hardness,
          itemsPerBlock,
          maxItemsPerBlock: (row.rubbleMaxItemsPerBlock as number) ?? itemsPerBlock,
          extraHitsPerBlock: (row.rubbleExtraHitsPerBlock as number) ?? 0,
        },
      })
    } else if (row.requiresShovel === true) {
      options.push({ itemId, kind: 'excavatable', name, rawName, target: { kind: 'excavatable' } })
    } else if (animalHealth > 0) {
      // Prefer the species name ("Deer") over the item name ("Deer Carcass"),
      // matching how the crop tracker labels plants.
      const speciesName = getName('animal', itemId)
      options.push({
        itemId,
        kind: 'carcass',
        name: speciesName || name,
        rawName,
        target: { kind: 'carcass', animalHealth },
      })
    } else if (species && species.length > 0) {
      const primary = species[0]
      options.push({
        itemId,
        kind: 'log',
        name,
        rawName,
        target: { kind: 'log', treeHealth: primary.treeHealth },
        species: species.slice().sort((a, b) => compare(a.name, b.name)),
      })
    }
  }

  // `kind` is a raw (unlocalized) grouping key, so it uses the stable
  // comparator; only the name within a kind is user-facing text.
  options.sort((a, b) => compareKeys(a.kind, b.kind) || compare(a.name, b.name))
  clothing.sort((a, b) => compare(a.name, b.name))

  const tools: GatheringToolOption[] = []
  for (const toolId of gameDataStore.getRowIds('gatheringTools')) {
    const row = gameDataStore.getRow('gatheringTools', toolId)
    if (row.datasetId !== datasetId) continue
    const itemId = row.itemId as string
    const itemRow = gameDataStore.getRow('items', itemId)
    if (!itemRow) continue
    const rawName = itemRow.name as string
    tools.push({
      itemId,
      name: getName('item', itemId) || rawName,
      rawName,
      kind: row.kind as string,
      tier: (row.tier as number) ?? 0,
      tool: {
        kind: row.kind as string,
        baseCalories: (row.baseCalories as number) ?? 0,
        baseDamage: (row.baseDamage as number) ?? 0,
        damageUsesToolCurve: row.damageUsesToolCurve === true,
      },
      calorieSkillId: (row.calorieSkillId as string) ?? '',
      efficiencyTalentId: (row.efficiencyTalentId as string) ?? '',
      strengthTalentId: (row.strengthTalentId as string) ?? '',
    })
  }
  tools.sort((a, b) => compareKeys(a.kind, b.kind) || a.tier - b.tier || compare(a.name, b.name))

  const gatheringConstants =
    getGameDataIndexes(gameDataStore).gatheringConstantsByDatasetId.get(datasetId)

  return {
    options,
    byItemId: new Map(options.map((o) => [o.itemId, o])),
    tools,
    clothing,
    constants: {
      bow: resolveBowDamageModel(gameDataStore, datasetId),
      maxTrunkPickupSize: gatheringConstants?.maxTrunkPickupSize ?? MAX_TRUNK_PICKUP_SIZE,
    },
  }
}

/** Tools that can gather `kind`, best tier last. */
export function toolsForKind(
  tools: GatheringToolOption[],
  kind: GatheringKind
): GatheringToolOption[] {
  return tools.filter((t) => t.kind === TOOL_KIND_BY_TARGET[kind])
}

/** The tool a freshly-opened dialog should default to: the lowest tier that can
 * gather this target. Predictable, needs no build state, and starts from the
 * tool a player is most likely to actually own. */
export function defaultToolFor(
  tools: GatheringToolOption[],
  kind: GatheringKind
): GatheringToolOption | null {
  const usable = toolsForKind(tools, kind)
  if (usable.length === 0) return null
  return usable.reduce((best, t) => (t.tier < best.tier ? t : best), usable[0])
}

function findTalentIdByName(gameDataStore: Store, datasetId: string, name: string): string {
  for (const talentId of gameDataStore.getRowIds('talents')) {
    const row = gameDataStore.getRow('talents', talentId)
    if (row.datasetId === datasetId && row.name === name) return talentId
  }
  return ''
}

function hasTalent(buildStore: Store, buildId: string, talentId: string): boolean {
  if (!talentId) return false
  for (const rowId of buildStore.getRowIds('userTalents')) {
    const row = buildStore.getRow('userTalents', rowId)
    if (row.buildId === buildId && row.talentId === talentId) return row.enabled !== false
  }
  return false
}

/**
 * A talent's scalar value.
 *
 * 0 is a REAL value and must not be folded onto the fallback. From v14.1
 * `HuntingPowerShotTalent` genuinely carries 0 — its magnitude moved into a
 * bonus — and treating that as "missing" adds a phantom point of damage to
 * every bow shot. Only an absent row or cell, which reads back as `undefined`,
 * is what the fallback is for.
 */
function talentValue(gameDataStore: Store, talentId: string, fallback: number): number {
  if (!talentId) return fallback
  const value = gameDataStore.getCell('talents', talentId, 'value') as number | undefined
  return value ?? fallback
}

/**
 * The magnitude of a talent's `UseTool` bonus of the given effect type, or 0
 * when it has none.
 *
 * Several talents keep their value at 0 and put the real magnitude in a bonus —
 * `BlacksmithEmpowerTalent` is one — so reading the scalar alone silently zeroes
 * them. Bonus SCOPE is not carried by the dataset, so callers reproduce it
 * themselves (see `EMPOWER_TOOL_KINDS`, and the bow-only call sites here).
 */
function useToolBonusValue(
  gameDataStore: Store,
  talentId: string,
  effectType: 'Additive' | 'Multiplicative'
): number {
  if (!talentId) return 0
  for (const rowId of gameDataStore.getRowIds('talentBonuses')) {
    const row = gameDataStore.getRow('talentBonuses', rowId)
    if (row.talentId === talentId && row.action === 'UseTool' && row.effectType === effectType) {
      return (row.value as number) ?? 0
    }
  }
  return 0
}

/**
 * How this dataset's bow damage works.
 *
 * The ERA is decided by the talent shape — does Deadeye carry a `UseTool`
 * additive bonus? — rather than by `GatheringConstants`. That matters for a
 * player who installed a v14.1 dataset built before the constants section
 * existed: they still get the right maths, and only the base multiplier falls
 * back to a constant. Deciding the era from the constants section instead would
 * leave them silently on the old formula.
 */
export function resolveBowDamageModel(gameDataStore: Store, datasetId: string): BowDamageModel {
  const deadeyeId = findTalentIdByName(gameDataStore, datasetId, DEADEYE_TALENT_NAME)
  const powerShotId = findTalentIdByName(gameDataStore, datasetId, POWER_SHOT_TALENT_NAME)
  const deadeyeAdditive = useToolBonusValue(gameDataStore, deadeyeId, 'Additive')
  const constants = getGameDataIndexes(gameDataStore).gatheringConstantsByDatasetId.get(datasetId)

  if (deadeyeAdditive > 0) {
    return {
      era: 'bonus',
      headshotMultiplier: constants?.bowHeadshotMultiplier ?? BOW_HEADSHOT_MULTIPLIER_BONUS_ERA,
      deadeyeAdditive,
      // 1 is the identity, so a dataset missing the bonus simply gets no boost.
      powerShotMultiplicative: useToolBonusValue(gameDataStore, powerShotId, 'Multiplicative') || 1,
    }
  }
  return {
    era: 'legacy',
    headshotMultiplier: constants?.bowHeadshotMultiplier ?? BOW_HEADSHOT_MULTIPLIER_LEGACY,
    // 0 is the "absent" sentinel for this column, so `||` is the right pick.
    headshotMultiplierDeadeye:
      constants?.bowHeadshotMultiplierDeadeye || BOW_HEADSHOT_MULTIPLIER_DEADEYE_LEGACY,
  }
}

/**
 * Seeds the dialog's controls from the user's actual build — their level in the
 * tool's calorie skill and which of the relevant talents they have taken —
 * rather than starting at zero the way the Ad-Hoc Recipe Calculator does.
 *
 * The skill comes from the *tool*, not a hardcoded name, so this stays correct
 * if a game version re-points a tool at a different skill.
 */
export function seedGatheringControls(
  gameDataStore: Store,
  buildStore: Store,
  buildId: string,
  datasetId: string,
  kind: GatheringKind,
  tool: GatheringToolOption | null
): { skillLevel: number; talents: GatheringTalentState } {
  let skillLevel = 0
  if (tool?.calorieSkillId) {
    for (const rowId of buildStore.getRowIds('userSkills')) {
      const row = buildStore.getRow('userSkills', rowId)
      if (row.buildId === buildId && row.skillId === tool.calorieSkillId) {
        skillLevel = (row.level as number) ?? 0
        break
      }
    }
  }

  const empowerId = EMPOWER_TOOL_KINDS.has(tool?.kind ?? '')
    ? findTalentIdByName(gameDataStore, datasetId, EMPOWER_TALENT_NAME)
    : ''
  const luckyBreakId =
    kind === 'rock' ? findTalentIdByName(gameDataStore, datasetId, LUCKY_BREAK_TALENT_NAME) : ''
  const deadeyeId =
    kind === 'carcass' ? findTalentIdByName(gameDataStore, datasetId, DEADEYE_TALENT_NAME) : ''
  const arrowRecoveryId =
    kind === 'carcass'
      ? findTalentIdByName(gameDataStore, datasetId, ARROW_RECOVERY_TALENT_NAME)
      : ''

  return {
    skillLevel,
    talents: {
      // A tool with no efficiency talent id (shovels, bows) can never enable
      // this — their C# names an abstract talent that is never granted.
      efficiency: hasTalent(buildStore, buildId, tool?.efficiencyTalentId ?? ''),
      efficiencyValue: talentValue(gameDataStore, tool?.efficiencyTalentId ?? '', 0.8),
      strength: hasTalent(buildStore, buildId, tool?.strengthTalentId ?? ''),
      // 1 for the axe/pickaxe strength talents in every version, and 0 for
      // v14.1's Power Shot, whose magnitude is a bonus instead. No talent
      // resolved means no damage, so 0 is the right fallback.
      strengthValue: talentValue(gameDataStore, tool?.strengthTalentId ?? '', 0),
      empower: hasTalent(buildStore, buildId, empowerId),
      // Empower keeps its value at 0 and carries the magnitude in a bonus; fall
      // back to the scalar for any dataset shaped the other way round.
      empowerValue:
        useToolBonusValue(gameDataStore, empowerId, 'Additive') ||
        talentValue(gameDataStore, empowerId, 0),
      luckyBreak: hasTalent(buildStore, buildId, luckyBreakId),
      deadeye: hasTalent(buildStore, buildId, deadeyeId),
      arrowRecovery: hasTalent(buildStore, buildId, arrowRecoveryId),
      arrowRecoveryValue: talentValue(gameDataStore, arrowRecoveryId, 0.5),
    },
  }
}

/**
 * Whether swapping tools should re-read the skill level from the build.
 *
 * Only when the new tool keys off a *different* skill. Every tool of a kind
 * shares one calorie skill, so re-seeding on an ordinary tier swap could only
 * ever discard a level the user typed — resetting it to zero for a skill they
 * have not taken.
 */
export function shouldReseedSkillLevel(
  previous: GatheringToolOption | null,
  next: GatheringToolOption | null
): boolean {
  return (previous?.calorieSkillId ?? '') !== (next?.calorieSkillId ?? '')
}

/**
 * Carries the user's own edits across a tool change. `seedGatheringControls`
 * re-reads everything from the build, which would wipe a level or a toggle the
 * user set by hand — every tool of a given kind shares one calorie skill, so a
 * tool swap is a refinement of the same estimate, not a fresh start.
 *
 * Keeps each toggle the user set, switches off anything the new tool can't
 * have, and takes the talent *values* from the newly seeded state.
 */
export function retainTalents(
  previous: GatheringTalentState,
  seeded: GatheringTalentState,
  kind: GatheringKind,
  tool: GatheringToolOption | null
): GatheringTalentState {
  const available = availableTalents(kind, tool)
  return {
    ...seeded,
    efficiency: available.efficiency && previous.efficiency,
    strength: available.strength && previous.strength,
    empower: available.empower && previous.empower,
    luckyBreak: available.luckyBreak && previous.luckyBreak,
    deadeye: available.deadeye && previous.deadeye,
    arrowRecovery: available.arrowRecovery && previous.arrowRecovery,
  }
}

/** Which talent toggles apply to a tool/target pair, so the UI only renders
 * controls the user could actually have. */
export function availableTalents(
  kind: GatheringKind,
  tool: GatheringToolOption | null
): {
  efficiency: boolean
  strength: boolean
  empower: boolean
  luckyBreak: boolean
  deadeye: boolean
  arrowRecovery: boolean
} {
  return {
    efficiency: !!tool?.efficiencyTalentId,
    strength: !!tool?.strengthTalentId,
    empower: EMPOWER_TOOL_KINDS.has(tool?.kind ?? ''),
    luckyBreak: kind === 'rock',
    deadeye: kind === 'carcass',
    arrowRecovery: kind === 'carcass',
  }
}

/** The build's `userPrices` row for an item, or '' when it has none yet.
 * `setPrice` creates the row when handed ''. */
export function findUserPriceId(buildStore: Store, buildId: string, itemOrTagId: string): string {
  for (const rowId of buildStore.getRowIds('userPrices')) {
    const row = buildStore.getRow('userPrices', rowId)
    if (row.buildId === buildId && row.itemOrTagId === itemOrTagId) return rowId
  }
  return ''
}

/** The dataset's Arrow item, whose solver price feeds the hunting consumable
 * cost. Returns '' when the dataset has no such item. */
export function findArrowItemId(gameDataStore: Store, datasetId: string): string {
  for (const itemId of gameDataStore.getRowIds('items')) {
    const row = gameDataStore.getRow('items', itemId)
    if (row.datasetId === datasetId && !row.isTag && row.name === 'ArrowItem') return itemId
  }
  return ''
}
