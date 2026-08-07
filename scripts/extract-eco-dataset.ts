#!/usr/bin/env tsx
/**
 * Extract an Eco game dataset (DatasetJson) from a local Eco server install.
 *
 * Usage:
 *   aube exec tsx scripts/extract-eco-dataset.ts \
 *     --eco-root /path/to/EcoServer \
 *     --output   /path/to/eco-vN.json \
 *     [--version  1] \
 *     [--translations-zip /path/to/eco.zip] \
 *     [--compare public/data/eco-v12.json]
 *
 * Environment variables (used when the corresponding flag is omitted):
 *   ECO_ROOT              -> --eco-root
 *   ECO_TRANSLATIONS_ZIP  -> --translations-zip
 *
 * The script regex-parses the auto-generated C# under
 *   <eco-root>/Eco_Data/Server/Mods/__core__/AutoGen
 * and emits a DatasetJson matching src/types/dataset-json.ts.
 *
 * Localization: if a translations zip (an export from Eco's translation
 * platform, containing per-language `eco-game-*.csv` and `eco-ecopedia-*.csv`
 * files) is provided, translations are merged into every entity's
 * LocalizedName. Without a zip, only en-US is populated.
 */

import { promises as fs } from 'node:fs'
import * as path from 'node:path'

import AdmZip from 'adm-zip'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { validateDatasetJson } from '../src/lib/import-dataset'
import type {
  DatasetJson,
  ElementJson,
  GarbageQuantityJson,
  GatheringToolJson,
  ItemJson,
  LocalizedNames,
  ModifierJson,
  RecipeJson,
  SkillJson,
  TagJson,
  TalentBonusJson,
  TalentBonusScopeJson,
  TalentJson,
  TreeSpeciesJson,
  DynamicValueJson,
} from '../src/types/dataset-json'

// ---------------------------------------------------------------------------
// CLI

interface Args {
  ecoRoot: string
  output: string
  version: number
  translationsZip?: string
  compare?: string
}

async function parseArgs(): Promise<Args> {
  const parsed = await yargs(hideBin(process.argv))
    .scriptName('extract-eco-dataset')
    .version(false)
    .usage('$0 --output <file> [options]')
    .option('eco-root', {
      type: 'string',
      describe: 'Path to Eco server install (env: ECO_ROOT)',
      default: process.env.ECO_ROOT,
      defaultDescription: '$ECO_ROOT',
    })
    .option('output', {
      type: 'string',
      describe: 'Output dataset JSON path',
      demandOption: true,
    })
    .option('version', {
      type: 'number',
      describe: 'Dataset version number',
      default: 1,
    })
    .option('translations-zip', {
      type: 'string',
      describe:
        'Path to translations zip from Eco translation platform (env: ECO_TRANSLATIONS_ZIP)',
      default: process.env.ECO_TRANSLATIONS_ZIP,
      defaultDescription: '$ECO_TRANSLATIONS_ZIP',
    })
    .option('compare', {
      type: 'string',
      describe: 'Compare against an existing dataset JSON',
    })
    .strict()
    .help()
    .parse()

  if (!parsed.ecoRoot) {
    throw new Error('--eco-root is required (or set ECO_ROOT)')
  }

  return {
    ecoRoot: parsed.ecoRoot,
    output: parsed.output,
    version: parsed.version,
    translationsZip: parsed.translationsZip,
    compare: parsed.compare,
  }
}

// ---------------------------------------------------------------------------
// Filesystem walk

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) await walk(p, out)
    else if (e.isFile() && p.endsWith('.cs')) out.push(p)
  }
  return out
}

// ---------------------------------------------------------------------------
// Regex helpers

function parseFloatLit(s: string): number {
  // strip f/F suffix; handle simple "1 - 0.2" expressions
  const cleaned = s.replace(/f/g, '').trim()
  if (/^-?[\d.]+$/.test(cleaned)) return Number(cleaned)
  // expression like "1 - 0.2" or "0.5 + 0.05"
  // eslint-disable-next-line no-new-func
  try {
    return Function(`"use strict";return (${cleaned})`)() as number
  } catch {
    return NaN
  }
}

function enLocalized(s: string): LocalizedNames {
  return { 'en-US': s }
}

function classifyModifier(
  typeName: string,
  context: 'craftMinutes' | 'labor' | 'ingredient'
): ModifierJson {
  if (typeName.endsWith('Talent')) return { DynamicType: 'Talent', Item: typeName }
  if (typeName.endsWith('Skill')) {
    // Convention from existing dataset: skill in CraftMinutes/Ingredient is Module,
    // skill in Labor is Skill.
    if (context === 'labor') return { DynamicType: 'Skill', Item: typeName }
    return { DynamicType: 'Module', Item: typeName }
  }
  return { DynamicType: 'Module', Item: typeName }
}

// ---------------------------------------------------------------------------
// Raw entity collection

interface RawSkill {
  name: string
  display: string
  profession?: string
  maxLevel: number
  laborReducePercent: number[]
  specialtyCost?: number
}
interface RawItem {
  name: string
  display: string
  tags: string[]
  isPart?: boolean
  requiredParts?: Array<{ typeName: string; quantity: number }>
  isPluginModule?: boolean
  // v11–v13 module shape, read from the `base(ModuleTypes.X, pct, …)` ctor.
  // Mutually exclusive with the v14 fields below — see the gate in
  // parseItemAndRecipeFile.
  pluginType?: string
  pluginModulePercent?: number
  pluginModuleSkill?: string
  pluginModuleSkillPercent?: number
  // v14 module shape, read from `override IEnumerable<Bonus> Bonuses`.
  moduleSlot?: string
  moduleBonuses?: RawBonus[]
  isDeprecated?: boolean
  /** `[SalvageCost(typeof(Mat), qty, …)]` — garbage-material names, resolved to
   * real item names after pass 1 (see resolveSalvageMaterials). New in v14. */
  salvageCost?: Array<{ material: string; quantity: number }>
  isCraftingTable?: boolean
  // raw upgrade module specs from [AllowPluginModules(...)]
  craftingTableModuleTags?: string[]
  craftingTableModuleItems?: string[]
  CraftingTablePluginModules?: string[]
  // Crop growth data, merged from the matching PlantSpecies (see parsePlantFile).
  maturityAgeDays?: number
  postHarvestingGrowth?: number
  pickableAtPercent?: number
  // Yield range of the species' *primary* resource (ResourceList[0]), which is
  // what Plant.Ripe gates first-harvest on — not necessarily this item's own
  // range (RoseBush's primary is PlantFibers, but the tracked item is Rose).
  primaryResourceMin?: number
  primaryResourceMax?: number
  seedItemName?: string
  plantDisplay?: string // in-world species name, e.g. "Oak" (vs the item's "Oak Log")
  isTree?: boolean
  // Gathering data, merged after pass 1 from the block / species that yields
  // this item. See the "Merge gathering data" block in main().
  minableHardness?: number
  rubbleItemsPerBlock?: number
  rubbleMaxItemsPerBlock?: number
  rubbleExtraHitsPerBlock?: number
  requiresShovel?: boolean
  animalHealth?: number
  animalDisplay?: string // in-world species name, e.g. "Deer" (vs "Deer Carcass")
  clothingCalorieRate?: number
}
interface RawTagDef {
  name: string
  display?: string
}
interface RawTalentGroup {
  name: string
  display: string
  description?: string
  owningSkill?: string
  level: number
  talents: string[]
}
interface RawTalent {
  name: string
  groupType?: string
  baseClass?: string
  value: number
}

interface RawBonus {
  action: string
  effectType: string
  value: number
  cap?: number
  lowerIsBetter?: boolean
  recipes: string[]
  skillTypes: string[]
  craftStationTypes: string[]
  itemTags: string[]
}

interface RawVariant {
  className: string
  displayName: string
  ingredients: ElementJson[]
  products: ElementJson[]
  garbageOutputs: GarbageQuantityJson[]
  tableType: string
  parentClassName: string
}

const skills: RawSkill[] = []
const items = new Map<string, RawItem>()
const tagDefs: RawTagDef[] = []
const recipes: RecipeJson[] = []
const variants: RawVariant[] = []
const talentGroups: RawTalentGroup[] = []
const talents: RawTalent[] = []
const bonusesByTalentName = new Map<string, RawBonus[]>()

// Growth data parsed from AutoGen/Plant/*.cs. The harvested crop item can't be
// resolved at parse time (it depends on item tags, populated across all files),
// so we stash each species' ResourceList item names and growth values and
// resolve the crop item after pass 1.
interface RawPlant {
  /** The species class stem, e.g. 'Oak' from `OakSpecies`. Joins to the health
   * values in Organisms/Tree/<X>.cs, which live in a different file. */
  speciesName: string
  displayName: string // the species' in-world name, e.g. "Oak", "Bolete Mushroom"
  // ResourceList entries in declaration order; index 0 is the species' primary
  // resource, whose Range drives the ripeness gate (Species.ResourceRange).
  resources: { name: string; min: number; max: number }[]
  isTree: boolean
  maturityAgeDays: number
  postHarvestingGrowth: number
  pickableAtPercent: number
}
const rawPlants: RawPlant[] = []

// ---- Gathering raw state ---------------------------------------------------

/** A world-gathering tool parsed from AutoGen/Tool/*.cs. */
interface RawGatheringTool {
  name: string
  kind: string
  tier: number
  baseCalories: number
  calorieSkill: string
  baseDamage: number
  /** True when the C# used CreateDamageValue() rather than ConstantValue(),
   * meaning ToolItem's damage curve scales it with the skill's level. */
  damageUsesToolCurve: boolean
  efficiencyTalent?: string
  strengthTalent?: string
  maxTake?: number
}
const rawTools: RawGatheringTool[] = []

/** Rubble yield of one minable block, derived from its BecomesRubble graph. */
interface RawRubble {
  itemName: string
  itemsPerBlock: number
  maxItemsPerBlock: number
  extraHitsPerBlock: number
}
/** Keyed by block class name, e.g. 'GraniteBlock'. */
const rawRubble = new Map<string, RawRubble>()

/** `[Minable(N)]` hardness, keyed by block class name. */
const rawMinables = new Map<string, number>()
/** `RepresentedItemType`, mapping a block class name to its item class name. */
const blockToItem = new Map<string, string>()

/** An AnimalSpecies. Its ResourceList[0] is the carcass it drops. */
interface RawAnimal {
  displayName: string
  health: number
  resources: { name: string; min: number; max: number }[]
}
const rawAnimals: RawAnimal[] = []

/** Trunk health from Organisms/Tree/<X>.cs, keyed by species stem ('Oak').
 * LogHealth is deliberately ignored — nothing in the game reads it. */
interface RawTreeHealth {
  treeHealth: number
}
const rawTreeHealth = new Map<string, RawTreeHealth>()

/** GarbageMaterial class name → the item type it actually yields, read from
 * `__core__/Items/GarbageMaterials.cs` (23 entries in v14.0.1).
 *
 * `[SalvageCost(...)]` and `GarbageOutput(...)` both name *materials*, not items,
 * and the mapping is not derivable by suffixing "Item": `Trash → GarbageItem`,
 * `StoneRubble → CrushedMixedRockItem`, `MetalScrap → MixedMetalScrapItem`.
 * Resolving here keeps the dataset referencing only real item names, so
 * `validateDatasetJson`'s existing item-reference checks keep working unchanged.
 *
 * Empty on v11–v13, which have no garbage system at all. */
const garbageMaterialToItem = new Map<string, string>()

