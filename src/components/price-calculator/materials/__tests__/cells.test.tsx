import { fireEvent, render } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { usePriceSignal, type PriceSignal } from '@/hooks/use-prices-signal'
import { createBuildStore } from '@/stores/build-store'

import { ComputedPriceCell } from '../ComputedPriceCell'
import { ManualPriceCell } from '../ManualPriceCell'
import { MirrorCheckbox } from '../MirrorCheckbox'
import { TagPriceCell } from '../TagPriceCell'

function makeSignal(): PriceSignal {
  const { result } = renderHook(() => usePriceSignal())
  return result.current
}

function makeBuild() {
  return createBuildStore()
}

describe('ComputedPriceCell', () => {
  it('renders a placeholder when no price is in the signal', () => {
    const signal = makeSignal()
    const { container } = render(<ComputedPriceCell itemOrTagId="iron" signal={signal} />)
    // The en-US `noComputedPrice` string is an em-dash.
    expect(container.textContent?.trim()).toBe('—')
  })

  it('renders the formatted cost when the signal has the item', () => {
    const signal = makeSignal()
    act(() => signal.set({ iron: { costPrice: 4.5, salePrice: 5 } }))
    const { container } = render(<ComputedPriceCell itemOrTagId="iron" signal={signal} />)
    expect(container.textContent?.trim()).toBe('4.50')
  })

  it('renders the calculator icon when showIcon is true', () => {
    const signal = makeSignal()
    const { container } = render(
      <ComputedPriceCell itemOrTagId="iron" signal={signal} showIcon iconTooltip="From tag" />
    )
    expect(container.querySelector('.pi-calculator')).toBeInTheDocument()
  })
})

describe('ManualPriceCell', () => {
  it('shows the userPrice when set', () => {
    const build = makeBuild()
    build.setRow('userPrices', 'up1', {
      id: 'up1',
      buildId: 'b',
      itemOrTagId: 'iron',
      price: 12.34,
    })
    const { container } = render(
      <ManualPriceCell
        itemOrTagId="iron"
        userPriceId="up1"
        buildStore={build}
        onChange={() => {}}
      />
    )
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('12.34')
  })

  it('shows empty when the price is unset (collapsed to null)', () => {
    const build = makeBuild()
    build.setRow('userPrices', 'up1', { id: 'up1', buildId: 'b', itemOrTagId: 'iron', price: 0 })
    const { container } = render(
      <ManualPriceCell
        itemOrTagId="iron"
        userPriceId="up1"
        buildStore={build}
        onChange={() => {}}
      />
    )
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('')
  })

  it('forwards changes via onChange with the row + price ids', () => {
    const build = makeBuild()
    build.setRow('userPrices', 'up1', { id: 'up1', buildId: 'b', itemOrTagId: 'iron', price: 0 })
    const onChange = vi.fn()
    const { container } = render(
      <ManualPriceCell
        itemOrTagId="iron"
        userPriceId="up1"
        buildStore={build}
        onChange={onChange}
      />
    )
    const input = container.querySelector('input') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '8' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith('iron', 'up1', 8)
  })
})

describe('MirrorCheckbox', () => {
  it('returns null when the parent priceMode is not mirror', () => {
    const build = makeBuild()
    build.setRow('userPrices', 'up1', {
      id: 'up1',
      buildId: 'b',
      itemOrTagId: 'tag',
      priceMode: 'min',
    })
    const { container } = render(
      <MirrorCheckbox
        parentTagId="tag"
        parentUserPriceId="up1"
        childItemId="child"
        buildStore={build}
        onSelect={() => {}}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders a checked box when primary matches the child item id', () => {
    const build = makeBuild()
    build.setRow('userPrices', 'up1', {
      id: 'up1',
      buildId: 'b',
      itemOrTagId: 'tag',
      priceMode: 'mirror',
      primaryItemId: 'child',
    })
    const { container } = render(
      <MirrorCheckbox
        parentTagId="tag"
        parentUserPriceId="up1"
        childItemId="child"
        buildStore={build}
        onSelect={() => {}}
      />
    )
    const cb = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(cb.checked).toBe(true)
  })

  it('fires onSelect when toggled', () => {
    const build = makeBuild()
    build.setRow('userPrices', 'up1', {
      id: 'up1',
      buildId: 'b',
      itemOrTagId: 'tag',
      priceMode: 'mirror',
      primaryItemId: 'other',
    })
    const onSelect = vi.fn()
    const { container } = render(
      <MirrorCheckbox
        parentTagId="tag"
        parentUserPriceId="up1"
        childItemId="child"
        buildStore={build}
        onSelect={onSelect}
      />
    )
    fireEvent.click(container.querySelector('input[type="checkbox"]')!)
    expect(onSelect).toHaveBeenCalledWith('tag', 'child', 'up1')
  })
})

describe('TagPriceCell', () => {
  it('renders a ManualPriceCell when mode=manual', () => {
    const build = makeBuild()
    build.setRow('userPrices', 'up1', {
      id: 'up1',
      buildId: 'b',
      itemOrTagId: 'tag',
      priceMode: 'manual',
      price: 10,
    })
    const { container } = render(
      <TagPriceCell
        itemOrTagId="tag"
        userPriceId="up1"
        buildStore={build}
        signal={makeSignal()}
        onPriceChange={() => {}}
      />
    )
    const input = container.querySelector('input') as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(input.value).toBe('10')
  })

  it('renders a ComputedPriceCell with calculator icon for non-manual modes', () => {
    const build = makeBuild()
    build.setRow('userPrices', 'up1', {
      id: 'up1',
      buildId: 'b',
      itemOrTagId: 'tag',
      priceMode: 'min',
    })
    const signal = makeSignal()
    act(() => signal.set({ tag: { costPrice: 7, salePrice: 9 } }))
    const { container } = render(
      <TagPriceCell
        itemOrTagId="tag"
        userPriceId="up1"
        buildStore={build}
        signal={signal}
        onPriceChange={() => {}}
      />
    )
    expect(container.querySelector('input')).toBeNull()
    expect(container.querySelector('.pi-calculator')).toBeInTheDocument()
  })
})
