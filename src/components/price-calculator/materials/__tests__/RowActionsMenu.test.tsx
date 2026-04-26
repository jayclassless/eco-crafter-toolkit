import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createBuildStore } from '@/stores/build-store'

import { RowActionsMenu } from '../RowActionsMenu'

import '@/i18n'

function makeBuild() {
  const b = createBuildStore()
  b.setRow('userPrices', 'up1', {
    id: 'up1',
    buildId: 'b',
    itemOrTagId: 'iron',
    priceMode: 'min',
  })
  return b
}

describe('Materials RowActionsMenu', () => {
  it('returns null when no actions are provided', () => {
    const { container } = render(<RowActionsMenu />)
    expect(container.firstChild).toBeNull()
  })

  it('renders only the move action when no priceMode is given', () => {
    const onMove = vi.fn()
    const { container } = render(<RowActionsMenu onMoveToProducts={onMove} />)
    fireEvent.click(container.querySelector('button')!)
    expect(screen.getByText(/Return to Products/i)).toBeInTheDocument()
  })

  it('fires onMoveToProducts when its action is clicked', () => {
    const onMove = vi.fn()
    const { container } = render(<RowActionsMenu onMoveToProducts={onMove} />)
    fireEvent.click(container.querySelector('button')!)
    fireEvent.click(screen.getByText(/Return to Products/i))
    expect(onMove).toHaveBeenCalled()
  })

  it('renders the price-mode menu entry when priceMode prop is provided', () => {
    const build = makeBuild()
    const { container } = render(
      <RowActionsMenu
        priceMode={{
          itemOrTagId: 'iron',
          userPriceId: 'up1',
          buildStore: build,
          modes: ['min', 'max'],
          onSelect: () => {},
        }}
      />
    )
    fireEvent.click(container.querySelector('button')!)
    // OverlayPanel is portaled to body; look there for the mode entry button.
    expect(document.body.querySelectorAll('button').length).toBeGreaterThan(1)
  })

  it('forwards mode picks via the priceMode.onSelect callback', () => {
    const build = makeBuild()
    const onSelect = vi.fn()
    const { container } = render(
      <RowActionsMenu
        priceMode={{
          itemOrTagId: 'iron',
          userPriceId: 'up1',
          buildStore: build,
          modes: ['min', 'max'],
          onSelect,
        }}
      />
    )
    // Open the actions menu, then the mode submenu.
    fireEvent.click(container.querySelector('button')!)
    const modeButtons = Array.from(document.body.querySelectorAll('button')).filter((b) =>
      (b.textContent ?? '').includes('Price mode:')
    )
    expect(modeButtons.length).toBeGreaterThan(0)
    fireEvent.click(modeButtons[0])
    // Mode popover is shown; pick the 'max' radio.
    const maxRadio = document.body.querySelector('input[id$="-max"]') as HTMLInputElement
    fireEvent.click(maxRadio)
    expect(onSelect).toHaveBeenCalledWith('iron', 'max', 'up1')
  })
})
