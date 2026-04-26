import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ProductsDataTable } from '../ProductsDataTable'
import type { Row } from '../types'

const rows: Row[] = [
  {
    rowKey: 'flat-1',
    kind: 'flat',
    product: {
      userRecipeId: 'ur1',
      recipeId: 'r1',
      recipeName: 'IronRecipe',
      skillId: 'sk1',
      skillName: 'Mining',
      skillRawName: 'MiningSkill',
      craftingTableId: 'ct1',
      requiredSkillLevel: 1,
      primaryProductRawName: 'IronItem',
      recipePrimaryProductRawName: 'IronItem',
      productItemIds: ['it-iron'],
      primaryProductId: 'it-iron',
      primaryProductName: 'Iron',
      userPriceId: 'up1',
      userMarginId: 'm1',
      unlockingTalentIds: [],
    },
  } as unknown as Row,
]

describe('ProductsDataTable', () => {
  it('renders one row per item plus the column headers', () => {
    render(
      <ProductsDataTable
        rows={rows}
        margins={[{ id: 'm1', name: 'Default' }]}
        defaultMarginId="m1"
        emptyMessage="empty"
        productHeader="Product"
        costHeader="Cost"
        marginHeader="Margin"
        saleHeader="Sale"
        nameTemplate={(r) => <span>name-{r.rowKey}</span>}
        costTemplate={() => <span>cost</span>}
        marginTemplate={() => <span>margin</span>}
        saleTemplate={() => <span>sale</span>}
        actionsTemplate={() => <span>actions</span>}
      />
    )
    expect(screen.getByText('name-flat-1')).toBeInTheDocument()
    expect(screen.getByText('Product')).toBeInTheDocument()
    expect(screen.getByText('Cost')).toBeInTheDocument()
    expect(screen.getByText('Margin')).toBeInTheDocument()
    expect(screen.getByText('Sale')).toBeInTheDocument()
  })

  it('shows the empty message when no rows are passed', () => {
    render(
      <ProductsDataTable
        rows={[]}
        margins={[]}
        defaultMarginId=""
        emptyMessage="nothing here"
        productHeader="Product"
        costHeader="Cost"
        marginHeader="Margin"
        saleHeader="Sale"
        nameTemplate={() => null}
        costTemplate={() => null}
        marginTemplate={() => null}
        saleTemplate={() => null}
        actionsTemplate={() => null}
      />
    )
    expect(screen.getByText('nothing here')).toBeInTheDocument()
  })
})
