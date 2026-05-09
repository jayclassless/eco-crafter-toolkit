import { describe, expect, it } from 'vitest'

import type { Product, ProductGroup, ProductParent } from '@/hooks/use-products'

import { buildProductRows } from '../build-product-rows'

const product = (overrides: Partial<Product> = {}): Product => ({
  userRecipeId: '',
  recipeId: '',
  recipeName: '',
  recipeIsCustom: false,
  skillId: '',
  skillName: '',
  skillRawName: '',
  craftingTableId: '',
  requiredSkillLevel: 0,
  primaryProductRawName: '',
  recipePrimaryProductRawName: '',
  productItemIds: [],
  primaryProductId: '',
  primaryProductName: '',
  primaryProductIsCustom: false,
  userPriceId: '',
  userMarginId: '',
  unlockingTalentIds: [],
  ...overrides,
})

// Build a flat (single-recipe) group whose primary product is `name`.
const flatGroup = (name: string, familyName: string, urId = `ur-${name}`): ProductGroup => ({
  parent: null,
  children: [
    product({
      userRecipeId: urId,
      recipeId: `recipe-${name}`,
      recipeName: `${name} Recipe`,
      primaryProductId: `item-${name}`,
      primaryProductName: name,
    }),
  ],
  familyName,
})

// Build a multi-recipe group: one product, multiple recipes.
const multiGroup = (name: string, familyName: string, recipeNames: string[]): ProductGroup => {
  const parent: ProductParent = {
    primaryProductId: `item-${name}`,
    primaryProductName: name,
    primaryProductRawName: name,
    primaryProductIsCustom: false,
    userPriceId: '',
    productUserMarginId: '',
  }
  return {
    parent,
    children: recipeNames.map((rn) =>
      product({
        userRecipeId: `ur-${rn}`,
        recipeId: `recipe-${rn}`,
        recipeName: rn,
        primaryProductId: parent.primaryProductId,
        primaryProductName: parent.primaryProductName,
      })
    ),
    familyName,
  }
}

const yes = () => true

describe('buildProductRows', () => {
  it('emits a flat row with no family header for a single non-clustered group', () => {
    const rows = buildProductRows([flatGroup('Iron Ore', 'Iron')], '', yes)
    expect(rows).toEqual([expect.objectContaining({ kind: 'flat', inFamily: false })])
    expect(rows.some((r) => r.kind === 'family')).toBe(false)
  })

  it('emits one family header for a 2+ member cluster, flagging children as inFamily', () => {
    const rows = buildProductRows(
      [
        flatGroup('Board', 'Board'),
        flatGroup('Hardwood Board', 'Board'),
        flatGroup('Softwood Board', 'Board'),
      ],
      '',
      yes
    )
    expect(rows.map((r) => r.kind)).toEqual(['family', 'flat', 'flat', 'flat'])
    expect(rows[0]).toMatchObject({
      kind: 'family',
      familyName: 'Board',
      childUserRecipeIds: ['ur-Board', 'ur-Hardwood Board', 'ur-Softwood Board'],
    })
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]).toMatchObject({ kind: 'flat', inFamily: true })
    }
  })

  it('does not emit a family header for a singleton family', () => {
    const rows = buildProductRows([flatGroup('Hardwood Board', 'Board')], '', yes)
    expect(rows.map((r) => r.kind)).toEqual(['flat'])
    expect(rows[0]).toMatchObject({ kind: 'flat', inFamily: false })
  })

  it('emits separate clusters for distinct families and resets inFamily between them', () => {
    const rows = buildProductRows(
      [
        flatGroup('Board', 'Board'),
        flatGroup('Hardwood Board', 'Board'),
        flatGroup('Iron Ore', 'Iron'),
        flatGroup('Hewn Chair', 'Hewn Chair'),
        flatGroup('Hewn Hardwood Chair', 'Hewn Chair'),
      ],
      '',
      yes
    )
    expect(rows.map((r) => r.kind)).toEqual([
      'family',
      'flat',
      'flat',
      'flat',
      'family',
      'flat',
      'flat',
    ])
    expect(rows[0]).toMatchObject({ kind: 'family', familyName: 'Board' })
    expect(rows[3]).toMatchObject({ kind: 'flat', inFamily: false }) // Iron Ore
    expect(rows[4]).toMatchObject({ kind: 'family', familyName: 'Hewn Chair' })
    expect(rows[5]).toMatchObject({ kind: 'flat', inFamily: true })
    expect(rows[6]).toMatchObject({ kind: 'flat', inFamily: true })
  })

  it('includes parent + child rows under a family header with inFamily set', () => {
    const rows = buildProductRows(
      [
        multiGroup('Board', 'Board', ['BoardRecipe', 'AltBoardRecipe']),
        flatGroup('Hardwood Board', 'Board'),
      ],
      '',
      yes
    )
    expect(rows.map((r) => r.kind)).toEqual(['family', 'parent', 'child', 'child', 'flat'])
    // Family header collects userRecipeIds from BOTH the multi-recipe Board
    // group's children AND the flat Hardwood Board group.
    expect(rows[0]).toMatchObject({
      kind: 'family',
      familyName: 'Board',
      childUserRecipeIds: ['ur-BoardRecipe', 'ur-AltBoardRecipe', 'ur-Hardwood Board'],
    })
    expect(rows[1]).toMatchObject({ kind: 'parent', inFamily: true })
    expect(rows[2]).toMatchObject({ kind: 'child', inFamily: true })
    expect(rows[3]).toMatchObject({ kind: 'child', inFamily: true })
    expect(rows[4]).toMatchObject({ kind: 'flat', inFamily: true })
  })

  it('omits the family header when all of a family’s children filter out', () => {
    // Both groups are in family "Board", but childVisible rejects them all →
    // they drop out before family counting, so no header is emitted.
    const rows = buildProductRows(
      [flatGroup('Board', 'Board', 'ur-board'), flatGroup('Hardwood Board', 'Board', 'ur-hwb')],
      '',
      (c) => c.userRecipeId !== 'ur-board' && c.userRecipeId !== 'ur-hwb'
    )
    expect(rows).toEqual([])
  })

  it('drops the family header when a search reduces the cluster to one visible group', () => {
    const rows = buildProductRows(
      [
        flatGroup('Board', 'Board'),
        flatGroup('Hardwood Board', 'Board'),
        flatGroup('Softwood Board', 'Board'),
      ],
      'Hardwood',
      yes
    )
    // Only "Hardwood Board" matches → singleton → no header, no inFamily flag.
    expect(rows.map((r) => r.kind)).toEqual(['flat'])
    expect(rows[0]).toMatchObject({ kind: 'flat', inFamily: false })
  })

  it('keeps the family header when the search leaves 2+ visible cluster members', () => {
    const rows = buildProductRows(
      [
        flatGroup('Board', 'Board'),
        flatGroup('Hardwood Board', 'Board'),
        flatGroup('Softwood Board', 'Board'),
      ],
      'wood Board', // matches Hardwood Board and Softwood Board
      yes
    )
    expect(rows.map((r) => r.kind)).toEqual(['family', 'flat', 'flat'])
    expect(rows[0]).toMatchObject({ kind: 'family' })
  })

  it('treats empty familyName as never clustering even with multiple groups', () => {
    const rows = buildProductRows(
      [flatGroup('Item A', ''), flatGroup('Item B', ''), flatGroup('Item C', '')],
      '',
      yes
    )
    expect(rows.map((r) => r.kind)).toEqual(['flat', 'flat', 'flat'])
    for (const r of rows) {
      expect(r).toMatchObject({ inFamily: false })
    }
  })
})