function parseGarbageMaterialsFile(src: string) {
  // public class Trash : GarbageMaterial
  // {
  //     public override Type OutputItemType => typeof(GarbageItem);
  const re =
    /public\s+(?:partial\s+)?class\s+(\w+)\s*:\s*GarbageMaterial\b[\s\S]{0,600}?OutputItemType\s*=>\s*typeof\((\w+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    garbageMaterialToItem.set(m[1], m[2])
    ensureItem(m[2])
  }
}

// Used to deduplicate stub items
function ensureItem(name: string, display?: string): RawItem {
  let it = items.get(name)
  if (!it) {
    it = { name, display: display ?? name, tags: [] }
    items.set(name, it)
  } else if (display && !it.display) {
    it.display = display
  }
  return it
}

// ---- Skill parsing ----------------------------------------------------------

function parseSkillFile(src: string) {
  const classRe =
    /\[Serialized\][\s\S]*?\[LocDisplayName\("(.+?)"\)\][\s\S]*?(?:\[RequiresSkill\(typeof\((\w+)\)[^\]]*\)\][\s\S]*?)?public\s+partial\s+class\s+(\w+Skill)\s*:\s*Skill\b/g
  let m: RegExpExecArray | null
  while ((m = classRe.exec(src))) {
    const display = m[1]
    const profession = m[2]
    const name = m[3]
    // body: find from match end up to the matching closing brace pair (cheap: take next 8000 chars)
    const bodyStart = src.indexOf('{', classRe.lastIndex)
    const body = bodyStart >= 0 ? src.slice(bodyStart, bodyStart + 8000) : ''

    const maxLevelMatch = /MaxLevel\s*\{\s*get\s*\{\s*return\s+(\d+)/.exec(body)
    const maxLevel = maxLevelMatch ? Number(maxLevelMatch[1]) : 0

    const multMatch = /MultiplicativeStrategy\(\s*new\s+float\[\]\s*\{([^}]+)\}/.exec(body)
    let labor: number[] = []
    if (multMatch) {
      labor = multMatch[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(parseFloatLit)
        .filter((n) => !Number.isNaN(n))
    }

    // `SpecialtyCost => N` was introduced in v13; absent in v11/v12 where every
    // skill cost 1 star flat. Leaving it undefined lets the importer apply the
    // v11/v12 default without baking the 1-star assumption into the dataset.
    const specialtyMatch = /SpecialtyCost\s*=>\s*(\d+)/.exec(body)
    const specialtyCost = specialtyMatch ? Number(specialtyMatch[1]) : undefined

    skills.push({
      name,
      display,
      profession: profession && profession !== name ? profession : undefined,
      maxLevel,
      laborReducePercent: labor,
      specialtyCost,
    })
  }
}

// ---- Talent parsing (groups + talents share files under Benefit/) ----------

function parseTalentFile(src: string) {
  // Talent groups
  const groupRe =
    /\[LocDisplayName\("([^"]+)"\)\]\s*(?:\[LocDescription\("([^"]*)"\)\]\s*)?[\s\S]*?public\s+partial\s+class\s+(\w+TalentGroup)\s*:\s*TalentGroup[\s\S]*?\{([\s\S]*?)\n\s{4}\}/g
  let g: RegExpExecArray | null
  while ((g = groupRe.exec(src))) {
    const display = g[1]
    const description = g[2]
    const name = g[3]
    const body = g[4]
    const owning = /OwningSkill\s*=\s*typeof\((\w+)\)/.exec(body)?.[1]
    const level = Number(/this\.Level\s*=\s*(\d+)/.exec(body)?.[1] ?? 0)
    const tts: string[] = []
    const tre = /typeof\((\w+Talent)\)/g
    let mt: RegExpExecArray | null
    while ((mt = tre.exec(body))) tts.push(mt[1])
    talentGroups.push({ name, display, description, owningSkill: owning, level, talents: tts })
  }
  // Individual Talents
  const talentRe =
    /public\s+partial\s+class\s+(\w+Talent)\s*:\s*(\w+Talent)[\s\S]*?\{([\s\S]*?)\n\s{4}\}/g
  let t: RegExpExecArray | null
  while ((t = talentRe.exec(src))) {
    const name = t[1]
    const baseClass = t[2]
    const body = t[3]
    const groupType = /TalentGroupType\s*\{[^}]*typeof\((\w+)\)/.exec(body)?.[1]
    const value = parseFloatLit(/this\.Value\s*=\s*([0-9.\-+f\s]+);/.exec(body)?.[1] ?? '0')
    talents.push({ name, groupType, baseClass, value })
  }
}

// ---- Bonus parsing (v13+ Benefits/*.cs) -------------------------------------

// Scan a block of C# text to locate the position just past the closing brace
// that matches the opening brace at `startBraceIdx` (inclusive). Returns the
// index of the char AFTER the matching `}`, or -1 if unbalanced.
function matchBrace(src: string, startBraceIdx: number): number {
  let depth = 0
  for (let i = startBraceIdx; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

function extractTypeNames(block: string): string[] {
  const out: string[] = []
  const re = /typeof\((\w+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(block))) out.push(m[1])
  return out
}

function extractStringLits(block: string): string[] {
  const out: string[] = []
  const re = /"([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(block))) out.push(m[1])
  return out
}

/** A `new Bonus { … }` object that was located but whose effect payload could
 * not be read. Callers decide whether that is benign (talents: BonusEffectChance
 * is outside price calc) or fatal (modules: every effect must parse). */
interface UnparsedBonus {
  effectType: string
  reason: string
}

// Parse every `new Bonus { … }` object initializer found in `text`.
//
// TWO DECLARATION SYNTAXES EXIST and both must work — this is the reason the
// scan anchors on `new Bonus` rather than on the surrounding statement:
//
//   talents (__core__/Benefits/*.cs):
//     this.Bonuses.Add(new Bonus { … });
//   modules (AutoGen/PluginModule/*.cs, new in v14):
//     public override IEnumerable<Bonus> Bonuses => new[] { new Bonus { … }, … };
//
// The old talent-only parser anchored on `this.Bonuses.Add(`, so run over a v14
// module it found zero bonuses and reported success. `new\s+Bonus\s*\{` cannot
// match `new BonusEffectMultiplicative {` or `new BonusCause {` — the `{` must
// follow `Bonus` directly — so widening the anchor is safe.
//
// Verified against v11/v12/v13.0.4/v14.0.1: outside SampleTalents.cs (which the
// Benefits walk skips by name) every `new Bonus {` in __core__/Benefits is
// reached via `this.Bonuses.Add(`, so the wider anchor yields byte-identical
// talent output on every shipped version. SampleTalents.cs is the only file
// where the two disagree — it registers Bonus objects on a `component.BonusList`
// instead — which is why that skip is load-bearing rather than cosmetic.
function parseBonusObjects(text: string): {
  bonuses: RawBonus[]
  unparsed: UnparsedBonus[]
} {
  const bonuses: RawBonus[] = []
  const unparsed: UnparsedBonus[] = []
  const re = /new\s+Bonus\s*(?=\{)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const objOpenIdx = text.indexOf('{', m.index + m[0].length)
    if (objOpenIdx < 0) continue
    const objEndIdx = matchBrace(text, objOpenIdx)
    if (objEndIdx < 0) continue
    const obj = text.slice(objOpenIdx + 1, objEndIdx - 1)
    // Keep the scan from re-entering this object's own braces.
    re.lastIndex = objEndIdx

    // Action — only CraftBonusCause has an Action on a scope relevant to us,
    // but HarvestBonusCause / ActionCause also declare BonusAction.X; we
    // capture whichever first appears.
    const action = /BonusAction\.(\w+)/.exec(obj)?.[1]
    if (!action) {
      unparsed.push({ effectType: 'unknown', reason: 'no BonusAction' })
      continue
    }

    // Scope — from the first CraftBonusCause block (we don't support multi-
    // cause bonuses; they don't exist in v13 or v14 core data).
    const scopeBlock = extractInitializerBlock(obj, 'CraftBonusCause') ?? obj
    const recipes = extractSetTypeNames(scopeBlock, 'Recipes')
    const skillTypes = extractSetTypeNames(scopeBlock, 'SkillTypes')
    const craftStationTypes = extractSetTypeNames(scopeBlock, 'CraftStationTypes')
    const itemTags = extractSetStrings(scopeBlock, 'ItemTags')

    // Effect — first `new BonusEffect<Kind> { ... }` after `Effects =`.
    const effectsIdx = obj.search(/Effects\s*=/)
    const afterEffects = effectsIdx >= 0 ? obj.slice(effectsIdx) : obj
    const effMatch = /new\s+(BonusEffect\w+)\s*\{([^}]*)\}/.exec(afterEffects)
    if (!effMatch) {
      unparsed.push({ effectType: 'unknown', reason: 'no BonusEffect initializer' })
      continue
    }
    const effectType = effMatch[1].replace(/^BonusEffect/, '')
    const params = effMatch[2]

    // The magnitude field is NOT uniform. Every effect type in __core__/Benefits
    // spells it `Value =`, but v14's `BonusEffectAdditivePercent` — which appears
    // only on plugin modules — spells it `Percent =`. Reading `Value` alone
    // silently dropped every module ResourceCost and LaborCost bonus, i.e.
    // exactly the discounts the v14 work exists to model.
    const rawVal =
      /Value\s*=\s*([0-9.\-+f]+)/.exec(params)?.[1] ??
      /Percent\s*=\s*([0-9.\-+f]+)/.exec(params)?.[1]
    const val = parseFloatLit(rawVal ?? 'NaN')
    if (Number.isNaN(val)) {
      // BonusEffectChance uses Chance / SuccessValue — outside price calc.
      unparsed.push({ effectType, reason: 'no numeric Value/Percent' })
      continue
    }
    const capStr = /Cap\s*=\s*([0-9.\-+f]+)/.exec(params)?.[1]
    const cap = capStr !== undefined ? parseFloatLit(capStr) : undefined
    const lowerStr = /LowerIsBetter\s*=\s*(true|false)/.exec(params)?.[1]
    const lowerIsBetter = lowerStr === undefined ? undefined : lowerStr === 'true'

    bonuses.push({
      action,
      effectType,
      value: val,
      cap,
      lowerIsBetter,
      recipes,
      skillTypes,
      craftStationTypes,
      itemTags,
    })
  }
  return { bonuses, unparsed }
}

/** Pure RawBonus → JSON conversion, shared by talents and plugin modules.
 *
 * Note this emits NO synthetic recipe modifier. Talents additionally push a
 * `Talent` modifier onto each matching recipe (see attachBonusToTalent), but
 * modules deliberately do not: baking module bonuses into the `modifiers` table
 * would add ~23k rows to a table that currently holds ~11.5k, and module scope is
 * cheap to evaluate at solve time instead. */
function toBonusJson(b: RawBonus): TalentBonusJson {
  const scope: TalentBonusScopeJson = {}
  if (b.recipes.length) scope.Recipes = b.recipes
  if (b.skillTypes.length) scope.SkillTypes = b.skillTypes
  if (b.craftStationTypes.length) scope.CraftStationTypes = b.craftStationTypes
  if (b.itemTags.length) scope.ItemTags = b.itemTags

  const json: TalentBonusJson = {
    Action: b.action,
    EffectType: b.effectType,
    Value: b.value,
    Scope: scope,
  }
  if (b.cap !== undefined) json.Cap = b.cap
  if (b.lowerIsBetter !== undefined) json.LowerIsBetter = b.lowerIsBetter
  return json
}

function parseBonusFile(src: string): void {
  // For each partial Talent class in this file, pull out the Bonuses added
  // within its constructor body.
  const classRe = /public\s+partial\s+class\s+(\w+Talent)\s*:\s*Talent\b/g
  let cm: RegExpExecArray | null
  while ((cm = classRe.exec(src))) {
    const talentName = cm[1]
    const openIdx = src.indexOf('{', cm.index + cm[0].length)
    if (openIdx < 0) continue
    const closeIdx = matchBrace(src, openIdx)
    if (closeIdx < 0) continue
    const classBody = src.slice(openIdx, closeIdx)

    // Unparsed bonuses are tolerated here: BonusEffectChance (Chance /
    // SuccessValue) is outside price calc and has always been skipped.
    const { bonuses } = parseBonusObjects(classBody)
    if (bonuses.length === 0) continue

    let list = bonusesByTalentName.get(talentName)
    if (!list) {
      list = []
      bonusesByTalentName.set(talentName, list)
    }
    list.push(...bonuses)
  }
}

// Slice out the `{ ... }` initializer that follows `new <TypeName>` within the
// given text, returning only the body (without outer braces). Returns null if
// the type or its initializer can't be located.
function extractInitializerBlock(src: string, typeName: string): string | null {
  const re = new RegExp(`new\\s+${typeName}\\s*\\{`)
  const m = re.exec(src)
  if (!m) return null
  const open = m.index + m[0].length - 1
  const end = matchBrace(src, open)
  if (end < 0) return null
  return src.slice(open + 1, end - 1)
}

// Extract typeof(X) names from a `Name = new HashSet<Type> { typeof(X), ... }`
// assignment inside an initializer body. Accepts both `HashSet<Type>` and the
// fully-qualified `HashSet<System.Type>` form used in a few files.
function extractSetTypeNames(src: string, fieldName: string): string[] {
  const re = new RegExp(`${fieldName}\\s*=\\s*new\\s+HashSet<(?:System\\.)?Type>\\s*\\{`)
  const m = re.exec(src)
  if (!m) return []
  const open = m.index + m[0].length - 1
  const end = matchBrace(src, open)
  if (end < 0) return []
  return extractTypeNames(src.slice(open + 1, end - 1))
}

// Extract string literals from `Name = new HashSet<string> { "X", ... }`.
function extractSetStrings(src: string, fieldName: string): string[] {
  const re = new RegExp(`${fieldName}\\s*=\\s*new\\s+HashSet<string>\\s*\\{`)
  const m = re.exec(src)
  if (!m) return []
  const open = m.index + m[0].length - 1
  const end = matchBrace(src, open)
  if (end < 0) return []
  return extractStringLits(src.slice(open + 1, end - 1))
}

// ---- Tag definitions --------------------------------------------------------

function parseTagDefinitionsFile(src: string) {
  const re = /new\s+TagDefinition\("([^"]+)"\)\s*(\{[^}]*\})?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const name = m[1]
    const body = m[2] ?? ''
    const display = /PluralName\s*=\s*Localizer\.DoStr\("([^"]+)"\)/.exec(body)?.[1]
    tagDefs.push({ name, display })
  }
}

