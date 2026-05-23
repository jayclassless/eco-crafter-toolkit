import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createGameDataStore } from '@/stores/game-data-store'

import { computeAdHocRecipe } from '../adhoc-recipe-calc'
import { AdHocCostBreakdown } from '../AdHocCostBreakdown'

import '@/i18n'

const DS = 'ds1'
let game: ReturnType<typeof createGameDataStore>

beforeEach(() => {
  game = createGameDataStore()
  game.setRow('skills', 'sk1', {
    id: 'sk1',
    datasetId: DS,
    name: 'Mining',
    maxLevel: 7,
    laborReducePercent: '[1]',
  })
  game.setRow('items', 'iron', { id: 'iron', datasetId: DS, name: 'Iron', isTag: false })
  game.setRow('items', 'bar', { id: 'bar', datasetId: DS, name: 'Bar', isTag: false })
  game.setRow('recipes', 'r1', {
    id: 'r1',
    datasetId: DS,
    name: 'R',
    familyName: 'F',
    skillId: 'sk1',
    requiredSkillLevel: 0,
    isBlueprint: false,
    isDefault: true,
    craftingTableId: 'ct1',
    baseCraftTime: 1,
    baseLaborCost: 0,
  })
  game.setRow('recipeElements', 're-i', {
    id: 're-i',
    datasetId: DS,
    recipeId: 'r1',
    itemOrTagId: 'iron',
    baseQuantity: -2,
    isProduct: false,
    index: 0,
  })
  game.setRow('recipeElements', 're-p', {
    id: 're-p',
    datasetId: DS,
    recipeId: 'r1',
    itemOrTagId: 'bar',
    baseQuantity: 1,
    isProduct: true,
    index: 0,
  })
})

function makeResult(ingredientPrices: Record<string, number>) {
  return computeAdHocRecipe(
    game,
    DS,
    () => '',
    'r1',
    { skillLevel: 0, pluginModuleId: '', talentStates: {}, ingredientPrices },
    0,
    20
  )!
}

describe('AdHocCostBreakdown', () => {
  it('renders the seeded ingredient price and reports edits via onPriceChange', () => {
    const onPriceChange = vi.fn()
    render(
      <AdHocCostBreakdown
        gameDataStore={game}
        recipeId="r1"
        result={makeResult({ iron: 5 })}
        ingredientPrices={{ iron: 5 }}
        onPriceChange={onPriceChange}
        getName={() => ''}
      />
    )

    const ironInput = screen.getByDisplayValue('5') as HTMLInputElement
    expect(ironInput).toBeInTheDocument()

    fireEvent.change(ironInput, { target: { value: '8' } })
    fireEvent.blur(ironInput)

    expect(onPriceChange).toHaveBeenCalledWith('iron', 8)
  })

  it('shows the Iron ingredient and Bar product names', () => {
    render(
      <AdHocCostBreakdown
        gameDataStore={game}
        recipeId="r1"
        result={makeResult({ iron: 5 })}
        ingredientPrices={{ iron: 5 }}
        onPriceChange={() => {}}
        getName={() => ''}
      />
    )
    expect(screen.getByText('Iron')).toBeInTheDocument()
    expect(screen.getByText('Bar')).toBeInTheDocument()
  })
})
