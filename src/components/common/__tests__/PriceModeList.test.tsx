import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PRICE_MODE_ICON, PriceModeList } from '../PriceModeList'

describe('PriceModeList', () => {
  it('renders one labeled radio per mode', () => {
    const { container } = render(
      <PriceModeList
        inputIdPrefix="t"
        modes={['min', 'max', 'avg', 'mirror']}
        activeMode="avg"
        onSelectMode={() => {}}
      />
    )
    const radios = container.querySelectorAll('input[type="radio"]')
    expect(radios).toHaveLength(4)
    const checked = container.querySelectorAll('input[type="radio"]:checked')
    expect(checked).toHaveLength(1)
  })

  it('fires onSelectMode with the clicked mode', () => {
    const onSelectMode = vi.fn()
    const { container } = render(
      <PriceModeList
        inputIdPrefix="t"
        modes={['min', 'max']}
        activeMode="min"
        onSelectMode={onSelectMode}
      />
    )
    const maxRadio = container.querySelector('#t-max') as HTMLInputElement
    fireEvent.click(maxRadio)
    expect(onSelectMode).toHaveBeenCalledWith('max')
  })

  it('exposes a unique icon for every mode', () => {
    expect(Object.keys(PRICE_MODE_ICON).sort()).toEqual(['avg', 'manual', 'max', 'min', 'mirror'])
    const icons = Object.values(PRICE_MODE_ICON)
    expect(new Set(icons).size).toBe(icons.length)
  })
})
