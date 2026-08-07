import { readFileSync } from 'fs'
import { resolve } from 'path'

import { describe, expect, it } from 'vitest'

import type { DatasetJson } from '@/types/dataset-json'

import { CRAFT_GARBAGE_RATIO } from '../game-constants'
import { computeRecipeGarbage, type GarbageQuantity } from '../recipe-garbage'

function load(id: string): DatasetJson {
  return JSON.parse(
    readFileSync(resolve(__dirname, `../../../public/data/${id}.json`), 'utf-8')
  ) as DatasetJson
}

/**
 * Drive `computeRecipeGarbage` straight off a shipped dataset, keyed by raw
 * game names rather than store row ids.
 *
 * Every expected number below is derived from the extracted JSON, never
 * hand-transcribed — a re-extraction that changes a SalvageCost fails these
 * rather than silently shifting the Waste tab.
 */
function fromDataset(id: string, recipeName: string, pinnedTagItems: Record<string, string> = {}) {
  const data = load(id)
  const recipe = data.Recipes.find((r) => r.Name === recipeName)
  if (!recipe) throw new Error(`${recipeName} not in ${id}`)

  const salvageByItemId = new Map(
    data.Items.filter((i) => i.SalvageCost?.length).map((i) => [
      i.Name,
      i.SalvageCost!.map((s) => ({ itemId: s.ItemOrTag, quantity: s.Quantity })),
    ])
  )
  // Mirror the importer: it only writes a `tagItems` row for an AssociatedItem
  // that resolves to a real Item (`import-dataset.ts`). Roughly 40 of the 50
  // names on the `Wood` tag are `*Stacked*Block` variants that are blocks, not
  // items, and are dropped — which is exactly why `Wood` turns out UNIFORM in
  // the app. Feeding the raw list here would test a candidate set production
  // never sees, and would wrongly report a range for a tag the UI shows as
  // exact.
  const itemNames = new Set(data.Items.map((i) => i.Name))
  const tagItems = new Map(
    data.Tags.map((t) => [t.Name, t.AssociatedItems.filter((n) => itemNames.has(n))])
  )

  return {
    recipe,
    result: computeRecipeGarbage({
      explicit: (recipe.GarbageOutputs ?? []).map((g) => ({
        itemId: g.ItemOrTag,
        quantity: g.Quantity,
      })),
      // BASE quantities, per the in-game finding that modules don't scale garbage.
      ingredients: (recipe.Ingredients ?? []).map((i) => ({
        itemOrTagId: i.ItemOrTag,
        quantity: i.Quantity.BaseValue,
      })),
      salvageByItemId,
      tagItemIds: (id) => tagItems.get(id),
      resolveTagItem: (tagId) => pinnedTagItems[tagId] ?? null,
      ratio: CRAFT_GARBAGE_RATIO,
    }),
  }
}

/** Exact totals as `{ item: quantity }`, asserting nothing is a range. */
function exactTotals(totals: GarbageQuantity[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of totals) {
    expect(t.min, `${t.itemId} should be exact`).toBeCloseTo(t.max, 10)
    out[t.itemId] = +t.max.toFixed(6)
  }
  return out
}

