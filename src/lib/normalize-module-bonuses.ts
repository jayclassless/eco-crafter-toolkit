import type { ItemJson } from '@/types/dataset-json'

/**
 * Which of a crafting table's core slots a module occupies.
 *
 * v14 exposes four; v11–v13 had a single implicit slot, and every legacy module
 * normalizes to `Specialty` (see below).
 */
export type ModuleSlot = 'Basic' | 'Advanced' | 'Modern' | 'Specialty'

const MODULE_SLOTS: readonly ModuleSlot[] = ['Basic', 'Advanced', 'Modern', 'Specialty']

/** Actions a module bonus can affect. Modules never touch anything else. */
export type ModuleAction = 'ResourceCost' | 'LaborCost' | 'CraftTime'

export type ModuleEffectType = 'AdditivePercent' | 'Multiplicative'

/**
 * One module effect in the unified shape the rest of the app sees. This is the
 * only module representation downstream of import — nothing below this layer
 * knows which dataset version it came from.
 */
export interface NormalizedBonus {
  action: ModuleAction
  effectType: ModuleEffectType
  value: number
  /** Raw (non-localized) skill *names*; empty means unscoped. Resolved to skill
   * ids later, when a dataset's skill rows exist. */
  skillTypes: string[]
}

export interface NormalizedModule {
  slot: ModuleSlot
  bonuses: NormalizedBonus[]
}

const MODULE_ACTIONS = new Set<string>(['ResourceCost', 'LaborCost', 'CraftTime'])

function isModuleSlot(v: string | undefined): v is ModuleSlot {
  return v != null && (MODULE_SLOTS as readonly string[]).includes(v)
}

/**
 * Resolve either dataset module shape into the single unified shape.
 *
 * This function is the **only** place where the v11–v13 and v14 module models
 * meet. Everything downstream — the stores, the solver, the display path, the
 * UI — sees exactly one model and contains no version checks. That is what makes
 * supporting both versions cheap.
 *
 * Pure: no store access, no id resolution, no side effects.
 */
export function normalizeModuleBonuses(item: ItemJson): NormalizedModule {
  // Check the v14 shape FIRST and treat it as authoritative.
  //
  // A dataset carrying both shapes should never exist — the extractor gates on
  // the presence of `override IEnumerable<Bonus> Bonuses` and emits one or the
  // other. But the ordering matters if one ever slips through: a v14 module
  // misread as legacy would take the branch below, find no `PluginType`, and
  // produce zero bonuses — i.e. a module that silently applies no discount at
  // all. Failing toward the richer shape is the safe direction.
  if (item.ModuleBonuses != null) {
    const bonuses: NormalizedBonus[] = []
    for (const b of item.ModuleBonuses) {
      // Modules only ever carry craft-affecting actions. Anything else is either
      // a game change we haven't modelled or a mis-parse; either way it must not
      // silently become a price effect.
      if (!MODULE_ACTIONS.has(b.Action)) continue
      if (b.EffectType !== 'AdditivePercent' && b.EffectType !== 'Multiplicative') continue
      if (!Number.isFinite(b.Value)) continue
      bonuses.push({
        action: b.Action as ModuleAction,
        effectType: b.EffectType,
        value: b.Value,
        skillTypes: b.Scope.SkillTypes ?? [],
      })
    }
    return {
      // Deprecated tier-ladder modules carry no slot tag. They are hidden from
      // pickers, but a build that already references one still needs a slot to
      // hang it on, and Specialty is the zero-star slot.
      slot: isModuleSlot(item.ModuleSlot) ? item.ModuleSlot : 'Specialty',
      bonuses,
    }
  }

  return {
    slot: 'Specialty',
    bonuses: legacyModuleBonuses(
      item.PluginType ?? '',
      item.PluginModulePercent,
      item.PluginModuleSkill,
      item.PluginModuleSkillPercent
    ),
  }
}

/**
 * The v11–v13 module mapping, shared by two callers that hold the skill scope in
 * different key spaces:
 *
 *  - `normalizeModuleBonuses` (dataset import) passes the skill **name**, which
 *    the importer then resolves to an id.
 *  - `migrateLegacyPluginModules` (store upgrade) passes the skill **id**, which
 *    a previous import already resolved.
 *
 * `scopeKey` is therefore whichever of the two the caller has, and it lands in
 * `skillTypes` verbatim. Both paths must produce identical effects or an
 * already-installed dataset would price differently from a freshly imported one,
 * which is exactly the kind of divergence that never shows up as an error.
 *
 * `PluginType` is a `&`-joined flag string; all 56 modules in every shipped
 * legacy dataset are `Resource&Speed`, but the flags are read individually
 * rather than string-compared so a `Resource`-only module would still work.
 *
 * Both percents are MULTIPLICATIVE — v13 had no additive effects — and there is
 * deliberately no LaborCost bonus, because legacy modules never reduced labor.
 * Adding one here would silently cut labor costs on every v11–v13 build.
 *
 * The scoped and unscoped percents are NOT cumulative: v13's
 * `getPluginModulePercent` returns the own-skill percent *instead of* the general
 * one when the skill matches. This function deliberately states both as plain
 * facts and leaves that precedence to the solver's `moduleFactor`, which
 * implements "a matching scoped effect supersedes the unscoped ones" for both
 * versions with one rule.
 */
export function legacyModuleBonuses(
  pluginType: string,
  percent: number | undefined,
  scopeKey: string | undefined,
  skillPercent: number | undefined
): NormalizedBonus[] {
  const bonuses: NormalizedBonus[] = []
  const actions: ModuleAction[] = []
  if (pluginType.includes('Resource')) actions.push('ResourceCost')
  if (pluginType.includes('Speed')) actions.push('CraftTime')

  for (const action of actions) {
    if (percent != null && Number.isFinite(percent)) {
      bonuses.push({ action, effectType: 'Multiplicative', value: percent, skillTypes: [] })
    }
    if (scopeKey && skillPercent != null && Number.isFinite(skillPercent)) {
      bonuses.push({
        action,
        effectType: 'Multiplicative',
        value: skillPercent,
        skillTypes: [scopeKey],
      })
    }
  }
  return bonuses
}
