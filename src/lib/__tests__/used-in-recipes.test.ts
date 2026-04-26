import { beforeEach, describe, expect, it } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'

import { computeUsedInRecipes } from '../used-in-recipes'

const DS = 'ds1'
const BUILD = 'b1'
let game: ReturnType<typeof createGameDataStore>
let build: ReturnType<typeof createBuildStore>

const getName = (kind: string, id: string): string => {
  if (kind === 'recipe') return (game.getCell('recipes', id, 'name') as string) ?? ''
  if (kind === 'skill') return (game.getCell('skills', id, 'name') as string) ?? ''
  if (kind === 'item') return (game.getCell('items', id, 'name') as string) ?? ''
  return ''
}

const addRecipe = (
  recipeId: string,
  recipeName: string,
  skillId: string,
  ingredients: Array<{ id: string; itemOrTagId: string; baseQuantity: number }>,
  products: Array<{ id: string; itemOrTagId: string; baseQuantity: number }>
) => {
  game.setRow('recipes', recipeId, {
    id: recipeId,
    datasetId: DS,
    name: recipeName,
    familyName: recipeName,
    skillId,
    requiredSkillLevel: 0,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct1',
    baseCraftTime: 1,
    baseLaborCost: 10,
  })
  let i = 0
  for (const ing of ingredients) {
    game.setRow('recipeElements', ing.id, {
      id: ing.id,
      datasetId: DS,
      recipeId,
      itemOrTagId: ing.itemOrTagId,
      baseQuantity: -ing.baseQuantity,
      isProduct: false,
      index: i++,
    })
  }
  for (const prod of products) {
    game.setRow('recipeElements', prod.id, {
      id: prod.id,
      datasetId: DS,
      recipeId,
      itemOrTagId: prod.itemOrTagId,
      baseQuantity: prod.baseQuantity,
      isProduct: true,
      index: i++,
    })
  }
  build.setRow('userRecipes', `ur-${recipeId}`, {
    id: `ur-${recipeId}`,
    buildId: BUILD,
    recipeId,
    roundFactor: 0,
  })
}

const addItem = (id: string, name: string, isTag = false) => {
  game.setRow('items', id, { id, datasetId: DS, name, isTag })
}

const addSkill = (id: string, name: string) => {
  game.setRow('skills', id, {
    id,
    datasetId: DS,
    name,
    maxLevel: 7,
    laborReducePercent: '[1]',
  })
}

const addTagItem = (tagId: string, itemId: string) => {
  game.setRow('tagItems', `ti-${tagId}-${itemId}`, {
    id: `ti-${tagId}-${itemId}`,
    datasetId: DS,
    tagId,
    itemId,
  })
}

beforeEach(() => {
  game = createGameDataStore()
  build = createBuildStore()
  addItem('iron', 'Iron')
  addItem('plank', 'Plank')
  addItem('table', 'Table')
  addItem('frame', 'Frame')
  addItem('wood', 'Wood')
  addItem('birch', 'Birch')
  addItem('tag-wood', 'WoodTag', true)
  addSkill('sk-mining', 'Mining')
  addSkill('sk-carpentry', 'Carpentry')
})