// ---- Plant / crop growth parsing -------------------------------------------

// Parse a `*Species : (Plant|Tree)Species` block for growth data and its
// ResourceList item names. The harvested item is resolved later (see the merge
// step in main) by picking the Crop-tagged item (food crops) or, for trees, the
// Wood-tagged log. Capturing the ResourceList rather than filtering on a
// *SeedItem also catches crops that propagate via spores/bulbs or self-seed.
// Pull `new SpeciesResource(typeof(X), new Range(min, max), ...)` entries out of
// a ResourceList block, keeping declaration order. Entries without a Range are
// skipped rather than defaulted — a missing range would silently become 0-0 and
// read downstream as "this crop never yields".
function extractSpeciesResources(block: string): { name: string; min: number; max: number }[] {
  const out: { name: string; min: number; max: number }[] = []
  const re =
    /new\s+SpeciesResource\(\s*typeof\((\w+)\)\s*,\s*new\s+Range\(\s*(-?[\d.]+f?)\s*,\s*(-?[\d.]+f?)\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(block))) {
    const min = parseFloatLit(m[2])
    const max = parseFloatLit(m[3])
    if (Number.isNaN(min) || Number.isNaN(max)) continue
    out.push({ name: m[1], min, max })
  }
  return out
}

function parsePlantFile(src: string) {
  const classRe = /public\s+(?:partial\s+)?class\s+(\w+)Species\s*:\s*(Plant|Tree)Species\b/g
  let m: RegExpExecArray | null
  while ((m = classRe.exec(src))) {
    const isTree = m[2] === 'Tree'
    const open = src.indexOf('{', m.index)
    if (open < 0) continue
    const end = matchBrace(src, open)
    if (end < 0) continue
    const block = src.slice(open, end)

    const rlStart = block.search(/ResourceList\s*=\s*new\s+List<SpeciesResource>\s*\(\)/)
    if (rlStart < 0) continue
    const rlOpen = block.indexOf('{', rlStart)
    if (rlOpen < 0) continue
    const rlEnd = matchBrace(block, rlOpen)
    if (rlEnd < 0) continue
    const resources = extractSpeciesResources(block.slice(rlOpen, rlEnd))
    if (resources.length === 0) continue

    const displayName = /DisplayName\s*=\s*Localizer\.DoStr\("([^"]+)"\)/.exec(block)?.[1]
    if (!displayName) continue

    const maturity = parseFloatLit(/MaturityAgeDays\s*=\s*([\d.]+f?)/.exec(block)?.[1] ?? '0')
    const postHarvest = parseFloatLit(
      /PostHarvestingGrowth\s*=\s*([\d.]+f?)/.exec(block)?.[1] ?? '0'
    )
    const pickable = parseFloatLit(/PickableAtPercent\s*=\s*([\d.]+f?)/.exec(block)?.[1] ?? '0')
    if (!(maturity > 0)) continue

    rawPlants.push({
      speciesName: m[1],
      displayName,
      resources,
      isTree,
      maturityAgeDays: maturity,
      postHarvestingGrowth: Number.isNaN(postHarvest) ? 0 : postHarvest,
      pickableAtPercent: Number.isNaN(pickable) ? 0 : pickable,
    })
  }
}

// ---- Gathering parsers ------------------------------------------------------

/** Pairs each class declaration in `src` with the attribute text immediately
 * preceding it. Rubble files pack attributes and declarations onto shared
 * lines, so the backward line-walk used by parseItemAndRecipeFile doesn't fit;
 * slicing between consecutive declarations does. */
function classesWithAttributes(src: string): { name: string; base: string; attrs: string }[] {
  const re = /public\s+(?:partial\s+)?class\s+(\w+)\s*:\s*([^\s{]+)/g
  const out: { name: string; base: string; attrs: string }[] = []
  let prevEnd = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    out.push({ name: m[1], base: m[2], attrs: src.slice(prevEnd, m.index) })
    prevEnd = re.lastIndex
  }
  return out
}

/** Every `[BecomesRubble(typeof(A), typeof(B), ...)]` in `attrs`, as one entry
 * per attribute (a block declares one per alternative spawn set). */
function parseBecomesRubble(attrs: string): string[][] {
  const out: string[][] = []
  const re = /\[BecomesRubble\(([^\]]*?)\)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrs))) {
    const names = [...m[1].matchAll(/typeof\((\w+)\)/g)].map((x) => x[1])
    if (names.length > 0) out.push(names)
  }
  return out
}

/**
 * AutoGen/Rubble/<X>.cs. A minable block declares several alternative
 * `[BecomesRubble(...)]` sets; a chunk tagged MinableRubble carries its own
 * BecomesRubble and needs one extra pickaxe swing to split into pickupables.
 *
 * Counting the graph rather than hardcoding matters: v11 ships 11 rubble
 * materials against 12 Minable blocks (SlagBlock has no rubble file at all and
 * therefore yields nothing).
 */
function parseRubbleFile(src: string) {
  const classes = classesWithAttributes(src)
  if (classes.length === 0) return

  const childrenOf = new Map<string, string[][]>()
  let itemName = ''
  let blockName = ''
  for (const c of classes) {
    const sets = parseBecomesRubble(c.attrs)
    if (sets.length > 0) childrenOf.set(c.name, sets)
    if (c.base === 'Block') blockName = c.name
    const rubbleOf = /^RubbleObject<(\w+)>$/.exec(c.base)
    if (rubbleOf && !itemName) itemName = rubbleOf[1]
  }
  if (!blockName || !itemName) return
  const rootSets = childrenOf.get(blockName)
  if (!rootSets || rootSets.length === 0) return

  // A node with its own BecomesRubble is breakable: it costs one extra swing
  // and resolves to its children. Anything else is a single pickupable item.
  const walk = (node: string): { leaves: number; breaks: number } => {
    const sets = childrenOf.get(node)
    if (!sets || sets.length === 0) return { leaves: 1, breaks: 0 }
    let leaves = 0
    let breaks = 1
    for (const child of sets[0]) {
      const sub = walk(child)
      leaves += sub.leaves
      breaks += sub.breaks
    }
    return { leaves, breaks }
  }

  let totalLeaves = 0
  let totalBreaks = 0
  let maxLeaves = 0
  for (const set of rootSets) {
    let leaves = 0
    let breaks = 0
    for (const child of set) {
      const sub = walk(child)
      leaves += sub.leaves
      breaks += sub.breaks
    }
    totalLeaves += leaves
    totalBreaks += breaks
    if (leaves > maxLeaves) maxLeaves = leaves
  }

  rawRubble.set(blockName, {
    itemName,
    itemsPerBlock: totalLeaves / rootSets.length,
    maxItemsPerBlock: maxLeaves,
    extraHitsPerBlock: totalBreaks / rootSets.length,
  })
}

/**
 * AutoGen/Tool/<X>.cs. The generated `private static IDynamicValue` block is
 * one statement per line, so each assignment can be read in isolation.
 *
 * `EfficiencyTalent`/`StrengthTalent` are recorded by name and resolved at
 * import time; the abstract `ToolEfficiencyTalent` that shovels, hammers and
 * bows reference is never granted to any skill, so it resolves to nothing and
 * becomes a no-op without needing a special case here.
 */
function parseToolFile(src: string) {
  // Drills are deliberately excluded: DrillItem only prospects (surveys what
  // is underground) and never breaks a block, so it has no damage value.
  const classRe = /public\s+partial\s+class\s+(\w+Item)\s*:\s*(Pickaxe|Shovel|Axe|Bow)Item\b/g
  let m: RegExpExecArray | null
  while ((m = classRe.exec(src))) {
    const name = m[1]
    const kind = m[2]
    const open = src.indexOf('{', classRe.lastIndex)
    if (open < 0) continue
    const end = matchBrace(src, open)
    if (end < 0) continue
    const body = src.slice(open, end)

    const stmt = (field: string): string =>
      new RegExp(`\\b${field}\\s*=([^;]*);`).exec(body)?.[1] ?? ''

    const calStmt = stmt('caloriesBurn')
    const cal = /CreateCalorieValue\(\s*(-?[\d.]+f?)\s*,\s*typeof\((\w+)\)/.exec(calStmt)
    if (!cal) continue // a tool with no calorie cost isn't a gathering tool

    const dmgStmt = stmt('damage')
    const dmgCurve = /CreateDamageValue\(\s*(-?[\d.]+f?)\s*,\s*typeof\((\w+)\)/.exec(dmgStmt)
    const dmgConst = /new\s+ConstantValue\(\s*(-?[\d.]+f?)\s*\)/.exec(dmgStmt)

    // The strength talent is summed into damage/perkDamage with an explicit
    // base of 0; the efficiency talent multiplies calories with a base of 1.
    const strengthTalent =
      /TalentModifiedValue\(typeof\(\w+\),\s*typeof\((\w+Talent)\)\s*,\s*0\s*\)/.exec(
        dmgStmt + stmt('perkDamage')
      )?.[1]
    const efficiencyTalent =
      /TalentModifiedValue\(typeof\(\w+\),\s*typeof\((\w+Talent)\)\s*\)/.exec(calStmt)?.[1]

    const maxTake = /MaxTake\s*=>\s*(\d+)/.exec(body)?.[1]

    rawTools.push({
      name,
      kind,
      tier: parseFloatLit(
        /\btier\s*=\s*new\s+ConstantValue\(\s*(-?[\d.]+f?)\s*\)/.exec(body)?.[1] ?? '0'
      ),
      baseCalories: parseFloatLit(cal[1]),
      calorieSkill: cal[2],
      baseDamage: parseFloatLit(dmgCurve?.[1] ?? dmgConst?.[1] ?? '0'),
      damageUsesToolCurve: dmgCurve != null,
      efficiencyTalent,
      strengthTalent,
      maxTake: maxTake ? Number(maxTake) : undefined,
    })
  }
}

/** AutoGen/Clothing/<X>.cs — the `UserStatType.CalorieRate` flat stat, a
 * negative per-action calorie modifier (e.g. -0.3 for Builder Boots). */
function parseClothingFile(src: string) {
  const classRe = /public\s+partial\s+class\s+(\w+Item)\s*:\s*\n?\s*ClothingItem\b/g
  let m: RegExpExecArray | null
  while ((m = classRe.exec(src))) {
    const open = src.indexOf('{', classRe.lastIndex)
    if (open < 0) continue
    const end = matchBrace(src, open)
    if (end < 0) continue
    const rate = /UserStatType\.CalorieRate\s*,\s*(-?[\d.]+f?)/.exec(src.slice(open, end))
    if (!rate) continue
    const value = parseFloatLit(rate[1])
    if (Number.isNaN(value) || value === 0) continue
    ensureItem(m[1]).clothingCalorieRate = value
  }
}

/** AutoGen/Animal/<X>.cs — `AnimalSpecies.Health` plus the carcass it drops. */
function parseAnimalFile(src: string) {
  const classRe = /public\s+(?:partial\s+)?class\s+(\w+)Species\s*:\s*AnimalSpecies\b/g
  let m: RegExpExecArray | null
  while ((m = classRe.exec(src))) {
    const open = src.indexOf('{', m.index)
    if (open < 0) continue
    const end = matchBrace(src, open)
    if (end < 0) continue
    const block = src.slice(open, end)

    const health = parseFloatLit(/this\.Health\s*=\s*(-?[\d.]+f?)/.exec(block)?.[1] ?? '')
    if (!(health > 0)) continue
    const displayName = /DisplayName\s*=\s*Localizer\.DoStr\("([^"]+)"\)/.exec(block)?.[1]
    if (!displayName) continue

    const rlStart = block.search(/ResourceList\s*=\s*new\s+List<SpeciesResource>\s*\(\)/)
    if (rlStart < 0) continue
    const rlOpen = block.indexOf('{', rlStart)
    if (rlOpen < 0) continue
    const rlEnd = matchBrace(block, rlOpen)
    if (rlEnd < 0) continue
    const resources = extractSpeciesResources(block.slice(rlOpen, rlEnd))
    if (resources.length === 0) continue

    rawAnimals.push({ displayName, health, resources })
  }
}

/** Organisms/Tree/<X>.cs — `TreeHealth`, the trunk hit points that set how many
 * swings it takes to fell the tree. Lives outside AutoGen and is keyed by
 * species stem, joining to the ResourceList parsed from AutoGen/Plant/<X>.cs. */
function parseTreeHealthFile(src: string) {
  const classRe = /public\s+partial\s+class\s+(\w+)Species\s*:\s*TreeSpecies\b/g
  let m: RegExpExecArray | null
  while ((m = classRe.exec(src))) {
    const open = src.indexOf('{', classRe.lastIndex)
    if (open < 0) continue
    const end = matchBrace(src, open)
    if (end < 0) continue
    const block = src.slice(open, end)
    const treeHealth = parseFloatLit(/this\.TreeHealth\s*=\s*(-?[\d.]+f?)/.exec(block)?.[1] ?? '')
    if (!(treeHealth > 0)) continue
    rawTreeHealth.set(m[1], { treeHealth })
  }
}

// ---- Shared Init-block parsers (used by both RecipeFamily parents and
// AddTagProduct variants; the two call sites differ only in whether Init is
// invoked on a local `recipe` var or on `this`) ------------------------------

function parseIngredientsFromBody(body: string): ElementJson[] {
  const block =
    /ingredients:\s*new\s+List<IngredientElement>\s*\{([\s\S]*?)\}\s*,/.exec(body)?.[1] ?? ''
  const out: ElementJson[] = []
  const re1 =
    /new\s+IngredientElement\(\s*typeof\((\w+)\)\s*,\s*([0-9.\-+f]+)(?:\s*,\s*(?:typeof\((\w+)\)|true|false))?(?:\s*,\s*typeof\((\w+)\))?\s*\)/g
  let mm: RegExpExecArray | null
  while ((mm = re1.exec(block))) {
    const itemName = mm[1]
    const qty = parseFloatLit(mm[2])
    const mods: ModifierJson[] = []
    if (mm[3]) mods.push(classifyModifier(mm[3], 'ingredient'))
    if (mm[4]) mods.push(classifyModifier(mm[4], 'ingredient'))
    ensureItem(itemName)
    out.push({ ItemOrTag: itemName, Quantity: { BaseValue: qty, Modifiers: mods } })
  }
  const re2 =
    /new\s+IngredientElement\(\s*"([^"]+)"\s*,\s*([0-9.\-+f]+)(?:\s*,\s*(?:typeof\((\w+)\)|true|false))?(?:\s*,\s*typeof\((\w+)\))?\s*\)/g
  while ((mm = re2.exec(block))) {
    const tag = mm[1]
    const qty = parseFloatLit(mm[2])
    const mods: ModifierJson[] = []
    if (mm[3]) mods.push(classifyModifier(mm[3], 'ingredient'))
    if (mm[4]) mods.push(classifyModifier(mm[4], 'ingredient'))
    out.push({ ItemOrTag: tag, Quantity: { BaseValue: qty, Modifiers: mods } })
  }
  return out
}