describe('computeRecipeGarbage — v14 fixtures', () => {
  it('reproduces AdvancedCircuitRecipe exactly as the game UI shows it', () => {
    // The strongest fixture available: these five numbers were read off a live
    // v14 server and hand-checked against the extracted data. They validate the
    // two-part formula at once — the explicit ChemicalWaste is LITERAL (0.1, not
    // 0.1 × 0.08), while everything else is quantity × salvage × ratio.
    const { result } = fromDataset('eco-v14', 'AdvancedCircuitRecipe')
    expect(exactTotals(result.totals)).toEqual({
      PlasticScrapItem: 0.32, // SubstrateItem ×2 × 2.0 × 0.08
      GoldScrapItem: 0.128, // GoldWiring ×4 × 0.15 + GoldFlakes ×10 × 0.1, then × 0.08
      ChemicalWasteItem: 0.1, // explicit GarbageOutput — ratio NOT applied
      CopperScrapItem: 0.064, // InsulatedCopperWiring ×4 × 0.2 × 0.08
      BioResidueItem: 0.032, // InsulatedCopperWiring ×4 × 0.1 × 0.08
    })
    // Sorted largest-first so the UI can render totals without re-sorting.
    expect(result.totals.map((t) => t.itemId)).toEqual([
      'PlasticScrapItem',
      'GoldScrapItem',
      'ChemicalWasteItem',
      'CopperScrapItem',
      'BioResidueItem',
    ])
  })

  it('aggregates one output across two ingredients', () => {
    // GoldScrap comes from GoldWiring AND GoldFlakes. The breakdown keeps them
    // as separate rows; only the totals merge.
    const { result } = fromDataset('eco-v14', 'AdvancedCircuitRecipe')
    const gold = result.breakdown.filter((r) => r.outputs.some((o) => o.itemId === 'GoldScrapItem'))
    expect(gold.map((r) => r.sourceItemOrTagId)).toEqual(['GoldWiringItem', 'GoldFlakesItem'])
    expect(gold[0].outputs[0].max).toBeCloseTo(0.048)
    expect(gold[1].outputs[0].max).toBeCloseTo(0.08)
  })

  it('merges explicit and derived garbage of the same material (SteelBarRecipe)', () => {
    // Four things at once: a zero-salvage ingredient (CrushedCoal) contributing
    // nothing; two ingredients aggregating into CrushedMixedRock; explicit
    // (0.2) and derived (0.032) CeramicScrap merging — the likeliest place for
    // an aggregation bug to hide; and the non-obvious StoneRubble →
    // CrushedMixedRockItem garbage-material mapping.
    const { recipe, result } = fromDataset('eco-v14', 'SteelBarRecipe')
    expect(exactTotals(result.totals)).toEqual({
      CeramicScrapItem: 0.232,
      CrushedMixedRockItem: 0.192,
    })

    expect(recipe.Ingredients?.some((i) => i.ItemOrTag === 'CrushedCoalItem')).toBe(true)
    // No row at all for the zero-salvage ingredient.
    expect(result.breakdown.map((r) => r.sourceItemOrTagId)).toEqual([
      null, // explicit
      'IronConcentrateItem',
      'CeramicMoldItem',
      'QuicklimeItem',
    ])
  })

  it('returns nothing for a v14 recipe that genuinely produces no garbage', () => {
    // Pins the empty-totals path that hides the Waste tab, on a v14 dataset
    // rather than only on a legacy one.
    const { result } = fromDataset('eco-v14', 'CrushedIronOreRecipe')
    expect(result.totals).toEqual([])
    expect(result.breakdown).toEqual([])
  })
})

describe('computeRecipeGarbage — tag ingredients', () => {
  it('treats a tag whose items agree as exact, not a degenerate range', () => {
    // `BoardRecipe` consumes `Wood ×1`. All 10 real items on that tag carry
    // BioResidue 0.25 — the differing `*Stacked*Block` entries are dropped by
    // the importer — so there is one honest number and no "varies" noise.
    const { result } = fromDataset('eco-v14', 'BoardRecipe')
    expect(result.breakdown).toHaveLength(1)
    expect(result.breakdown[0].sourceItemOrTagId).toBe('Wood')
    expect(result.breakdown[0].isRange).toBe(false)
    expect(exactTotals(result.totals)).toEqual({ BioResidueItem: 0.02 }) // 1 × 0.25 × 0.08
  })

  it('ranges over a tag whose items genuinely disagree', () => {
    // `PrimitiveBinRecipe` is the ideal fixture: `Wood ×4` is uniform (exact
    // 0.08 BioResidue) while `WoodBoard ×2` spans WoodScrap 0.3 / 0.4 / 0.5, so
    // one recipe exercises both paths. 23 of the 46 v14 ingredient tags vary
    // like this, across 347 recipes, so a single made-up number would be wrong
    // far more often than not.
    const { result } = fromDataset('eco-v14', 'PrimitiveBinRecipe')

    const wood = result.breakdown.find((r) => r.sourceItemOrTagId === 'Wood')!
    expect(wood.isRange).toBe(false)
    expect(wood.outputs[0].min).toBeCloseTo(0.08)

    const board = result.breakdown.find((r) => r.sourceItemOrTagId === 'WoodBoard')!
    expect(board.isRange).toBe(true)
    expect(board.resolvedItemId).toBeNull()
    expect(board.outputs[0].itemId).toBe('WoodScrapItem')
    expect(board.outputs[0].min).toBeCloseTo(0.048) // 2 × 0.3 × 0.08
    expect(board.outputs[0].max).toBeCloseTo(0.08) // 2 × 0.5 × 0.08

    const scrap = result.totals.find((t) => t.itemId === 'WoodScrapItem')!
    expect(scrap.min).toBeCloseTo(0.048)
    expect(scrap.max).toBeCloseTo(0.08)
  })

  it('collapses to an exact amount when the build pins the tag to one item', () => {
    const { result } = fromDataset('eco-v14', 'PrimitiveBinRecipe', {
      WoodBoard: 'SoftwoodBoardItem',
    })
    const board = result.breakdown.find((r) => r.sourceItemOrTagId === 'WoodBoard')!
    expect(board.isRange).toBe(false)
    expect(board.resolvedItemId).toBe('SoftwoodBoardItem')
    expect(exactTotals(result.totals)).toEqual({
      BioResidueItem: 0.08,
      WoodScrapItem: 0.08, // 2 × 0.5 × 0.08
    })
  })

  it('ignores a pin that is not actually in the tag', () => {
    // A stale pin left behind by a dataset update must fall back to the range,
    // not silently use the wrong item's salvage.
    const { result } = fromDataset('eco-v14', 'PrimitiveBinRecipe', { WoodBoard: 'IronBarItem' })
    const board = result.breakdown.find((r) => r.sourceItemOrTagId === 'WoodBoard')!
    expect(board.isRange).toBe(true)
    expect(board.resolvedItemId).toBeNull()
  })
})

