import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createBuildStore } from '@/stores/build-store'

import { PriceModeButton } from '../PriceModeButton'

function makeBuild(mode = 'min') {
  const b = createBuildStore()
  b.setRow('userPrices', 'up1', {
    id: 'up1',
    buildId: 'b',
    itemOrTagId: 'iron',
    priceMode: mode,
  })
  return b
}

describe('PriceModeButton', () => {
  it('renders the icon for the active mode', () => {
    const build = makeBuild('avg')
    const { container } = render(
      <PriceModeButton
        entityId="iron"
        userPriceId="up1"
        buildStore={build}
        modes={['min', 'max', 'avg']}
        inputIdPrefix="t"
        onSelectMode={() => {}}
      />
    )
    // avg → calculator icon
    expect(container.querySelector('.pi-calculator')).toBeInTheDocument()
  })

  it('falls back to the first allowed mode when the stored mode is not in the list', () => {
    const build = makeBuild('manual') // manual not in allowed list
    const { container } = render(
      <PriceModeButton
        entityId="iron"
        userPriceId="up1"
        buildStore={build}
        modes={['min', 'max']}
        inputIdPrefix="t"
        onSelectMode={() => {}}
      />
    )
    // First allowed mode is min → sort-amount-down icon
    expect(container.querySelector('.pi-sort-amount-down')).toBeInTheDocument()
  })

  it('renders the popover with the radio list on click and forwards selections', () => {
    const build = makeBuild('min')
    const onSelectMode = vi.fn()
    const { container } = render(
      <PriceModeButton
        entityId="iron"
        userPriceId="up1"
        buildStore={build}
        modes={['min', 'max']}
        inputIdPrefix="t"
        onSelectMode={onSelectMode}
      />
    )
    fireEvent.click(container.querySelector('button')!)
    const maxRadio = document.querySelector('#t-up1-max') as HTMLInputElement
    expect(maxRadio).toBeInTheDocument()
    fireEvent.click(maxRadio)
    expect(onSelectMode).toHaveBeenCalledWith('iron', 'max', 'up1')
  })
})