// ---- Garbage outputs (v14) --------------------------------------------------
//
// `garbages: new List<GarbageOutput> { new GarbageOutput(typeof(Trash), 0.2f), }`
// sits between `ingredients:` and `items:` in recipe.Init(...). Absent entirely
// in v11–v13; frequently present-but-empty in v14, which is not an error.
//
// Values here are LITERAL output quantities — unlike the salvage-derived half of
// a recipe's garbage, they are NOT scaled by CraftGarbageRatio. Keeping that
// distinction is the whole reason these are extracted separately from
// ItemJson.SalvageCost.
function parseGarbageFromBody(body: string, recipeName: string): GarbageQuantityJson[] {
  const block = /garbages:\s*new\s+List<GarbageOutput>\s*\{([\s\S]*?)\}\s*,/.exec(body)?.[1]
  if (!block) return []
  const out: GarbageQuantityJson[] = []
  const re = /new\s+GarbageOutput\(\s*typeof\((\w+)\)\s*,\s*([0-9.\-+f]+)\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(block))) {
    const qty = parseFloatLit(m[2])
    if (Number.isNaN(qty)) {
      throw new Error(
        `[extract] recipe ${recipeName}: unparseable GarbageOutput quantity for ${m[1]}`
      )
    }
    out.push({ ItemOrTag: m[1], Quantity: qty })
  }
  return out
}

function parseProductsFromBody(body: string): ElementJson[] {
  const block =
    /items:\s*new\s+List<CraftingElement>\s*\{([\s\S]*?)\}\s*\)\s*;/.exec(body)?.[1] ?? ''
  const out: ElementJson[] = []
  // Match arg list while respecting one level of nesting for `typeof(...)`.
  // A naive `[^)]*` stops at the inner `)` of `typeof(SmeltingSkill)`,
  // truncating both the skill modifier and the trailing quantity argument
  // (e.g. `(typeof(SmeltingSkill), 2)` was being read as `typeof(SmeltingSkill`,
  // dropping the qty=2 and the modifier).
  const re = /new\s+CraftingElement<(\w+)>\(((?:typeof\(\w+\)|[^)])*)\)/g
  let mm: RegExpExecArray | null
  while ((mm = re.exec(block))) {
    const itemName = mm[1]
    const argList = mm[2].trim()
    let qty = 1
    const mods: ModifierJson[] = []
    if (argList) {
      const parts = argList.split(',').map((s) => s.trim())
      for (const p of parts) {
        const tt = /typeof\((\w+)\)/.exec(p)
        if (tt) mods.push(classifyModifier(tt[1], 'ingredient'))
        else {
          const n = parseFloatLit(p)
          if (!Number.isNaN(n)) qty = n
        }
      }
    }
    ensureItem(itemName)
    out.push({ ItemOrTag: itemName, Quantity: { BaseValue: qty, Modifiers: mods } })
  }
  return out
}

// ---- PartsComponent parsing -------------------------------------------------

function parsePartsFromBody(body: string): Array<{ typeName: string; quantity: number }> {
  const configMatch =
    /GetComponent<PartsComponent>\(\)\.Config\([\s\S]*?new\s+PartInfo\[\]\s*/.exec(body)
  if (!configMatch) return []
  const arrayStart = body.indexOf('{', configMatch.index + configMatch[0].length)
  if (arrayStart < 0) return []
  const arrayEnd = matchBrace(body, arrayStart)
  if (arrayEnd < 0) return []
  const block = body.slice(arrayStart + 1, arrayEnd - 1)
  const out: Array<{ typeName: string; quantity: number }> = []
  const re = /TypeName\s*=\s*nameof\((\w+)\)\s*,\s*Quantity\s*=\s*(\d+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(block))) out.push({ typeName: m[1], quantity: Number(m[2]) })
  return out
}

// ---- Item + Recipe parsing (run on every AutoGen .cs) -----------------------