describe('computeRecipeGarbage — legacy datasets', () => {
  it('produces nothing on v13, which has no garbage data at all', () => {
    // This is what keeps the Waste tab and the Cost Components section hidden
    // for v11–v13 with no version check anywhere in the UI.
    const data = load('eco-v13')
    expect(data.Items.some((i) => i.SalvageCost?.length)).toBe(false)
    expect(data.Recipes.some((r) => r.GarbageOutputs?.length)).toBe(false)

    for (const name of ['SteelBarRecipe', 'BoardRecipe']) {
      const { result } = fromDataset('eco-v13', name)
      expect(result.totals, name).toEqual([])
      expect(result.breakdown, name).toEqual([])
    }
  })
})

describe('computeRecipeGarbage — unit behaviour', () => {
  const salvage = new Map([
    ['iron', [{ itemId: 'ironScrap', quantity: 0.5 }]],
    ['wood', [{ itemId: 'woodScrap', quantity: 0.25 }]],
  ])
  const base = {
    salvageByItemId: salvage,
    tagItemIds: () => undefined,
    resolveTagItem: () => null,
    ratio: 0.08,
  }

  it('ignores the sign of ingredient quantities', () => {
    // The store holds ingredient quantities as negatives.
    const neg = computeRecipeGarbage({
      ...base,
      explicit: [],
      ingredients: [{ itemOrTagId: 'iron', quantity: -4 }],
    })
    const pos = computeRecipeGarbage({
      ...base,
      explicit: [],
      ingredients: [{ itemOrTagId: 'iron', quantity: 4 }],
    })
    expect(neg).toEqual(pos)
    expect(neg.totals[0].max).toBeCloseTo(0.16)
  })

  it('does not scale explicit outputs by the ratio', () => {
    // Confirmed against the game UI. Applying the ratio here would under-report
    // every explicit garbage output by 92%.
    const { totals } = computeRecipeGarbage({
      ...base,
      explicit: [{ itemId: 'chemWaste', quantity: 0.1 }],
      ingredients: [],
    })
    expect(totals).toEqual([{ itemId: 'chemWaste', min: 0.1, max: 0.1 }])
  })

  it('is unaffected by module effects, because it never sees them', () => {
    // Test 5: garbage did not change when upgrade modules were installed. The
    // input carries base quantities and there is no modifier parameter at all,
    // so the only way to regress this is to change the caller — which is what
    // the RecipeDialog test guards.
    const withModulesApplied = computeRecipeGarbage({
      ...base,
      explicit: [],
      // 10 base, what a −35% module stack would have reduced it to.
      ingredients: [{ itemOrTagId: 'iron', quantity: 6.5 }],
    })
    const withBase = computeRecipeGarbage({
      ...base,
      explicit: [],
      ingredients: [{ itemOrTagId: 'iron', quantity: 10 }],
    })
    expect(withBase.totals[0].max).toBeCloseTo(0.4)
    expect(withModulesApplied.totals[0].max).not.toBeCloseTo(withBase.totals[0].max)
  })

  it('drops an ingredient that salvages into nothing', () => {
    const { breakdown } = computeRecipeGarbage({
      ...base,
      explicit: [],
      ingredients: [
        { itemOrTagId: 'coal', quantity: 4 },
        { itemOrTagId: 'iron', quantity: 1 },
      ],
    })
    expect(breakdown.map((r) => r.sourceItemOrTagId)).toEqual(['iron'])
  })

  it('skips a zero-quantity ingredient', () => {
    const { breakdown } = computeRecipeGarbage({
      ...base,
      explicit: [],
      ingredients: [{ itemOrTagId: 'iron', quantity: 0 }],
    })
    expect(breakdown).toEqual([])
  })

  it('reports a uniform tag as exact rather than a degenerate range', () => {
    // 13 of the 46 v14 ingredient tags have identical salvage across every
    // item. Rendering "0.04 – 0.04" for those would be noise.
    const { breakdown } = computeRecipeGarbage({
      ...base,
      explicit: [],
      ingredients: [{ itemOrTagId: 'metalTag', quantity: 1 }],
      tagItemIds: (id) => (id === 'metalTag' ? ['iron', 'iron2'] : undefined),
      salvageByItemId: new Map([
        ['iron', [{ itemId: 'ironScrap', quantity: 0.5 }]],
        ['iron2', [{ itemId: 'ironScrap', quantity: 0.5 }]],
      ]),
    })
    expect(breakdown[0].isRange).toBe(false)
    expect(breakdown[0].outputs[0].min).toBeCloseTo(0.04)
    expect(breakdown[0].outputs[0].max).toBeCloseTo(0.04)
  })
})
