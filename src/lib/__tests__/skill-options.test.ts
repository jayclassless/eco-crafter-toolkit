import { beforeEach, describe, expect, it } from 'vitest'

import { getCompare } from '@/lib/collator'
import {
  collectSkillOptions,
  groupSkillOptions,
  OTHER_PROFESSION,
  type SkillSelectOption,
  UNSKILLED_SKILL_ID,
} from '@/lib/skill-options'
import { createGameDataStore } from '@/stores/game-data-store'

const compare = getCompare('en-US')
const getName = (entityType: string, entityId: string) => `${entityType}:${entityId}`
const labels = { unskilled: 'Unskilled', otherProfession: 'Other' }

let store: ReturnType<typeof createGameDataStore>

beforeEach(() => {
  store = createGameDataStore()
})

function seed() {
  // Two specialties under one profession, one under another, plus a profession
  // skill that crafts something itself (so it has no `profession` of its own).
  store.setRow('skills', 'carpenter', {
    id: 'carpenter',
    datasetId: 'ds1',
    name: 'CarpenterSkill',
  })
  store.setRow('skills', 'mason', { id: 'mason', datasetId: 'ds1', name: 'MasonSkill' })
  store.setRow('skills', 'carpentry', {
    id: 'carpentry',
    datasetId: 'ds1',
    name: 'CarpentrySkill',
    profession: 'CarpenterSkill',
  })
  store.setRow('skills', 'furniture', {
    id: 'furniture',
    datasetId: 'ds1',
    name: 'AdvancedCarpentrySkill',
    profession: 'CarpenterSkill',
  })
  store.setRow('skills', 'masonry', {
    id: 'masonry',
    datasetId: 'ds1',
    name: 'MasonrySkill',
    profession: 'MasonSkill',
  })
  // Same raw name in another dataset — the profession label must not resolve
  // through it.
  store.setRow('skills', 'other-ds', {
    id: 'other-ds',
    datasetId: 'ds2',
    name: 'CarpenterSkill',
  })
}

const entries = [
  { skillIds: ['carpentry'] },
  { skillIds: ['carpentry', 'masonry'] },
  { skillIds: ['furniture'] },
  { skillIds: ['carpenter'] },
  { skillIds: [] },
  { skillIds: [] },
]

describe('collectSkillOptions', () => {
  it('counts the entries each skill unlocks and trails with the Unskilled bucket', () => {
    seed()
    const options = collectSkillOptions(entries, store, 'ds1', getName, compare, labels)
    expect(options[options.length - 1]).toEqual({
      id: UNSKILLED_SKILL_ID,
      name: 'Unskilled',
      rawName: '',
      professionRawName: OTHER_PROFESSION,
      professionName: 'Other',
      count: 2,
    })
    expect(options.find((o) => o.id === 'carpentry')).toEqual({
      id: 'carpentry',
      name: 'skill:carpentry',
      rawName: 'CarpentrySkill',
      professionRawName: 'CarpenterSkill',
      professionName: 'skill:carpenter',
      count: 2,
    })
    expect(options.find((o) => o.id === 'masonry')?.count).toBe(1)
  })

  it('files a profession skill under itself', () => {
    seed()
    const options = collectSkillOptions(entries, store, 'ds1', getName, compare, labels)
    expect(options.find((o) => o.id === 'carpenter')).toMatchObject({
      professionRawName: 'CarpenterSkill',
      professionName: 'skill:carpenter',
    })
  })

  it('resolves the profession label within the requested dataset only', () => {
    seed()
    const options = collectSkillOptions(entries, store, 'ds2', getName, compare, labels)
    // ds2's CarpenterSkill row is the only one in scope, so the label resolves
    // through it rather than through ds1's identically named row.
    expect(options.find((o) => o.id === 'carpentry')?.professionName).toBe('skill:other-ds')
  })

  it('omits the Unskilled entry when everything is craftable', () => {
    seed()
    const options = collectSkillOptions(
      [{ skillIds: ['carpentry'] }],
      store,
      'ds1',
      getName,
      compare,
      labels
    )
    expect(options.map((o) => o.id)).toEqual(['carpentry'])
  })

  it('falls back to raw names while the localized index is still cold', () => {
    seed()
    const options = collectSkillOptions(entries, store, 'ds1', () => '', compare, labels)
    expect(options.find((o) => o.id === 'carpentry')).toMatchObject({
      name: 'CarpentrySkill',
      professionName: 'CarpenterSkill',
    })
  })
})

describe('groupSkillOptions', () => {
  function option(over: Partial<SkillSelectOption>): SkillSelectOption {
    return {
      id: 'id',
      name: 'Name',
      rawName: 'NameSkill',
      professionRawName: 'ProfSkill',
      professionName: 'Prof',
      count: 1,
      ...over,
    }
  }

  it('buckets by profession, collating the groups and their items', () => {
    const groups = groupSkillOptions(
      [
        option({ id: 'b', name: 'Zinc', professionRawName: 'S', professionName: 'Smith' }),
        option({ id: 'a', name: 'Alloy', professionRawName: 'S', professionName: 'Smith' }),
        option({ id: 'c', name: 'Baking', professionRawName: 'C', professionName: 'Chef' }),
      ],
      compare
    )
    expect(groups.map((g) => g.profession)).toEqual(['Chef', 'Smith'])
    expect(groups[1].items.map((i) => i.name)).toEqual(['Alloy', 'Zinc'])
  })

  it('pins the Other bucket last rather than collating it into place', () => {
    // It holds the synthetic Unskilled entry — a mode of the control, not a
    // profession — so it sits below the real professions rather than sorting
    // into the Os and interrupting them.
    const groups = groupSkillOptions(
      [
        option({ id: 'a', professionRawName: 'A', professionName: 'Alpha' }),
        option({
          id: UNSKILLED_SKILL_ID,
          professionRawName: OTHER_PROFESSION,
          professionName: 'Other',
        }),
        option({ id: 'z', professionRawName: 'Z', professionName: 'Zeta' }),
      ],
      compare
    )
    expect(groups.map((g) => g.profession)).toEqual(['Alpha', 'Zeta', 'Other'])
  })

  it('is empty for an empty option list', () => {
    expect(groupSkillOptions([], compare)).toEqual([])
  })
})

describe('collectSkillOptions alwaysInclude', () => {
  it('lists a skill that unlocks nothing at count 0', () => {
    // The optimizer needs every crafting skill selectable: Mining crafts no
    // furnishing but gates the stone ones through their ingredients, so
    // omitting it would make the constraint silently unable to model it.
    seed()
    // `mason` is the one seeded skill no entry is attributed to.
    const options = collectSkillOptions(entries, store, 'ds1', getName, compare, labels, [
      'masonry',
      'mason',
    ])
    const byId = new Map(options.map((o) => [o.id, o]))
    expect(byId.get('mason')?.count).toBe(0)
    expect(byId.get('mason')?.rawName).toBe('MasonSkill')
    // An id that already had a count keeps it rather than being reset to 0.
    expect(byId.get('masonry')?.count).toBe(1)
  })

  it('changes nothing when omitted', () => {
    seed()
    const withArg = collectSkillOptions(entries, store, 'ds1', getName, compare, labels, [])
    const without = collectSkillOptions(entries, store, 'ds1', getName, compare, labels)
    expect(withArg).toEqual(without)
  })
})