function parseItemAndRecipeFile(src: string) {
  // ----- Items -----
  // Strategy: find each [LocDisplayName("...")] (and surrounding attribute block)
  // immediately preceding `public [partial] class XXX(Item|Object|Block|...) : ...`.
  // `partial` is optional — handwritten files outside AutoGen often declare
  // items with plain `public class` (e.g. SoilSamplerItem, DirtItem).
  const itemClassRe =
    /public\s+(?:partial\s+)?class\s+(\w+(?:Item|Object|Block|Book|Scroll))\s*:\s*([^\s{]+)/g
  let m: RegExpExecArray | null
  while ((m = itemClassRe.exec(src))) {
    const name = m[1]
    const baseClass = m[2]
    // Walk backward line-by-line collecting the contiguous attribute block.
    // Accept lines that start with `[`, are blank, or are `//` comments. Stop
    // at anything else (closing brace, code, etc). Lines starting with `[` may
    // span continuations — re-glue them by checking bracket balance.
    const before = src.slice(0, m.index)
    const lines = before.split('\n')
    const collected: string[] = []
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim()
      if (
        trimmed === '' ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('*') ||
        trimmed.endsWith('*/')
      ) {
        collected.unshift(lines[i])
        continue
      }
      // An attribute line either starts with `[` or is a continuation of one
      // (a previous line had unbalanced brackets).
      if (trimmed.startsWith('[') || /[\],]\s*(\/\/.*)?$/.test(trimmed)) {
        collected.unshift(lines[i])
        continue
      }
      break
    }
    const attrs = collected.join('\n')
    if (name.endsWith('Recipe')) continue
    // Only set display when LocDisplayName(...) is actually present. Items
    // can be declared in multiple places (AutoGen partial + handwritten partial),
    // and the handwritten part typically lacks the attribute — overwriting with
    // the raw class name would clobber the good AutoGen-derived display. Match
    // both standalone `[LocDisplayName("X")]` and combined-attribute forms like
    // `[Serialized, LocDisplayName("X")]` (handwritten files mix both styles).
    const displayMatch = /\bLocDisplayName\("([^"]+)"\)/.exec(attrs)
    const display = displayMatch?.[1]
    const it = ensureItem(name, display)
    if (display) it.display = display

    if (baseClass === 'PartItem') it.isPart = true

    if (name.endsWith('Object')) {
      const after = src.slice(m.index, m.index + 12000)
      const parts = parsePartsFromBody(after)
      if (parts.length > 0) {
        const itemRaw = ensureItem(name.replace(/Object$/, 'Item'))
        itemRaw.requiredParts = parts
      }
    }

    // Tags from attributes (dedupe: same item declared in two files would
    // otherwise accumulate duplicate tag entries)
    const tagRe = /\[Tag\("([^"]+)"/g
    let tm: RegExpExecArray | null
    while ((tm = tagRe.exec(attrs))) {
      if (!it.tags.includes(tm[1])) it.tags.push(tm[1])
    }

    // Gathering attributes. `[Minable(N)]` sits on the *block* class, so stash
    // it by block name and record the block's RepresentedItemType; the two are
    // joined to the item after pass 1 (the item may be declared elsewhere).
    // `[RequiresTool(typeof(ShovelItem))]` is the only RequiresTool usage in
    // the game and marks everything dug with a shovel.
    // Written as a combined attribute — `[Solid, Wall, Cliff, Minable(3)]` —
    // so this must not anchor on the enclosing brackets.
    const minable = /\bMinable\((\d+)\)/.exec(attrs)
    if (minable) {
      rawMinables.set(name, Number(minable[1]))
      const represented = /RepresentedItemType\s*\{[^}]*typeof\((\w+Item)\)/.exec(
        src.slice(m.index, m.index + 2000)
      )
      if (represented) blockToItem.set(name, represented[1])
    }
    if (/\[RequiresTool\(typeof\(ShovelItem\)\)\]/.test(attrs)) it.requiresShovel = true

    // Crafting table plugin module detection from [AllowPluginModules] attribute.
    // The attribute can appear on *Object classes (checked via attrs or nearby source)
    // or directly on *Item classes (e.g. items extending ModuleItem<...>).
    {
      const tableName = name.endsWith('Object') ? name.replace(/Object$/, 'Item') : name
      const allow =
        /\[AllowPluginModules\((.*?)\)\]/.exec(attrs) ??
        (name.endsWith('Object')
          ? /\[AllowPluginModules\((.*?)\)\]/.exec(src.slice(Math.max(0, m.index - 1500), m.index))
          : null)
      if (allow) {
        const tableItem = name.endsWith('Object') ? ensureItem(tableName, display) : it
        tableItem.isCraftingTable = true
        const args = allow[1]
        const tags: string[] = []
        const itemTypes: string[] = []
        const tagsArr = /Tags\s*=\s*new\[\]\s*\{([^}]*)\}/.exec(args)?.[1]
        if (tagsArr) {
          for (const s of tagsArr.matchAll(/"([^"]+)"/g)) tags.push(s[1])
        }
        const itArr = /ItemTypes\s*=\s*new\[\]\s*\{([^}]*)\}/.exec(args)?.[1]
        if (itArr) {
          for (const s of itArr.matchAll(/typeof\((\w+)\)/g)) itemTypes.push(s[1])
        }
        if (tags.length) tableItem.craftingTableModuleTags = tags
        if (itemTypes.length) tableItem.craftingTableModuleItems = itemTypes
      }
    }

    // Plugin module detection: real plugin modules extend EfficiencyModule (not ModuleItem which is for crafting tables that host modules)
    if (/EfficiencyModule/.test(baseClass)) {
      it.isPluginModule = true
      const classOpenIdx = src.indexOf('{', m.index + m[0].length)
      const classCloseIdx = classOpenIdx >= 0 ? matchBrace(src, classOpenIdx) : -1
      const classBody =
        classOpenIdx >= 0 && classCloseIdx >= 0
          ? src.slice(classOpenIdx, classCloseIdx)
          : src.slice(m.index, m.index + 4000)

      // ---- Version gate -----------------------------------------------------
      // The discriminator is the PRESENCE OF THE `Bonuses` OVERRIDE, never the
      // presence of a `base(...)` ctor. v14 modules still declare a ctor —
      // `base(ModuleTypes.None, 1f)` — and the legacy parser below reads it
      // quite happily: `ModuleTypes.None` matches none of the Resource/Speed/
      // Skill tests so `pluginType` stays unset, while `pluginModulePercent` is
      // set to 1. That is a silent no-op module (a 0% discount) that passes
      // validation, and it would also fool the import-time normalizer into
      // treating a v14 module as legacy. Gate on the override instead.
      const hasBonusOverride = /override\s+IEnumerable<Bonus>\s+Bonuses/.test(classBody)

      if (hasBonusOverride) {
        // ---- v14 shape ------------------------------------------------------
        const { bonuses, unparsed } = parseBonusObjects(classBody)
        if (unparsed.length > 0) {
          // Hard failure, not a `continue`. Every v14 module effect is either
          // AdditivePercent or Multiplicative and both parse; anything else means
          // the format moved under us, and dropping it silently would understate
          // a discount rather than break loudly.
          const detail = unparsed.map((u) => `${u.effectType} (${u.reason})`).join(', ')
          throw new Error(
            `[extract] plugin module ${name}: ${unparsed.length} bonus(es) could not be parsed: ${detail}`
          )
        }
        if (bonuses.length === 0) {
          throw new Error(
            `[extract] plugin module ${name} declares 'override IEnumerable<Bonus> Bonuses' but no bonuses were parsed from it`
          )
        }
        it.moduleBonuses = bonuses

        // Slot comes from the [Tag("BasicModule"|…)] attribute. Read it from the
        // attribute block rather than inferring from the class name: the three
        // Mining specialty modules are named MiningBasicUpgradeItem /
        // MiningAdvancedUpgradeItem / MiningModernUpgradeItem but are all tagged
        // SpecialtyModule, and they are exactly the three modules whose values
        // differ from the specialty norm. Name-based classification would file
        // them into the generic slots with the wrong effects.
        const slot = /\[Tag\("(Basic|Advanced|Modern|Specialty)Module"/.exec(attrs)?.[1]
        if (slot) it.moduleSlot = slot

        if (/deprecated item/i.test(attrs)) it.isDeprecated = true

        // The 12 tier-ladder `*Lvl1-4` modules carry no slot tag and no recipe;
        // all of them are deprecated. A module with neither a slot nor a
        // deprecation marker means a new slot tag we don't know about.
        if (!it.moduleSlot && !it.isDeprecated) {
          throw new Error(
            `[extract] plugin module ${name} has no [Tag("<slot>Module")] and is not marked deprecated`
          )
        }
      } else {
        // ---- v11–v13 legacy shape -------------------------------------------
        // Retained (not deleted) because the extractor must still run against a
        // v11–v13 tree; the bundled eco-v11/v12/v13.json keep this shape and are
        // normalized at import time.
        const ctor = /base\(([\s\S]*?)\)\s*\{/.exec(classBody)
        if (ctor) {
          const args = ctor[1].split(',').map((s) => s.trim())
          // arg0: ModuleTypes flags (e.g. ModuleTypes.ResourceEfficiency | ModuleTypes.SpeedEfficiency)
          // arg1: percent (number expression)
          // arg2: typeof(SomeSkill)
          // arg3: skill percent
          const flags = args[0] ?? ''
          const typeNames: string[] = []
          if (/ResourceEfficiency/.test(flags)) typeNames.push('Resource')
          if (/SpeedEfficiency/.test(flags)) typeNames.push('Speed')
          if (/SkillEfficiency/.test(flags)) typeNames.push('Skill')
          if (typeNames.length) it.pluginType = typeNames.join('&')
          if (args[1]) {
            const v = parseFloatLit(args[1])
            if (!Number.isNaN(v)) it.pluginModulePercent = v
          }
          const sk = /typeof\((\w+)\)/.exec(args[2] ?? '')?.[1]
          if (sk) it.pluginModuleSkill = sk
          if (args[3]) {
            const v = parseFloatLit(args[3])
            if (!Number.isNaN(v)) it.pluginModuleSkillPercent = v
          }
        }
      }
    }

    // ---- SalvageCost (v14) --------------------------------------------------
    // `[SalvageCost(typeof(Mat), qty, typeof(Mat2), qty2, …)]` — flat pairs.
    // Materials are resolved to real items after pass 1, once
    // GarbageMaterials.cs has been read.
    {
      const sc = /\[SalvageCost\(([\s\S]*?)\)\]/.exec(attrs)?.[1]
      if (sc) {
        const pairs: Array<{ material: string; quantity: number }> = []
        const pairRe = /typeof\((\w+)\)\s*,\s*([0-9.\-+f]+)/g
        let pm: RegExpExecArray | null
        while ((pm = pairRe.exec(sc))) {
          const qty = parseFloatLit(pm[2])
          if (Number.isNaN(qty)) {
            throw new Error(`[extract] item ${name}: unparseable SalvageCost quantity for ${pm[1]}`)
          }
          pairs.push({ material: pm[1], quantity: qty })
        }
        if (pairs.length) it.salvageCost = pairs
      }
    }
  }

  // ----- Recipes -----
  const recipeClassRe =
    /(?:\[RequiresSkill\(typeof\((\w+Skill)\)\s*,\s*(\d+)\)\][\s\S]*?)?public\s+partial\s+class\s+(\w+Recipe)\s*:\s*RecipeFamily/g
  let r: RegExpExecArray | null
  while ((r = recipeClassRe.exec(src))) {
    const requiredSkill = r[1] ?? ''
    const requiredSkillLevel = r[2] ? Number(r[2]) : 0
    const className = r[3]
    // Body slice
    const start = src.indexOf('{', recipeClassRe.lastIndex)
    if (start < 0) continue
    const body = src.slice(start, start + 10000)

    const recipeName =
      /recipe\.Init\(\s*name:\s*"([^"]+)"/.exec(body)?.[1] ?? className.replace(/Recipe$/, '')
    const displayName = /displayName:\s*Localizer\.DoStr\("([^"]+)"\)/.exec(body)?.[1] ?? recipeName

    const ingredients = parseIngredientsFromBody(body)
    const products = parseProductsFromBody(body)
    const garbageOutputs = parseGarbageFromBody(body, className)

    // Labor
    let labor: DynamicValueJson = { BaseValue: 0, Modifiers: [] }
    const laborM =
      /CreateLaborInCaloriesValue\(\s*([0-9.\-+f]+)\s*((?:,\s*typeof\(\w+\))*)\s*\)/.exec(body)
    if (laborM) {
      labor.BaseValue = parseFloatLit(laborM[1])
      const tre = /typeof\((\w+)\)/g
      let tm: RegExpExecArray | null
      while ((tm = tre.exec(laborM[2]))) labor.Modifiers.push(classifyModifier(tm[1], 'labor'))
    }

    // CraftMinutes
    let craftMinutes: DynamicValueJson = { BaseValue: 0, Modifiers: [] }
    const cmM = /CreateCraftTimeValue\(([^;]*?)\)\s*;/.exec(body)
    if (cmM) {
      const args = cmM[1]
      const startV = /start:\s*([0-9.\-+f]+)/.exec(args)?.[1]
      if (startV) craftMinutes.BaseValue = parseFloatLit(startV)
      // Skill type then trailing typeof talents
      const sk = /skillType:\s*typeof\((\w+)\)/.exec(args)?.[1]
      if (sk) craftMinutes.Modifiers.push(classifyModifier(sk, 'craftMinutes'))
      // Any other typeof references after skillType
      const after = sk ? args.slice(args.indexOf(sk) + sk.length) : args
      const tre = /typeof\((\w+)\)/g
      let tm: RegExpExecArray | null
      while ((tm = tre.exec(after))) {
        if (tm[1] === sk) continue
        craftMinutes.Modifiers.push(classifyModifier(tm[1], 'craftMinutes'))
      }
    }

    // Crafting table
    const ct = /CraftingComponent\.AddRecipe\(\s*tableType:\s*typeof\((\w+)\)/.exec(body)?.[1]
    const craftingTable = ct ? ct.replace(/Object$/, 'Item') : ''
    if (craftingTable) {
      const tableItem = ensureItem(craftingTable)
      tableItem.isCraftingTable = true
    }

    const rec: RecipeJson = {
      Name: className,
      LocalizedName: enLocalized(displayName),
      FamilyName: displayName,
      CraftMinutes: craftMinutes,
      RequiredSkill: requiredSkill,
      RequiredSkillLevel: requiredSkillLevel,
      IsBlueprint: false,
      IsDefault: true,
      Labor: labor,
      CraftingTable: craftingTable,
      Ingredients: ingredients,
      Products: products,
    }
    if (garbageOutputs.length) rec.GarbageOutputs = garbageOutputs
    recipes.push(rec)
  }
}

// ---- AddTagProduct variant parsing ------------------------------------------
//
// A variant is a `class <X>Recipe : Recipe` (not RecipeFamily) whose
// constructor calls `CraftingComponent.AddTagProduct(table, typeof(Parent), this)`.
// It overrides ingredients/products of its parent RecipeFamily (typically
// narrowing a tag ingredient like "Wood" to a concrete tag like "Hardwood"
// and producing a concrete product item) and inherits labor, craft-time,
// skill requirements, etc. from the parent. Variants live throughout the
// AutoGen tree — Recipe/, Block/, Item/, WorldObject/ — so we run this parser
// on every file and let the AddTagProduct call be the filter.
function parseRecipeVariantFile(src: string) {
  const classRe = /public\s+partial\s+class\s+(\w+Recipe)\s*:\s*Recipe\b/g
  let m: RegExpExecArray | null
  while ((m = classRe.exec(src))) {
    const className = m[1]
    const start = src.indexOf('{', classRe.lastIndex)
    if (start < 0) continue
    const body = src.slice(start, start + 10000)

    const atp = /CraftingComponent\.AddTagProduct\(\s*typeof\((\w+)\)\s*,\s*typeof\((\w+)\)/.exec(
      body
    )
    if (!atp) continue
    const tableType = atp[1]
    const parentClassName = atp[2]

    const fallbackName = className.replace(/Recipe$/, '')
    const displayName =
      /displayName:\s*Localizer\.DoStr\("([^"]+)"\)/.exec(body)?.[1] ?? fallbackName
    const ingredients = parseIngredientsFromBody(body)
    const products = parseProductsFromBody(body)
    // A variant declares its OWN `garbages:` list inside its own this.Init(...),
    // so it overrides the parent's rather than inheriting it — same as it does
    // for ingredients and products. Every variant's list is empty in v14.0.1, so
    // this is currently indistinguishable from inheriting-nothing; parsing it is
    // the reading that stays correct if one ever declares garbage.
    const garbageOutputs = parseGarbageFromBody(body, className)

    variants.push({
      className,
      displayName,
      ingredients,
      products,
      garbageOutputs,
      tableType,
      parentClassName,
    })
  }
}

function cloneDynamic(dv: DynamicValueJson): DynamicValueJson {
  return { BaseValue: dv.BaseValue, Modifiers: dv.Modifiers.map((md) => ({ ...md })) }
}

// Resolve collected variants against their parent recipes and emit them as
// sibling RecipeJson entries. Must run after all parents have been parsed.
function emitVariantRecipes() {
  const parentByClass = new Map(recipes.map((rec) => [rec.Name, rec]))
  for (const v of variants) {
    const parent = parentByClass.get(v.parentClassName)
    if (!parent) {
      console.warn(
        `[extract] variant ${v.className} references unknown parent ${v.parentClassName}; skipping`
      )
      continue
    }
    const craftingTable = v.tableType.replace(/Object$/, 'Item')
    if (craftingTable) {
      const tableItem = ensureItem(craftingTable)
      tableItem.isCraftingTable = true
    }
    const rec: RecipeJson = {
      Name: v.className,
      LocalizedName: enLocalized(v.displayName),
      FamilyName: parent.FamilyName,
      CraftMinutes: cloneDynamic(parent.CraftMinutes),
      RequiredSkill: parent.RequiredSkill,
      RequiredSkillLevel: parent.RequiredSkillLevel,
      IsBlueprint: false,
      IsDefault: parent.IsDefault,
      Labor: cloneDynamic(parent.Labor),
      CraftingTable: craftingTable,
      Ingredients: v.ingredients,
      Products: v.products,
    }
    if (v.garbageOutputs.length) rec.GarbageOutputs = v.garbageOutputs
    recipes.push(rec)
  }
}

// ---------------------------------------------------------------------------
// Strange Cloud paid items list ("blueprint" recipes)
//
// EcoServer ships a static `PaidItemsEmbeddedList.List` of class basenames whose
// recipes are gated by Strange Cloud / "Strange Blueprint" ownership. The
// per-recipe `Recipe.RequiresStrangeBlueprint` flag is populated asynchronously
// at boot, so it's unreliable for static extraction. The embedded list isn't
// exposed in source either, but the names appear as a contiguous run of
// length-prefixed UTF-16LE strings inside the EcoServer ELF — we anchor on a
// known first entry and read forward.
//
// Layout per .NET UserString-style entry (verified against v12.0.7 / v13.0.3):
//   [length_byte = chars*2 + 1] [N-1 bytes of UTF-16LE chars] [trailer_byte = 0x00 or 0x01]
// Adjacent entries follow back-to-back. Walk forward by reading length, then
// chars, then trailer; stop when the next string isn't a CamelCase identifier.
//
// Returns an empty Set on any failure (missing binary, anchor not found,
// pre-feature versions like v11). Callers fall back to IsBlueprint=false.

