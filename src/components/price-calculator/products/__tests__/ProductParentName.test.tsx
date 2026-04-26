import { render, screen } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { usePriceSignal } from '@/hooks/use-prices-signal'
import { createBuildStore } from '@/stores/build-store'

import { ProductParentName } from '../ProductParentName'

describe('ProductParentName', () => {
  it('forwards parent fields into ProductItemName and renders the name', () => {
    const { result } = renderHook(() => usePriceSignal())
    const build = createBuildStore()
    build.setRow('userPrices', 'up1', {
      id: 'up1',
      buildId: 'b',
      itemOrTagId: 'iron',
      priceMode: 'min',
    })
    render(
      <ProductParentName
        parent={{
          primaryProductId: 'iron',
          primaryProductName: 'Iron Bar',
          primaryProductRawName: 'IronItem',
          userPriceId: 'up1',
          productUserMarginId: '',
        }}
        userPriceId="up1"
        buildStore={build}
        signal={result.current}
        onOpenRecipe={() => {}}
      />
    )
    expect(screen.getByText('Iron Bar')).toBeInTheDocument()
  })
})
