import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createTestStores, makeWrapper } from '@/hooks/__tests__/store-wrapper'

import { ProductsDataTable } from '../ProductsDataTable'
import type { Row } from '../types'

function makeFlatRow(i: number): Row {
  return {
    rowKey: `flat-${i}`,
    kind: 'flat',
    product: {
      userRecipeId: `ur${i}`,
      recipeId: `r${i}`,
      recipeName: `Recipe${i}`,
      skillId: 'sk1',
      skillName: 'Mining',
      skillRawName: 'MiningSkill',
      craftingTableId: 'ct1',
      requiredSkillLevel: 1,
      primaryProductRawName: `Item${i}`,
      recipePrimaryProductRawName: `Item${i}`,
      productItemIds: [`it-${i}`],
      primaryProductId: `it-${i}`,
      primaryProductName: `Item ${i}`,
      userPriceId: `up${i}`,
      userMarginId: 'm1',
      unlockingTalentIds: [],
    },
  } as unknown as Row
}

const rows: Row[] = [makeFlatRow(1)]

function renderTable(tableRows: Row[]) {
  const Wrapper = makeWrapper(createTestStores())
  return render(
    <Wrapper>
      <ProductsDataTable
        rows={tableRows}
        margins={[{ id: 'm1', name: 'Default' }]}
        defaultMarginId="m1"
        emptyMessage="nothing here"
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
    </Wrapper>
  )
}

describe('ProductsDataTable', () => {
  it('renders one row per item plus the column headers', () => {
    renderTable(rows)
    expect(screen.getByText('name-flat-1')).toBeInTheDocument()
    expect(screen.getByText('Product')).toBeInTheDocument()
    expect(screen.getByText('Cost')).toBeInTheDocument()
    expect(screen.getByText('Margin')).toBeInTheDocument()
    expect(screen.getByText('Sale')).toBeInTheDocument()
  })

  it('shows the empty message when no rows are passed', () => {
    renderTable([])
    expect(screen.getByText('nothing here')).toBeInTheDocument()
  })

  it('renders classically (no virtual scroller) below the row threshold', () => {
    const { container } = renderTable(rows)
    expect(container.querySelector('.p-virtualscroller')).toBeNull()
  })

  it('switches to virtual scrolling for large row counts', () => {
    const many = Array.from({ length: 150 }, (_, i) => makeFlatRow(i))
    const { container } = renderTable(many)
    expect(container.querySelector('.p-virtualscroller')).not.toBeNull()
  })
})