const PAID_ITEMS_ANCHOR = 'ZenGarden'

function readDotNetLengthPrefixedAt(
  buf: Buffer,
  off: number
): { str: string; next: number } | null {
  if (off < 0 || off >= buf.length) return null
  const len = buf[off]
  // Paid item names are short; reject multi-byte ECMA length encodings.
  if (len === 0 || (len & 0x80) !== 0) return null
  const charBytes = len - 1
  if (charBytes <= 0 || charBytes % 2 !== 0) return null
  if (off + 1 + charBytes + 1 > buf.length) return null
  const chars: number[] = []
  for (let k = 0; k < charBytes; k += 2) {
    const lo = buf[off + 1 + k]
    const hi = buf[off + 1 + k + 1]
    if (hi !== 0 || lo < 0x20 || lo > 0x7e) return null
    chars.push(lo)
  }
  return { str: String.fromCharCode(...chars), next: off + 1 + charBytes + 1 }
}

async function findPaidItems(ecoRoot: string): Promise<Set<string>> {
  const binPath = path.join(ecoRoot, 'Eco_Data', 'Server', 'EcoServer')
  let buf: Buffer
  try {
    buf = await fs.readFile(binPath)
  } catch {
    console.warn(`[extract] cannot read EcoServer at ${binPath}; IsBlueprint=false for all recipes`)
    return new Set()
  }

  const anchorBytes = Buffer.from(PAID_ITEMS_ANCHOR, 'utf16le')
  const expectedLenByte = PAID_ITEMS_ANCHOR.length * 2 + 1
  // Find an occurrence whose preceding byte is the exact length prefix —
  // rejects substring matches (e.g. v11's "ZenGardenCube") and stray data.
  let cursor = -1
  let anchorPos = -1
  while ((cursor = buf.indexOf(anchorBytes, cursor + 1)) !== -1) {
    if (cursor === 0) continue
    if (buf[cursor - 1] === expectedLenByte) {
      anchorPos = cursor
      break
    }
  }
  if (anchorPos < 0) {
    console.warn(
      `[extract] PaidItemsEmbeddedList anchor not found in EcoServer; IsBlueprint=false for all recipes (expected on pre-v12 binaries)`
    )
    return new Set()
  }

  const isItemBasename = (s: string) => /^[A-Z][A-Za-z0-9]{3,39}$/.test(s)
  const out = new Set<string>()
  let off = anchorPos - 1 // start at the length byte
  while (true) {
    const r = readDotNetLengthPrefixedAt(buf, off)
    if (!r) break
    if (!isItemBasename(r.str)) break
    out.add(r.str)
    off = r.next
  }
  return out
}

// ---------------------------------------------------------------------------
// Translations zip localization
//
// The Eco translation platform exports a zip of per-language CSVs with
// columns: location,source,target,id,fuzzy,context,translator_comments,
// developer_comments. We only consume the in-game strings, i.e. files named
// `eco-game-<locale>.csv` and `eco-ecopedia-<locale>.csv`. Other groups
// (`eco-web-client-*`, `eco-glossary-*`) are UI-chrome and out of scope.

const TRANSLATION_FILE_RE = /^eco-(?:game|ecopedia)-([A-Za-z_]+)\.csv$/

// Map platform locale codes to the canonical codes the app uses.
function normalizeLocale(code: string): string {
  // Underscore → hyphen (pt_BR → pt-BR, nb_NO → nb-NO, zh_Hans → zh-Hans).
  const dashed = code.replace(/_/g, '-')
  // Bare language codes the rest of the app expects with a region tag.
  if (dashed === 'en') return 'en-US'
  if (dashed === 'ar') return 'ar-sa'
  return dashed
}

function parseCsvRow(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQ = false
      } else cur += ch
    } else {
      if (ch === ',') {
        out.push(cur)
        cur = ''
      } else if (ch === '"') inQ = true
      else cur += ch
    }
  }
  out.push(cur)
  return out
}

function parseCsv(text: string): string[][] {
  // Handle embedded newlines in quoted fields by streaming.
  const rows: string[][] = []
  let buf = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      inQ = !inQ
      buf += ch
      continue
    }
    if (!inQ && (ch === '\n' || ch === '\r')) {
      if (buf.length) {
        rows.push(parseCsvRow(buf))
        buf = ''
      }
      if (ch === '\r' && text[i + 1] === '\n') i++
      continue
    }
    buf += ch
  }
  if (buf.length) rows.push(parseCsvRow(buf))
  return rows
}

function loadTranslationsZip(zipPath: string): Map<string, LocalizedNames> {
  const map = new Map<string, LocalizedNames>()
  const zip = new AdmZip(zipPath)
  const entries = zip.getEntries()
  const localeCounts = new Map<string, number>()
  let fileCount = 0

  for (const entry of entries) {
    if (entry.isDirectory) continue
    const base = path.basename(entry.entryName)
    const m = TRANSLATION_FILE_RE.exec(base)
    if (!m) continue
    const locale = normalizeLocale(m[1])
    const csv = entry.getData().toString('utf8')
    const rows = parseCsv(csv)
    if (rows.length < 2) continue
    const header = rows[0]
    const srcCol = header.indexOf('source')
    const tgtCol = header.indexOf('target')
    if (srcCol < 0 || tgtCol < 0) {
      console.warn(`[translations] ${base}: missing source/target columns`)
      continue
    }
    let added = 0
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]
      const en = row[srcCol]
      const tgt = row[tgtCol]
      if (!en) continue
      let entry = map.get(en)
      if (!entry) {
        entry = { 'en-US': en }
        map.set(en, entry)
        added++
      }
      if (locale !== 'en-US' && tgt) entry[locale] = tgt
    }
    fileCount++
    localeCounts.set(locale, (localeCounts.get(locale) ?? 0) + rows.length - 1)
    console.log(`[translations] ${base}: parsed ${rows.length - 1} rows (+${added} new sources)`)
  }

  console.log(
    `[translations] loaded ${fileCount} CSV(s) across ${localeCounts.size} locale(s): ${[...localeCounts.keys()].sort().join(', ')}`
  )
  return map
}

function mergeLocalized(en: string, translations: Map<string, LocalizedNames>): LocalizedNames {
  const base: LocalizedNames = { 'en-US': en }
  const found = translations.get(en)
  if (found) Object.assign(base, found)
  return base
}

// ---------------------------------------------------------------------------
// Main

