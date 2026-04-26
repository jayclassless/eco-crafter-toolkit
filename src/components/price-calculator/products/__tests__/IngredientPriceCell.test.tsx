import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createBuildStore } from '@/stores/build-store'

import { IngredientPriceCell } from '../IngredientPriceCell'

import '@/i18n'

function makeBuild(priceMode = 'min') {
  const b = createBuildStore()
  b.setRow('userPrices', 'up1', {
    id: 'up1',
    buildId: 'b',
    itemOrTagId: 'iron',
    priceMode,
    price: 5,
  })
  return b
}

describe('IngredientPriceCell', () => {
  it('renders a read-only formatted price when isProduced=true', () => {
    const build = makeBuild()
    const { container } = render(
      <IngredientPriceCell
        itemOrTagId="iron"
        userPriceId="up1"
        buildStore={build}
        isTag={false}
        isProduced
        unitPrice={4.25}
        onChange={() => {}}
      />
    )
    expect(container.textContent).toBe('4.25')
    expect(container.querySelector('input')).toBeNull()
  })

  it('renders a dash when read-only and unitPrice is null', () => {
    const build = makeBuild()
    const { container } = render(
      <IngredientPriceCell
        itemOrTagId="iron"
        userPriceId="up1"
        buildStore={build}
        isTag={false}
        isProduced
        unitPrice={null}
        onChange={() => {}}
      />
    )
    expect(container.textContent).toBe('-')
  })

  it('renders read-only when isTag=true and priceMode != manual', () => {
    const build = makeBuild('min')
    const { container } = render(
      <IngredientPriceCell
        itemOrTagId="tag-x"
        userPriceId="up1"
        buildStore={build}
        isTag
        isProduced={false}
        unitPrice={2.5}
        onChange={() => {}}
      />
    )
    expect(container.textContent).toBe('2.50')
  })

  it('renders an editable ManualPriceCell when isTag=true and priceMode=manual', () => {
    const build = makeBuild('manual')
    const { container } = render(
      <IngredientPriceCell
        itemOrTagId="tag-x"
        userPriceId="up1"
        buildStore={build}
        isTag
        isProduced={false}
        unitPrice={2.5}
        onChange={() => {}}
      />
    )
    expect(container.querySelector('input')).not.toBeNull()
  })

  it('forwards changes via onChange when editable', () => {
    const build = makeBuild('manual')
    const onChange = vi.fn()
    const { container } = render(
      <IngredientPriceCell
        itemOrTagId="iron"
        userPriceId="up1"
        buildStore={build}
        isTag={false}
        isProduced={false}
        unitPrice={null}
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
