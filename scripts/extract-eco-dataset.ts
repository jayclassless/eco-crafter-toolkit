#!/usr/bin/env tsx
/**
 * Extract an Eco game dataset (DatasetJson) from a local Eco server install.
 *
 * Usage:
 *   pnpm tsx scripts/extract-eco-dataset.ts \
 *     --eco-root /path/to/EcoServer \
 *     --output   /path/to/eco-vN.json \
 *     [--version  1] \
 *     [--crowdin-token TOKEN] [--crowdin-project 300454] \
 *     [--compare public/data/eco-v12.json]
 *
 * Environment variables (used when the corresponding flag is omitted):
 *   ECO_ROOT        -> --eco-root
 *   CROWDIN_TOKEN   -> --crowdin-token
 *
 * The script regex-parses the auto-generated C# under
 *   <eco-root>/Eco_Data/Server/Mods/__core__/AutoGen
 * and emits a DatasetJson matching src/types/dataset-json.ts.
 *
 * Localization: if a Crowdin API token is provided, translations for the
 * Eco project (default id 300454) are downloaded and merged into every
 * entity's LocalizedName. Without a token, only en-US is populated.
 */

import { promises as fs } from 'node:fs'
import * as path from 'node:path'

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { validateDatasetJson } from '../src/lib/import-dataset'
import type {
  DatasetJson,
  ElementJson,
  ItemJson,
  LocalizedNames,
  ModifierJson,
  RecipeJson,
  SkillJson,
  TagJson,
  TalentBonusJson,
  TalentBonusScopeJson,
  TalentJson,
  DynamicValueJson,
} from '../src/types/dataset-json'

// ---------------------------------------------------------------------------
// CLI