async function main() {
  const args = await parseArgs()
  const coreRoot = path.join(args.ecoRoot, 'Eco_Data', 'Server', 'Mods', '__core__')
  const autogen = path.join(coreRoot, 'AutoGen')
  console.log('[extract] eco core:', coreRoot)

  const csFiles = await walk(autogen)
  // Handwritten item-bearing dirs under __core__/. Some items (DirtItem,
  // FishingPoleItem, GarbageItem, …) are declared only here — never in
  // AutoGen — so without these dirs their LocDisplayName attribute is missed
  // and they end up named after their raw class name.
  const handwrittenDirs = [
    'Items',
    'Tools',
    'Blocks',
    'Objects',
    'Vehicles',
    'Rubble',
    'Settlements',
  ]
  const autogenCount = csFiles.length
  for (const sub of handwrittenDirs) {
    await walk(path.join(coreRoot, sub), csFiles)
  }
  console.log(
    `[extract] scanning ${csFiles.length} .cs files (autogen=${autogenCount}, handwritten=${csFiles.length - autogenCount})`
  )

  // Pass 1: read files and dispatch by directory
  for (const file of csFiles) {
    const src = await fs.readFile(file, 'utf8')
    if (file.includes(`${path.sep}Tech${path.sep}`)) parseSkillFile(src)
    if (file.includes(`${path.sep}Benefit${path.sep}`)) parseTalentFile(src)
    if (file.includes(`${path.sep}Plant${path.sep}`)) parsePlantFile(src)
    if (file.includes(`${path.sep}Animal${path.sep}`)) parseAnimalFile(src)
    // `Tool` (singular) is AutoGen/Tool/; the handwritten base classes live in
    // __core__/Tools/ (plural) and are deliberately not matched here.
    if (file.includes(`${path.sep}Tool${path.sep}`)) parseToolFile(src)
    if (file.includes(`${path.sep}Clothing${path.sep}`)) parseClothingFile(src)
    if (file.includes(`${path.sep}Rubble${path.sep}`)) parseRubbleFile(src)
    // GarbageMaterial subclasses live in __core__/Items/GarbageMaterials.cs
    // (handwritten, so reached via the handwrittenDirs walk). v14+ only.
    if (path.basename(file) === 'GarbageMaterials.cs') parseGarbageMaterialsFile(src)
    parseItemAndRecipeFile(src)
    // Variants are `class <X>Recipe : Recipe` with AddTagProduct(...). They
    // can live in any AutoGen subtree (Recipe/, Block/, Item/, WorldObject/);
    // the AddTagProduct call is the actual signal, and `: Recipe\b` excludes
    // `: RecipeFamily` because there's no word boundary before "Family".
    parseRecipeVariantFile(src)
  }
  emitVariantRecipes()
  if (variants.length > 0) {
    console.log(`[extract] emitted ${variants.length} recipe variants via AddTagProduct`)
  }

  // Pass 1b: resolve recipe GarbageOutputs from GarbageMaterial names to the real
  // items they yield. Item SalvageCost is resolved later, at emit time, but
  // recipes are already built by now so they get their own pass.
  //
  // The map is empty on v11–v13, where no recipe declares garbage either — so an
  // unresolved name there is impossible rather than merely unlikely. On v14 it
  // means GarbageMaterials.cs gained an entry we failed to parse, which would
  // otherwise ship a dangling item reference into the dataset.
  {
    let resolved = 0
    for (const r of recipes) {
      if (!r.GarbageOutputs) continue
      for (const g of r.GarbageOutputs) {
        const item = garbageMaterialToItem.get(g.ItemOrTag)
        if (!item) {
          throw new Error(
            `[extract] recipe ${r.Name}: GarbageOutput references unknown GarbageMaterial '${g.ItemOrTag}' ` +
              `(GarbageMaterials.cs yielded ${garbageMaterialToItem.size} materials)`
          )
        }
        g.ItemOrTag = item
        ensureItem(item)
        resolved++
      }
    }
    if (resolved > 0) {
      console.log(
        `[extract] resolved ${resolved} recipe garbage outputs across ${garbageMaterialToItem.size} garbage materials`
      )
    }
  }

  // Merge growth data onto each plant's harvested item. For food crops that's
  // the Crop-tagged entry in the species' ResourceList (e.g. CornItem,
  // CamasBulbItem, FiddleheadsItem); for trees it's the Wood-tagged log
  // (e.g. OakLogItem). Plants with neither (wild grasses) are skipped. The seed
  // link, when present, is the "Crop Seed"-tagged entry; crops that self-seed
  // point at themselves, while trees (whose saplings aren't in the ResourceList)
  // get no seed link.
  let cropCount = 0
  for (const plant of rawPlants) {
    const resourceItems = plant.resources.map((r) => items.get(r.name)).filter((it) => it != null)
    const harvest =
      resourceItems.find((it) => it.tags.includes('Crop')) ??
      (plant.isTree ? resourceItems.find((it) => it.tags.includes('Wood')) : undefined)
    if (!harvest) continue
    const seed = resourceItems.find((it) => it.tags.includes('Crop Seed'))
    harvest.maturityAgeDays = plant.maturityAgeDays
    harvest.postHarvestingGrowth = plant.postHarvestingGrowth
    harvest.pickableAtPercent = plant.pickableAtPercent
    // Always ResourceList[0], regardless of which entry we merged onto.
    harvest.primaryResourceMin = plant.resources[0].min
    harvest.primaryResourceMax = plant.resources[0].max
    harvest.plantDisplay = plant.displayName
    harvest.isTree = plant.isTree
    if (seed) harvest.seedItemName = seed.name
    cropCount++
  }
  console.log(`[extract] merged growth data onto ${cropCount} crop item(s)`)

  // Pass 1b: flag blueprint recipes from PaidItemsEmbeddedList (v12+).
  // A recipe is a blueprint iff any of its products' class basenames (with
  // trailing "Item" stripped) appears in the embedded paid-items list. The
  // in-game `Recipe.RequiresStrangeBlueprint` flag is populated asynchronously
  // by EcoMarketplaceManager and isn't reachable from the static C# we parse.
  const paidItems = await findPaidItems(args.ecoRoot)
  let blueprintCount = 0
  if (paidItems.size > 0) {
    for (const r of recipes) {
      const isBp = r.Products.some((p) => paidItems.has(p.ItemOrTag.replace(/Item$/, '')))
      if (isBp) {
        r.IsBlueprint = true
        blueprintCount++
      }
    }
    console.log(
      `[extract] paid items list: ${paidItems.size} entries; flagged ${blueprintCount} blueprint recipe(s)`
    )
  }

  // Pass 1c: v13 bonus system lives outside AutoGen in __core__/Benefits.
  // Each hand-written file declares `public partial class <X>Talent` whose
  // constructor registers Bonus objects; absent in v11/v12.
  const benefitsDir = path.join(coreRoot, 'Benefits')
  const benefitsFiles = await walk(benefitsDir)
  for (const file of benefitsFiles) {
    const base = path.basename(file)
    // Sample talents file contains test data, not real talents.
    if (base === 'SampleTalents.cs') continue
    const src = await fs.readFile(file, 'utf8')
    parseBonusFile(src)
  }
  if (benefitsFiles.length > 0) {
    console.log(
      `[extract] parsed ${benefitsFiles.length} bonus files; ${bonusesByTalentName.size} talents carry bonuses`
    )
  }

  // Pass 1d: tree health lives outside AutoGen in __core__/Organisms/Tree.
  // Walked on its own rather than added to `handwrittenDirs` so these files
  // don't also flow through parseItemAndRecipeFile — widening that walk risks
  // surfacing new item classes and breaking the `--compare` zero-delta gate.
  const treeDir = path.join(coreRoot, 'Organisms', 'Tree')
  const treeFiles = await walk(treeDir).catch(() => [] as string[])
  for (const file of treeFiles) {
    parseTreeHealthFile(await fs.readFile(file, 'utf8'))
  }

  // Merge gathering data onto the item each source yields. Mirrors the crop
  // merge above: species- and block-level facts are resolved to the item only
  // once every file has been read.
  let rockCount = 0
  const rubbleless: string[] = []
  for (const [blockName, hardness] of rawMinables) {
    const rubble = rawRubble.get(blockName)
    const itemName = blockToItem.get(blockName) ?? rubble?.itemName
    if (!itemName) continue
    // A block with no rubble graph (v11's SlagBlock) yields nothing at all —
    // emitting it would give the calculator a zero-yield divisor.
    if (!rubble || rubble.itemsPerBlock <= 0) {
      rubbleless.push(blockName)
      continue
    }
    const item = ensureItem(itemName)
    item.minableHardness = hardness
    item.rubbleItemsPerBlock = rubble.itemsPerBlock
    item.rubbleMaxItemsPerBlock = rubble.maxItemsPerBlock
    item.rubbleExtraHitsPerBlock = rubble.extraHitsPerBlock
    rockCount++
  }
  console.log(`[extract] merged rubble yield onto ${rockCount} minable item(s)`)
  if (rubbleless.length > 0) {
    console.warn(
      `[extract] ${rubbleless.length} minable block(s) have no rubble and were skipped: ${rubbleless.join(', ')}`
    )
  }

  // Carcasses. Restricted to drops named *CarcassItem, which excludes fish
  // (they drop BassItem etc.) and Tortoise (drops RawMeatItem directly, and
  // would otherwise stamp animal health onto the shared raw-meat item).
  let carcassCount = 0
  for (const animal of rawAnimals) {
    const drop = animal.resources[0]
    if (!drop || !drop.name.endsWith('CarcassItem')) continue
    const item = ensureItem(drop.name)
    item.animalHealth = animal.health
    item.animalDisplay = animal.displayName
    carcassCount++
  }
  console.log(`[extract] merged animal health onto ${carcassCount} carcass item(s)`)

  // Tree species. Emitted as their own section rather than flattened onto the
  // log item, because the mapping is many-to-one: Redwood and Old-Growth
  // Redwood both yield RedwoodLogItem with very different health and yields.
  // Localization happens in the emit section below, once the translations zip
  // has been read, so this pass keeps the raw en-US display name.
  const resolvedTreeSpecies: {
    name: string
    displayName: string
    logItem: string
    treeHealth: number
    min: number
    max: number
  }[] = []
  for (const plant of rawPlants) {
    if (!plant.isTree) continue
    const health = rawTreeHealth.get(plant.speciesName)
    if (!health) continue
    const log = plant.resources.find((r) => items.get(r.name)?.tags.includes('Wood'))
    if (!log) continue
    resolvedTreeSpecies.push({
      name: plant.speciesName,
      displayName: plant.displayName,
      logItem: log.name,
      treeHealth: health.treeHealth,
      min: log.min,
      max: log.max,
    })
  }
  resolvedTreeSpecies.sort((a, b) => a.name.localeCompare(b.name))
  console.log(`[extract] resolved ${resolvedTreeSpecies.length} tree species`)

  // Tag definitions
  try {
    const tagSrc = await fs.readFile(path.join(coreRoot, 'Systems', 'TagDefinitions.cs'), 'utf8')
    parseTagDefinitionsFile(tagSrc)
  } catch (e) {
    console.warn('[extract] TagDefinitions.cs missing:', (e as Error).message)
  }

  // Pass 1d: recipe-derived display fallback for items whose class lives only
  // in a compiled DLL (no .cs source anywhere — e.g. HomesteadClaimStakeItem).
  // When a recipe `<X>Recipe` produces `<X>Item` and the item still has no
  // [LocDisplayName]-derived display, adopt the recipe's displayName.
  let recipeFallbackCount = 0
  for (const r of recipes) {
    const recipeStem = r.Name.replace(/Recipe$/, '')
    const en = r.LocalizedName['en-US']
    if (!en || en === recipeStem) continue
    for (const product of r.Products) {
      const itemName = product.ItemOrTag
      const it = items.get(itemName)
      if (!it || it.display !== itemName) continue
      if (itemName.replace(/Item$/, '') !== recipeStem) continue
      it.display = en
      recipeFallbackCount++
    }
  }
  if (recipeFallbackCount > 0) {
    console.log(
      `[extract] derived ${recipeFallbackCount} item display name(s) from matching recipe displayName`
    )
  }

  // Pass 2: translations
  const translations = args.translationsZip
    ? loadTranslationsZip(args.translationsZip)
    : new Map<string, LocalizedNames>()
  if (!args.translationsZip) {
    console.warn('[extract] no --translations-zip provided; emitting en-US only')
  } else {
    console.log(`[extract] translation source strings cached: ${translations.size}`)
  }

  // Pass 3: cross-link

  // 3a) Tag → AssociatedItems (from item [Tag(...)] attributes)
  const tagItems = new Map<string, Set<string>>()
  for (const [name, it] of items) {
    for (const t of it.tags) {
      if (!tagItems.has(t)) tagItems.set(t, new Set())
      tagItems.get(t)!.add(name)
    }
  }

  // 3b) Resolve crafting table plugin module lists
  for (const it of items.values()) {
    if (!it.isCraftingTable) continue
    const set = new Set<string>()
    for (const tag of it.craftingTableModuleTags ?? []) {
      for (const member of tagItems.get(tag) ?? []) set.add(member)
    }
    for (const ti of it.craftingTableModuleItems ?? []) set.add(ti)
    if (set.size) it.CraftingTablePluginModules = [...set].sort()
  }

  // 3c) Build skill JSON with talents
  const skillByName = new Map<string, SkillJson>()
  for (const s of skills) {
    const json: SkillJson = {
      Name: s.name,
      LocalizedName: mergeLocalized(s.display, translations),
      Profession: s.profession,
      MaxLevel: s.maxLevel,
      LaborReducePercent: s.laborReducePercent,
      Talents: [],
    }
    if (s.specialtyCost !== undefined) json.SpecialtyCost = s.specialtyCost
    skillByName.set(s.name, json)
  }
  // Index talents by name
  const talentByName = new Map(talents.map((t) => [t.name, t]))

  // Resolve bonuses for a concrete talent by walking its base-class chain —
  // v13's pattern is that each concrete `<Skill><Base>Talent` extends a base
  // `<Base>Talent` whose constructor is partial-declared under Benefits/ with
  // the Bonus list. Collect the first non-empty bonus set on the way up.
  const resolveBonuses = (concreteName: string): RawBonus[] => {
    const visited = new Set<string>()
    let current: string | undefined = concreteName
    while (current && !visited.has(current)) {
      visited.add(current)
      const direct = bonusesByTalentName.get(current)
      if (direct && direct.length > 0) return direct
      const t = talentByName.get(current)
      if (!t) break
      current = t.baseClass
      if (current === 'Talent') break
    }
    return []
  }

  // Recipe indexes for scope resolution — built once, reused per bonus.
  const recipeByName = new Map(recipes.map((r) => [r.Name, r]))
  const recipesBySkill = new Map<string, RecipeJson[]>()
  for (const r of recipes) {
    if (!r.RequiredSkill) continue
    let list = recipesBySkill.get(r.RequiredSkill)
    if (!list) {
      list = []
      recipesBySkill.set(r.RequiredSkill, list)
    }
    list.push(r)
  }
  const recipesByCraftStationItem = new Map<string, RecipeJson[]>()
  for (const r of recipes) {
    if (!r.CraftingTable) continue
    let list = recipesByCraftStationItem.get(r.CraftingTable)
    if (!list) {
      list = []
      recipesByCraftStationItem.set(r.CraftingTable, list)
    }
    list.push(r)
  }
  // Fast ingredient/product tag-match lookup: (itemOrTagName) -> set of tags.
  const tagsByItemOrTag = new Map<string, Set<string>>()
  for (const [name, it] of items) {
    if (it.tags.length) tagsByItemOrTag.set(name, new Set(it.tags))
  }
  // Tag-name-as-its-own-match: if an ingredient references a tag directly, the
  // tag name matches itself.
  for (const tagName of tagItems.keys()) {
    let set = tagsByItemOrTag.get(tagName)
    if (!set) {
      set = new Set()
      tagsByItemOrTag.set(tagName, set)
    }
    set.add(tagName)
  }

  const ingredientMatchesTags = (itemOrTag: string, tags: Set<string>): boolean => {
    const owned = tagsByItemOrTag.get(itemOrTag)
    if (!owned) return false
    for (const t of tags) if (owned.has(t)) return true
    return false
  }

  const resolveScopeRecipes = (bonus: RawBonus): RecipeJson[] => {
    // Start from the narrowest index we have. Recipes > CraftStationTypes >
    // SkillTypes > all. Then filter with the remaining scope clauses.
    let candidates: RecipeJson[] | null = null
    if (bonus.recipes.length > 0) {
      candidates = []
      for (const n of bonus.recipes) {
        const r = recipeByName.get(n)
        if (r) candidates.push(r)
      }
    }
    if (candidates === null && bonus.craftStationTypes.length > 0) {
      candidates = []
      for (const objName of bonus.craftStationTypes) {
        const itemName = objName.replace(/Object$/, 'Item')
        const list = recipesByCraftStationItem.get(itemName)
        if (list) candidates.push(...list)
      }
    }
    if (candidates === null && bonus.skillTypes.length > 0) {
      candidates = []
      for (const sk of bonus.skillTypes) {
        const list = recipesBySkill.get(sk)
        if (list) candidates.push(...list)
      }
    }
    if (candidates === null) candidates = recipes.slice()

    // Apply remaining filters as AND intersections.
    if (bonus.skillTypes.length > 0) {
      const skSet = new Set(bonus.skillTypes)
      candidates = candidates.filter((r) => skSet.has(r.RequiredSkill))
    }
    if (bonus.craftStationTypes.length > 0) {
      const tbl = new Set(bonus.craftStationTypes.map((o) => o.replace(/Object$/, 'Item')))
      candidates = candidates.filter((r) => tbl.has(r.CraftingTable))
    }
    if (bonus.recipes.length > 0) {
      const set = new Set(bonus.recipes)
      candidates = candidates.filter((r) => set.has(r.Name))
    }
    return candidates
  }

  // For each concrete talent with bonuses, emit synthetic modifier entries on
  // the matching recipes. `refName` uses `TalentName:bonusIndex` so
  // multi-bonus talents don't collide. `Value=0` on the TalentJson signals
  // the bonus-system code path in the importer.
  const attachBonusToTalent = (talentName: string, bonuses: RawBonus[]): TalentBonusJson[] => {
    const out: TalentBonusJson[] = []
    for (let idx = 0; idx < bonuses.length; idx++) {
      const b = bonuses[idx]
      out.push(toBonusJson(b))

      // Only price-relevant actions emit synthetic modifiers.
      if (b.action !== 'ResourceCost' && b.action !== 'CraftTime' && b.action !== 'LaborCost') {
        continue
      }
      const refName = `${talentName}:${idx}`
      const mod: ModifierJson = { DynamicType: 'Talent', Item: refName }
      const matching = resolveScopeRecipes(b)
      if (b.action === 'LaborCost') {
        for (const r of matching) r.Labor.Modifiers.push(mod)
      } else if (b.action === 'CraftTime') {
        for (const r of matching) r.CraftMinutes.Modifiers.push(mod)
      } else {
        // ResourceCost: only ingredients, never products (per Eco semantics).
        const tagFilter = b.itemTags.length > 0 ? new Set(b.itemTags) : null
        for (const r of matching) {
          for (const ing of r.Ingredients) {
            if (tagFilter && !ingredientMatchesTags(ing.ItemOrTag, tagFilter)) continue
            ing.Quantity.Modifiers.push(mod)
          }
        }
      }
    }
    return out
  }

  // Talents that actually reach a skill. `talentByName` also holds abstract
  // bases like ToolEfficiencyTalent, which belong to no talent group and are
  // never granted — gathering tools must not reference those.
  const emittedTalentNames = new Set<string>()
  for (const tg of talentGroups) {
    if (!tg.owningSkill) continue
    const skill = skillByName.get(tg.owningSkill)
    if (!skill) continue
    for (const tn of tg.talents) {
      emittedTalentNames.add(tn)
      const t = talentByName.get(tn)
      const bonuses = resolveBonuses(tn)
      const tj: TalentJson = {
        Name: tn,
        LocalizedName: mergeLocalized(tg.display, translations),
        TalentGroupName: tg.name,
        ...(tg.description
          ? { LocalizedDescription: mergeLocalized(tg.description, translations) }
          : {}),
        Value: bonuses.length > 0 ? 0 : (t?.value ?? 0),
        Level: tg.level,
      }
      if (bonuses.length > 0) {
        tj.Bonuses = attachBonusToTalent(tn, bonuses)
      }
      skill.Talents.push(tj)
    }
  }

  // 3d) Items — emit canonical *Item / *Book / *Scroll names plus anything
  // referenced by a recipe (as ingredient, product, or crafting table) or as a
  // crafting-table plugin module. Plain *Object / *Block world-only entries
  // are dropped.
  const referenced = new Set<string>()
  for (const r of recipes) {
    if (r.CraftingTable) referenced.add(r.CraftingTable)
    for (const e of [...r.Ingredients, ...r.Products]) referenced.add(e.ItemOrTag)
    // Garbage outputs must count as references or the keep-filter below drops
    // them: several scrap items appear ONLY as garbage, never as an ingredient
    // or product, and some (TrashItem, CompostablesItem) are exactly the
    // hidden-category items the display-name guard exists to exclude. Dropping
    // them would leave the garbage tables pointing at items not in the dataset.
    for (const g of r.GarbageOutputs ?? []) referenced.add(g.ItemOrTag)
  }
  for (const it of items.values()) {
    for (const m of it.CraftingTablePluginModules ?? []) referenced.add(m)
    for (const s of it.salvageCost ?? []) {
      const resolved = garbageMaterialToItem.get(s.material)
      if (resolved) referenced.add(resolved)
    }
  }
  const itemJsons: ItemJson[] = []
  for (const it of [...items.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    // An item must be either referenced/special-purpose, or have a proper
    // display name. Without the display-name guard, the broader handwritten-dir
    // walk would surface hidden-category internal items (TrashItem,
    // CompostablesItem, …) that have no LocDisplayName anywhere — they'd render
    // as raw class names in the UI.
    const isReferenced = it.isCraftingTable || it.isPluginModule || referenced.has(it.name)
    const isCanonicalSuffix =
      it.name.endsWith('Item') || it.name.endsWith('Book') || it.name.endsWith('Scroll')
    const hasDisplayName = it.display !== it.name
    const keep = isReferenced || (isCanonicalSuffix && hasDisplayName)
    if (!keep) continue
    const j: ItemJson = {
      Name: it.name,
      LocalizedName: mergeLocalized(it.display, translations),
    }
    if (it.isPart) j.IsPart = true
    if (it.requiredParts?.length) {
      j.RequiredParts = it.requiredParts.map((p) => ({ Name: p.typeName, Quantity: p.quantity }))
    }
    if (it.isPluginModule) {
      j.IsPluginModule = true
      if (it.moduleBonuses) {
        // v14 shape. Deliberately exclusive with the legacy fields below — the
        // import-time normalizer checks ModuleBonuses first and a module carrying
        // both shapes would be ambiguous.
        j.ModuleBonuses = it.moduleBonuses.map(toBonusJson)
        if (it.moduleSlot) j.ModuleSlot = it.moduleSlot as NonNullable<ItemJson['ModuleSlot']>
        if (it.isDeprecated) j.IsDeprecated = true
      } else {
        if (it.pluginType) j.PluginType = it.pluginType
        if (it.pluginModulePercent !== undefined) j.PluginModulePercent = it.pluginModulePercent
        if (it.pluginModuleSkill) j.PluginModuleSkill = it.pluginModuleSkill
        if (it.pluginModuleSkillPercent !== undefined)
          j.PluginModuleSkillPercent = it.pluginModuleSkillPercent
      }
    }
    if (it.salvageCost?.length) {
      j.SalvageCost = it.salvageCost.map((s) => {
        const resolved = garbageMaterialToItem.get(s.material)
        if (!resolved) {
          throw new Error(
            `[extract] item ${it.name}: SalvageCost references unknown GarbageMaterial '${s.material}' ` +
              `(GarbageMaterials.cs yielded ${garbageMaterialToItem.size} materials)`
          )
        }
        return { ItemOrTag: resolved, Quantity: s.quantity }
      })
    }
    if (it.isCraftingTable) {
      j.IsCraftingTable = true
      if (it.CraftingTablePluginModules)
        j.CraftingTablePluginModules = it.CraftingTablePluginModules
    }
    if (it.maturityAgeDays != null) {
      j.MaturityAgeDays = it.maturityAgeDays
      j.PostHarvestingGrowth = it.postHarvestingGrowth ?? 0
      j.PickableAtPercent = it.pickableAtPercent ?? 0
      if (it.primaryResourceMin != null) j.PrimaryResourceMin = it.primaryResourceMin
      if (it.primaryResourceMax != null) j.PrimaryResourceMax = it.primaryResourceMax
      if (it.seedItemName) j.SeedItem = it.seedItemName
      if (it.plantDisplay) j.PlantName = mergeLocalized(it.plantDisplay, translations)
      if (it.isTree) j.IsTree = true
    }
    if (it.minableHardness != null) {
      j.MinableHardness = it.minableHardness
      j.RubbleItemsPerBlock = it.rubbleItemsPerBlock ?? 0
      j.RubbleMaxItemsPerBlock = it.rubbleMaxItemsPerBlock ?? 0
      j.RubbleExtraHitsPerBlock = it.rubbleExtraHitsPerBlock ?? 0
    }
    if (it.requiresShovel) j.RequiresShovel = true
    if (it.animalHealth != null) {
      j.AnimalHealth = it.animalHealth
      if (it.animalDisplay) j.AnimalName = mergeLocalized(it.animalDisplay, translations)
    }
    if (it.clothingCalorieRate != null) j.ClothingCalorieRate = it.clothingCalorieRate
    itemJsons.push(j)
  }
  const keptItemNames = new Set(itemJsons.map((j) => j.Name))

  // 3e) Tags — merge TagDefinitions + any tag referenced via [Tag(...)] or recipe ingredients
  const allTagNames = new Set<string>()
  for (const td of tagDefs) allTagNames.add(td.name)
  for (const t of tagItems.keys()) allTagNames.add(t)
  for (const r of recipes) {
    for (const e of [...r.Ingredients, ...r.Products]) {
      if (!items.has(e.ItemOrTag)) allTagNames.add(e.ItemOrTag)
    }
  }
  const tagDefByName = new Map(tagDefs.map((t) => [t.name, t]))
  const tagJsons: TagJson[] = []
  for (const name of allTagNames) {
    const td = tagDefByName.get(name)
    tagJsons.push({
      Name: name,
      LocalizedName: mergeLocalized(td?.display ?? name, translations),
      AssociatedItems: [...(tagItems.get(name) ?? [])].sort(),
    })
  }

  // 3f) Recipes: localize the names. Parents set LocalizedName['en-US'] to the
  // same string as FamilyName (e.g. "Boards"); variants set it to their own
  // display name (e.g. "Hardwood Boards"). Using LocalizedName as the
  // translation lookup key works for both — FamilyName alone would mis-localize variants.
  const recipeJsons: RecipeJson[] = recipes.map((r) => ({
    ...r,
    LocalizedName: mergeLocalized(r.LocalizedName['en-US'] ?? r.FamilyName, translations),
  }))

  // 3g) Gathering sections. Both cross-reference `Items` by name, and the item
  // emit above drops unreferenced entries, so filter to what actually shipped —
  // validateDatasetJson rejects a dangling reference.
  const gatheringToolJsons: GatheringToolJson[] = rawTools
    .filter((t) => keptItemNames.has(t.name))
    .map((t) => {
      const j: GatheringToolJson = {
        Name: t.name,
        LocalizedName: mergeLocalized(items.get(t.name)?.display ?? t.name, translations),
        Kind: t.kind,
        Tier: t.tier,
        BaseCalories: t.baseCalories,
        CalorieSkill: t.calorieSkill,
        BaseDamage: t.baseDamage,
        DamageUsesToolCurve: t.damageUsesToolCurve,
      }
      // A talent name with no talent behind it (the abstract ToolEfficiencyTalent
      // that shovels, hammers and bows reference) is dropped here rather than
      // shipped as a reference that can never resolve.
      if (t.efficiencyTalent && emittedTalentNames.has(t.efficiencyTalent)) {
        j.EfficiencyTalent = t.efficiencyTalent
      }
      if (t.strengthTalent && emittedTalentNames.has(t.strengthTalent)) {
        j.StrengthTalent = t.strengthTalent
      }
      if (t.maxTake != null) j.MaxTake = t.maxTake
      return j
    })
    .sort((a, b) => a.Name.localeCompare(b.Name))

  const treeSpeciesJsons: TreeSpeciesJson[] = resolvedTreeSpecies
    .filter((s) => keptItemNames.has(s.logItem))
    .map((s) => ({
      Name: s.name,
      LocalizedName: mergeLocalized(s.displayName, translations),
      LogItem: s.logItem,
      TreeHealth: s.treeHealth,
      LogsPerTreeMin: s.min,
      LogsPerTreeMax: s.max,
    }))

  const dataset: DatasetJson = {
    Version: args.version,
    Skills: [...skillByName.values()].sort((a, b) => a.Name.localeCompare(b.Name)),
    Items: itemJsons,
    Tags: tagJsons.sort((a, b) => a.Name.localeCompare(b.Name)),
    Recipes: recipeJsons.sort((a, b) => a.Name.localeCompare(b.Name)),
    GatheringTools: gatheringToolJsons,
    TreeSpecies: treeSpeciesJsons,
  }

  const validation = validateDatasetJson(dataset)
  if (!validation.valid) {
    console.error('[extract] dataset failed validation:')
    for (const err of validation.errors) console.error('  -', err)
    process.exit(1)
  }
  console.log('[extract] dataset passed validateDatasetJson')

  await fs.mkdir(path.dirname(args.output), { recursive: true })
  await fs.writeFile(args.output, JSON.stringify(dataset))
  console.log(`[extract] wrote ${args.output}`)
  console.log(
    `[extract] counts: skills=${dataset.Skills.length} items=${dataset.Items.length} tags=${dataset.Tags.length} recipes=${dataset.Recipes.length}`
  )

  // Compare
  if (args.compare) {
    try {
      const existing = JSON.parse(await fs.readFile(args.compare, 'utf8')) as DatasetJson
      const rows = [
        ['Skills', existing.Skills.length, dataset.Skills.length],
        ['Items', existing.Items.length, dataset.Items.length],
        ['Tags', existing.Tags.length, dataset.Tags.length],
        ['Recipes', existing.Recipes.length, dataset.Recipes.length],
      ] as const
      console.log(`\n[compare] vs ${args.compare}`)
      console.log(
        `  ${'Entity'.padEnd(10)} ${'existing'.padStart(10)} ${'generated'.padStart(11)} ${'delta'.padStart(8)}`
      )
      for (const [name, a, b] of rows) {
        const d = b - a
        const sign = d > 0 ? '+' : ''
        console.log(
          `  ${name.padEnd(10)} ${String(a).padStart(10)} ${String(b).padStart(11)} ${(sign + d).padStart(8)}`
        )
      }
      const diffNames = (
        label: string,
        oldList: readonly { Name: string }[],
        newList: readonly { Name: string }[]
      ) => {
        const oldNames = new Set(oldList.map((e) => e.Name))
        const newNames = new Set(newList.map((e) => e.Name))
        const added = [...newNames].filter((n) => !oldNames.has(n)).sort()
        const removed = [...oldNames].filter((n) => !newNames.has(n)).sort()
        if (added.length === 0 && removed.length === 0) return
        console.log(`\n  ${label}:`)
        if (added.length) console.log(`    added (${added.length}):   ${added.join(', ')}`)
        if (removed.length) console.log(`    missing (${removed.length}): ${removed.join(', ')}`)
      }
      diffNames('Skills', existing.Skills, dataset.Skills)
      diffNames('Items', existing.Items, dataset.Items)
      diffNames('Tags', existing.Tags, dataset.Tags)
      diffNames('Recipes', existing.Recipes, dataset.Recipes)
    } catch (e) {
      console.warn('[compare] failed:', (e as Error).message)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
