// The option list behind every "pick a set of skills" control.
//
// Both Housing Score tools (the furnishings browser's skill filter and the
// optimizer's unlocked-skills input) narrow a set of items by which skills can
// craft them, so they need the same list: the skills that actually appear in
// that set, grouped by profession the way the Price Calculator's skill and
// crafting-table dropdowns already group theirs, plus a synthetic entry for the
// items no skill crafts at all.
import type { Store } from 'tinybase'

import type { Compare } from '@/lib/collator'

/**
 * Stands in for "items nothing crafts" — flowers, torch stands, stump
 * furniture, trophies. They need no skill to obtain, but leaving them
 * permanently in would make a skill selection quietly incomplete, so the user
 * gets an explicit entry to toggle.
 *
 * Skill row ids are UUIDv4, so the '!' prefix cannot collide with one.
 */
export const UNSKILLED_SKILL_ID = '!unskilled'

/**
 * Profession-group key for entries that belong to no profession — today only
 * the synthetic Unskilled entry, since a profession skill groups under itself.
 * Matches the sentinel `CraftingTablesPanel` and `CustomRecipeFormDialog`
 * already use, so all four dropdowns label the bucket identically.
 */
export const OTHER_PROFESSION = '_Other'

/** Resolves an entity id to its localized name (the `useLocalizedName` hook's
 * `getName`). Passed in rather than hooked, so these stay pure. */
type GetName = (entityType: string, entityId: string) => string

/** Anything an option can be counted from: an item carrying the skills that
 * unlock it. */
interface SkillBearing {
  skillIds: readonly string[]
}

export interface SkillSelectOption {
  id: string
  /** Localized skill name, or the Unskilled label. */
  name: string
  /** Raw game name — the `SkillIcon` sprite key. '' for Unskilled, which has
   * no sprite of its own. */
  rawName: string
  /** Raw name of the owning profession, or `OTHER_PROFESSION`. This is the
   * group key. */
  professionRawName: string
  /** Localized profession label, i.e. the group header text. */
  professionName: string
  /** How many of the entries this option unlocks, so the user can see what a
   * selection is worth before making it. */
  count: number
}

export interface SkillSelectGroup {
  /** Localized profession label. Named `profession` to match
   * `GroupedAutoCompleteGroup`, which PrimeReact addresses by field name. */
  profession: string
  professionRawName: string
  items: SkillSelectOption[]
}

/** The two labels the caller must supply from its i18n catalog, since `lib/`
 * has no translator of its own. */
export interface SkillSelectLabels {
  unskilled: string
  otherProfession: string
}

/**
 * The skills that craft at least one of `entries`, plus the Unskilled entry
 * when anything is craftable by nothing. Flat, sorted by name, with Unskilled
 * last to match the display order — grouping is `groupSkillOptions`' job, so a
 * caller that only needs ids (persistence, "select all") never pays for it.
 */
export function collectSkillOptions(
  entries: readonly SkillBearing[],
  store: Store,
  datasetId: string,
  getName: GetName,
  compare: Compare,
  labels: SkillSelectLabels
): SkillSelectOption[] {
  const counts = new Map<string, number>()
  let unskilled = 0
  for (const entry of entries) {
    if (entry.skillIds.length === 0) {
      unskilled++
      continue
    }
    for (const id of entry.skillIds) counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  // A skill's `profession` cell holds the profession's raw NAME, not its row
  // id, so resolving the localized label needs the reverse map. Built once per
  // call over ~44 rows rather than per option.
  const skillIdByRawName = new Map<string, string>()
  for (const rowId of store.getRowIds('skills')) {
    const skill = store.getRow('skills', rowId)
    if (skill.datasetId !== datasetId) continue
    skillIdByRawName.set(skill.name as string, rowId)
  }
  const professionNames = new Map<string, string>()
  const professionName = (rawName: string) => {
    let name = professionNames.get(rawName)
    if (name === undefined) {
      const rowId = skillIdByRawName.get(rawName)
      name = rowId ? getName('skill', rowId) || rawName : rawName
      professionNames.set(rawName, name)
    }
    return name
  }

  const options: SkillSelectOption[] = [...counts].map(([id, count]) => {
    const rawName = (store.getCell('skills', id, 'name') as string) ?? ''
    // A profession skill has no profession of its own, so it heads its own
    // group — the same convention `CraftingTablesPanel` uses.
    const professionRawName = (store.getCell('skills', id, 'profession') as string) || rawName
    return {
      id,
      // The localized index may not be warm on first paint, hence the fallback.
      name: getName('skill', id) || rawName,
      rawName,
      professionRawName,
      professionName: professionName(professionRawName),
      count,
    }
  })
  options.sort((a, b) => compare(a.name, b.name))

  if (unskilled > 0) {
    options.push({
      id: UNSKILLED_SKILL_ID,
      name: labels.unskilled,
      rawName: '',
      professionRawName: OTHER_PROFESSION,
      professionName: labels.otherProfession,
      count: unskilled,
    })
  }
  return options
}

/**
 * Bucket options by profession for display. Groups collate by label, matching
 * the Price Calculator's dropdowns — except that the `OTHER_PROFESSION` bucket
 * is pinned last rather than sorted into the Os: it holds the synthetic
 * Unskilled entry, which is a mode of the control rather than a profession, so
 * it sits below the real professions instead of interrupting them.
 */
export function groupSkillOptions(
  options: readonly SkillSelectOption[],
  compare: Compare
): SkillSelectGroup[] {
  const groups = new Map<string, SkillSelectGroup>()
  for (const option of options) {
    let group = groups.get(option.professionRawName)
    if (!group) {
      group = {
        profession: option.professionName,
        professionRawName: option.professionRawName,
        items: [],
      }
      groups.set(option.professionRawName, group)
    }
    group.items.push(option)
  }
  for (const group of groups.values()) group.items.sort((a, b) => compare(a.name, b.name))
  return [...groups.values()].sort((a, b) => {
    if (a.professionRawName === OTHER_PROFESSION) return 1
    if (b.professionRawName === OTHER_PROFESSION) return -1
    return compare(a.profession, b.profession)
  })
}