interface Args {
  ecoRoot: string
  output: string
  version: number
  crowdinToken?: string
  crowdinProject: number
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
    .option('crowdin-token', {
      type: 'string',
      describe: 'Crowdin API token (env: CROWDIN_TOKEN)',
      default: process.env.CROWDIN_TOKEN,
      defaultDescription: '$CROWDIN_TOKEN',
    })
    .option('crowdin-project', {
      type: 'number',
      describe: 'Crowdin project id',
      default: 300454,
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
    crowdinToken: parsed.crowdinToken,
    crowdinProject: parsed.crowdinProject,
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
  pluginType?: string
  pluginModulePercent?: number
  pluginModuleSkill?: string
  pluginModuleSkillPercent?: number
  isCraftingTable?: boolean
  // raw upgrade module specs from [AllowPluginModules(...)]
  craftingTableModuleTags?: string[]
  craftingTableModuleItems?: string[]
  CraftingTablePluginModules?: string[]
}
interface RawTagDef {
  name: string
  display?: string
}
interface RawTalentGroup {
  name: string
  display: string
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
    /\[LocDisplayName\("([^"]+)"\)\][\s\S]*?public\s+partial\s+class\s+(\w+TalentGroup)\s*:\s*TalentGroup[\s\S]*?\{([\s\S]*?)\n\s{4}\}/g
  let g: RegExpExecArray | null
  while ((g = groupRe.exec(src))) {
    const display = g[1]
    const name = g[2]
    const body = g[3]
    const owning = /OwningSkill\s*=\s*typeof\((\w+)\)/.exec(body)?.[1]
    const level = Number(/this\.Level\s*=\s*(\d+)/.exec(body)?.[1] ?? 0)
    const tts: string[] = []
    const tre = /typeof\((\w+Talent)\)/g
    let mt: RegExpExecArray | null
    while ((mt = tre.exec(body))) tts.push(mt[1])
    talentGroups.push({ name, display, owningSkill: owning, level, talents: tts })
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

    // Each Bonus object is `this.Bonuses.Add(new Bonus { ... });` — find the
    // opening `{` of the object initializer and walk braces to its end.
    const addRe = /this\.Bonuses\.Add\s*\(\s*new\s+Bonus\s*/g
    let am: RegExpExecArray | null
    while ((am = addRe.exec(classBody))) {
      const objOpenIdx = classBody.indexOf('{', am.index + am[0].length)
      if (objOpenIdx < 0) continue
      const objEndIdx = matchBrace(classBody, objOpenIdx)
      if (objEndIdx < 0) continue
      const obj = classBody.slice(objOpenIdx + 1, objEndIdx - 1)

      // Action — only CraftBonusCause has an Action on a scope relevant to us,
      // but HarvestBonusCause / ActionCause also declare BonusAction.X; we
      // capture whichever first appears.
      const action = /BonusAction\.(\w+)/.exec(obj)?.[1]
      if (!action) continue

      // Scope — from the first CraftBonusCause block (we don't support multi-
      // cause bonuses; they don't exist in v13 core data).
      const scopeBlock = extractInitializerBlock(obj, 'CraftBonusCause') ?? obj
      const recipes = extractSetTypeNames(scopeBlock, 'Recipes')
      const skillTypes = extractSetTypeNames(scopeBlock, 'SkillTypes')
      const craftStationTypes = extractSetTypeNames(scopeBlock, 'CraftStationTypes')
      const itemTags = extractSetStrings(scopeBlock, 'ItemTags')

      // Effect — first `new BonusEffect<Kind> { ... }` after `Effects =`.
      const effectsIdx = obj.search(/Effects\s*=/)
      const afterEffects = effectsIdx >= 0 ? obj.slice(effectsIdx) : obj
      const effMatch = /new\s+(BonusEffect\w+)\s*\{([^}]*)\}/.exec(afterEffects)
      if (!effMatch) continue
      const effectType = effMatch[1].replace(/^BonusEffect/, '')
      const params = effMatch[2]

      const val = parseFloatLit(/Value\s*=\s*([0-9.\-+f]+)/.exec(params)?.[1] ?? 'NaN')
      if (Number.isNaN(val)) {
        // BonusEffectChance uses Chance / SuccessValue — outside price calc.
        continue
      }
      const capStr = /Cap\s*=\s*([0-9.\-+f]+)/.exec(params)?.[1]
      const cap = capStr !== undefined ? parseFloatLit(capStr) : undefined
      const lowerStr = /LowerIsBetter\s*=\s*(true|false)/.exec(params)?.[1]
      const lowerIsBetter = lowerStr === undefined ? undefined : lowerStr === 'true'

      const bonus: RawBonus = {
        action,
        effectType,
        value: val,
        cap,
        lowerIsBetter,
        recipes,
        skillTypes,
        craftStationTypes,
        itemTags,
      }

      let list = bonusesByTalentName.get(talentName)
      if (!list) {
        list = []
        bonusesByTalentName.set(talentName, list)
      }
      list.push(bonus)
    }
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
      // Look forward for the constructor : base(...)
      const after = src.slice(m.index, m.index + 4000)
      const ctor = /base\(([\s\S]*?)\)\s*\{/.exec(after)
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

    recipes.push({
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
    })
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

    variants.push({
      className,
      displayName,
      ingredients,
      products,
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
    recipes.push({
      Name: v.className,
      LocalizedName: enLocalized(v.displayName),
      FamilyName: parent.FamilyName,
      CraftMinutes: cloneDynamic(parent.CraftMinutes),
      RequiredSkill: parent.RequiredSkill,
      RequiredSkillLevel: parent.RequiredSkillLevel,
      IsBlueprint: parent.IsBlueprint,
      IsDefault: parent.IsDefault,
      Labor: cloneDynamic(parent.Labor),
      CraftingTable: craftingTable,
      Ingredients: v.ingredients,
      Products: v.products,
    })
  }
}

// ---------------------------------------------------------------------------
// Crowdin localization

// Eco's Crowdin project ships its game strings as multi-column CSVs
// (one column per language). We download the relevant files once and parse the
// columns directly — no per-language export needed.
const CROWDIN_HEADER_TO_LOCALE: Record<string, string> = {
  English: 'en-US',
  French: 'fr',
  Spanish: 'es',
  German: 'de',
  Korean: 'ko',
  BrazilianPortuguese: 'pt-BR',
  SimplifedChinese: 'zh-Hans', // sic — Crowdin column header is misspelled
  SimplifiedChinese: 'zh-Hans',
  Russian: 'ru',
  Italian: 'it',
  Portuguese: 'pt-PT',
  Hungarian: 'hu',
  Japanese: 'ja',
  Norwegian: 'nn',
  Polish: 'pl',
  Dutch: 'nl',
  Romanian: 'ro',
  Danish: 'da',
  Czech: 'cs',
  Swedish: 'sv',
  Ukrainian: 'uk',
  Greek: 'el',
  Arabic: 'ar-sa',
  Vietnamese: 'vi',
  Turkish: 'tr',
}

// Source file basenames in the Crowdin project that contain in-game strings.
const CROWDIN_GAME_FILES = new Set(['defaultstrings.csv', 'EcopediaStrings.csv'])

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

async function fetchCrowdin(
  token: string,
  projectId: number
): Promise<Map<string, LocalizedNames>> {
  const map = new Map<string, LocalizedNames>()
  let CrowdinMod: any
  try {
    CrowdinMod = await import('@crowdin/crowdin-api-client')
  } catch (e) {
    console.warn('[crowdin] @crowdin/crowdin-api-client not installed:', (e as Error).message)
    return map
  }
  try {
    const { default: Crowdin } = CrowdinMod
    const client = new Crowdin({ token })
    const files = await client.sourceFilesApi.listProjectFiles(projectId, { limit: 500 })
    const matched = files.data
      .map((f: any) => f.data)
      .filter((f: any) => CROWDIN_GAME_FILES.has(f.name))
    if (!matched.length) {
      console.warn('[crowdin] no game string files found in project')
      return map
    }
    for (const f of matched) {
      try {
        // Eco's CSVs are multi-language; the targetLanguageId is just required
        // by the API but the returned file contains every column anyway.
        const built = await client.translationsApi.buildProjectFileTranslation(projectId, f.id, {
          targetLanguageId: 'fr',
        })
        const url = built.data?.url
        if (!url) continue
        const res = await fetch(url)
        if (!res.ok) continue
        const csv = await res.text()
        const rows = parseCsv(csv)
        if (!rows.length) continue
        const header = rows[0]
        const colLocale: (string | undefined)[] = header.map(
          (h) => CROWDIN_HEADER_TO_LOCALE[h.trim()]
        )
        const enCol = header.findIndex((h) => h.trim() === 'English')
        if (enCol < 0) {
          console.warn(`[crowdin] ${f.name}: no English column`)
          continue
        }
        let added = 0
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r]
          const en = row[enCol]
          if (!en) continue
          let entry = map.get(en)
          if (!entry) {
            entry = { 'en-US': en }
            map.set(en, entry)
            added++
          }
          for (let c = 0; c < row.length; c++) {
            const loc = colLocale[c]
            if (!loc || loc === 'en-US') continue
            const val = row[c]
            if (val) entry[loc] = val
          }
        }
        console.log(`[crowdin] ${f.name}: parsed ${rows.length - 1} rows (+${added} new)`)
      } catch (e) {
        console.warn(`[crowdin] ${f.name}: ${(e as Error).message}`)
      }
    }
  } catch (e) {
    console.warn('[crowdin] fetch failed:', (e as Error).message)
  }
  return map
}

function mergeLocalized(en: string, crowdin: Map<string, LocalizedNames>): LocalizedNames {
  const base: LocalizedNames = { 'en-US': en }
  const found = crowdin.get(en)
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

  // Pass 1b: v13 bonus system lives outside AutoGen in __core__/Benefits.
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

  // Tag definitions
  try {
    const tagSrc = await fs.readFile(path.join(coreRoot, 'Systems', 'TagDefinitions.cs'), 'utf8')
    parseTagDefinitionsFile(tagSrc)
  } catch (e) {
    console.warn('[extract] TagDefinitions.cs missing:', (e as Error).message)
  }

  // Pass 1c: recipe-derived display fallback for items whose class lives only
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

  // Pass 2: Crowdin
  const crowdin = args.crowdinToken
    ? await fetchCrowdin(args.crowdinToken, args.crowdinProject)
    : new Map<string, LocalizedNames>()
  if (!args.crowdinToken) {
    console.warn('[extract] no --crowdin-token provided; emitting en-US only')
  } else {
    console.log(`[extract] crowdin source strings cached: ${crowdin.size}`)
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
      LocalizedName: mergeLocalized(s.display, crowdin),
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
      out.push(json)

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

  for (const tg of talentGroups) {
    if (!tg.owningSkill) continue
    const skill = skillByName.get(tg.owningSkill)
    if (!skill) continue
    for (const tn of tg.talents) {
      const t = talentByName.get(tn)
      const bonuses = resolveBonuses(tn)
      const tj: TalentJson = {
        Name: tn,
        LocalizedName: mergeLocalized(tg.display, crowdin),
        TalentGroupName: tg.name,
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
  }
  for (const it of items.values()) {
    for (const m of it.CraftingTablePluginModules ?? []) referenced.add(m)
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
      LocalizedName: mergeLocalized(it.display, crowdin),
    }
    if (it.isPart) j.IsPart = true
    if (it.requiredParts?.length) {
      j.RequiredParts = it.requiredParts.map((p) => ({ Name: p.typeName, Quantity: p.quantity }))
    }
    if (it.isPluginModule) {
      j.IsPluginModule = true
      if (it.pluginType) j.PluginType = it.pluginType
      if (it.pluginModulePercent !== undefined) j.PluginModulePercent = it.pluginModulePercent
      if (it.pluginModuleSkill) j.PluginModuleSkill = it.pluginModuleSkill
      if (it.pluginModuleSkillPercent !== undefined)
        j.PluginModuleSkillPercent = it.pluginModuleSkillPercent
    }
    if (it.isCraftingTable) {
      j.IsCraftingTable = true
      if (it.CraftingTablePluginModules)
        j.CraftingTablePluginModules = it.CraftingTablePluginModules
    }
    itemJsons.push(j)
  }

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
      LocalizedName: mergeLocalized(td?.display ?? name, crowdin),
      AssociatedItems: [...(tagItems.get(name) ?? [])].sort(),
    })
  }

  // 3f) Recipes: localize the names. Parents set LocalizedName['en-US'] to the
  // same string as FamilyName (e.g. "Boards"); variants set it to their own
  // display name (e.g. "Hardwood Boards"). Using LocalizedName as the Crowdin
  // lookup key works for both — FamilyName alone would mis-localize variants.
  const recipeJsons: RecipeJson[] = recipes.map((r) => ({
    ...r,
    LocalizedName: mergeLocalized(r.LocalizedName['en-US'] ?? r.FamilyName, crowdin),
  }))

  const dataset: DatasetJson = {
    Version: args.version,
    Skills: [...skillByName.values()].sort((a, b) => a.Name.localeCompare(b.Name)),
    Items: itemJsons,
    Tags: tagJsons.sort((a, b) => a.Name.localeCompare(b.Name)),
    Recipes: recipeJsons.sort((a, b) => a.Name.localeCompare(b.Name)),
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