describe('computeUsedInRecipes', () => {
  it('returns an empty list when the build has no recipes', () => {
    const result = computeUsedInRecipes(game, build, {
      itemId: 'iron',
      buildId: BUILD,
      datasetId: DS,
      getName,
    })
    expect(result).toEqual([])
  })

  it('lists recipes that consume the item directly', () => {
    addRecipe(
      'r-table',
      'TableRecipe',
      'sk-carpentry',
      [{ id: 're-1', itemOrTagId: 'plank', baseQuantity: 4 }],
      [{ id: 're-2', itemOrTagId: 'table', baseQuantity: 1 }]
    )
    const result = computeUsedInRecipes(game, build, {
      itemId: 'plank',
      buildId: BUILD,
      datasetId: DS,
      getName,
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      recipeId: 'r-table',
      recipeName: 'TableRecipe',
      skillName: 'Carpentry',
      quantity: 4,
      viaTag: null,
      recipePrimaryProductRawName: 'Table',
    })
  })

  it('detects items consumed indirectly through a tag', () => {
    addTagItem('tag-wood', 'wood')
    addRecipe(
      'r-frame',
      'FrameRecipe',
      'sk-carpentry',
      [{ id: 're-1', itemOrTagId: 'tag-wood', baseQuantity: 3 }],
      [{ id: 're-2', itemOrTagId: 'frame', baseQuantity: 1 }]
    )
    const result = computeUsedInRecipes(game, build, {
      itemId: 'wood',
      buildId: BUILD,
      datasetId: DS,
      getName,
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      recipeId: 'r-frame',
      quantity: 3,
      viaTag: { tagId: 'tag-wood', tagName: 'WoodTag', tagRawName: 'WoodTag' },
    })
  })

  it('does not search for tags when isTag=true', () => {
    addTagItem('tag-wood', 'wood')
    addRecipe(
      'r-frame',
      'FrameRecipe',
      'sk-carpentry',
      [
        { id: 're-1', itemOrTagId: 'tag-wood', baseQuantity: 3 },
        { id: 're-2', itemOrTagId: 'wood', baseQuantity: 1 },
      ],
      [{ id: 're-3', itemOrTagId: 'frame', baseQuantity: 1 }]
    )
    const result = computeUsedInRecipes(game, build, {
      itemId: 'tag-wood',
      buildId: BUILD,
      datasetId: DS,
      isTag: true,
      getName,
    })
    // Only the direct-tag ingredient row should be matched.
    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(3)
    expect(result[0].viaTag).toBeNull()
  })

  it('omits the excluded recipe', () => {
    addRecipe(
      'r-self',
      'SelfRecipe',
      'sk-carpentry',
      [{ id: 're-1', itemOrTagId: 'wood', baseQuantity: 1 }],
      [{ id: 're-2', itemOrTagId: 'frame', baseQuantity: 1 }]
    )
    addRecipe(
      'r-other',
      'OtherRecipe',
      'sk-mining',
      [{ id: 're-3', itemOrTagId: 'wood', baseQuantity: 2 }],
      [{ id: 're-4', itemOrTagId: 'plank', baseQuantity: 1 }]
    )
    const result = computeUsedInRecipes(game, build, {
      itemId: 'wood',
      buildId: BUILD,
      datasetId: DS,
      excludeRecipeId: 'r-self',
      getName,
    })
    expect(result.map((r) => r.recipeId)).toEqual(['r-other'])
  })

  it('sorts results by skill name then recipe name', () => {
    addRecipe(
      'r-z',
      'ZRecipe',
      'sk-carpentry',
      [{ id: 're-z1', itemOrTagId: 'wood', baseQuantity: 1 }],
      [{ id: 're-z2', itemOrTagId: 'plank', baseQuantity: 1 }]
    )
    addRecipe(
      'r-a',
      'ARecipe',
      'sk-mining',
      [{ id: 're-a1', itemOrTagId: 'wood', baseQuantity: 1 }],
      [{ id: 're-a2', itemOrTagId: 'frame', baseQuantity: 1 }]
    )
    addRecipe(
      'r-m',
      'MRecipe',
      'sk-carpentry',
      [{ id: 're-m1', itemOrTagId: 'wood', baseQuantity: 1 }],
      [{ id: 're-m2', itemOrTagId: 'table', baseQuantity: 1 }]
    )
    const result = computeUsedInRecipes(game, build, {
      itemId: 'wood',
      buildId: BUILD,
      datasetId: DS,
      getName,
    })
    expect(result.map((r) => r.recipeId)).toEqual(['r-m', 'r-z', 'r-a'])
  })

  it('selects the first non-self product as the recipePrimaryProductRawName', () => {
    // Recipe ingredient = wood, products = [wood, plank]; wood is also an
    // ingredient, so primary product should fall back to plank.
    addRecipe(
      'r-loop',
      'LoopRecipe',
      'sk-carpentry',
      [{ id: 're-1', itemOrTagId: 'wood', baseQuantity: 1 }],
      [
        { id: 're-2', itemOrTagId: 'wood', baseQuantity: 0.5 },
        { id: 're-3', itemOrTagId: 'plank', baseQuantity: 1 },
      ]
    )
    const result = computeUsedInRecipes(game, build, {
      itemId: 'wood',
      buildId: BUILD,
      datasetId: DS,
      getName,
    })
    expect(result[0].recipePrimaryProductRawName).toBe('Plank')
  })

  it('drops recipes that are in another build', () => {
    addRecipe(
      'r-keep',
      'KeepRecipe',
      'sk-carpentry',
      [{ id: 're-1', itemOrTagId: 'wood', baseQuantity: 1 }],
      [{ id: 're-2', itemOrTagId: 'plank', baseQuantity: 1 }]
    )
    // Recipe in a different build
    game.setRow('recipes', 'r-other', {
      id: 'r-other',
      datasetId: DS,
      name: 'Other',
      familyName: 'Other',
      skillId: 'sk-mining',
      requiredSkillLevel: 0,
      isBlueprint: false,
      isDefault: true,
      craftingTableId: 'ct1',
      baseCraftTime: 1,
      baseLaborCost: 10,
    })
    game.setRow('recipeElements', 're-other-1', {
      id: 're-other-1',
      datasetId: DS,
      recipeId: 'r-other',
      itemOrTagId: 'wood',
      baseQuantity: -1,
      isProduct: false,
      index: 0,
    })
    build.setRow('userRecipes', 'ur-other', {
      id: 'ur-other',
      buildId: 'other-build',
      recipeId: 'r-other',
      roundFactor: 0,
    })

    const result = computeUsedInRecipes(game, build, {
      itemId: 'wood',
      buildId: BUILD,
      datasetId: DS,
      getName,
    })
    expect(result.map((r) => r.recipeId)).toEqual(['r-keep'])
  })
})
