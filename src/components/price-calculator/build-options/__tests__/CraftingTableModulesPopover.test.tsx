import { fireEvent, render, screen } from '@testing-library/react'
import { OverlayPanel } from 'primereact/overlaypanel'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { ModuleSlot } from '@/types/game-data'

import type { ModuleSlotRow } from '../crafting-table-modules-types'
import { CraftingTableModulesPopover } from '../CraftingTableModulesPopover'

import '@/i18n'

function candidate(id: string, name = id) {
  return { id, name, rawName: name }
}

const FOUR_SLOTS: ModuleSlotRow[] = [
  { slot: 'Basic', starCost: 1, candidates: [candidate('pm-basic', 'BasicUpgradeItem')] },
  { slot: 'Advanced', starCost: 1, candidates: [candidate('pm-adv', 'AdvancedUpgradeItem')] },
  { slot: 'Modern', starCost: 1, candidates: [candidate('pm-modern', 'ModernUpgradeItem')] },
  {
    slot: 'Specialty',
    starCost: 0,
    candidates: [candidate('pm-carp', 'CarpentryUpgrade'), candidate('pm-log', 'LoggingUpgrade')],
  },
]

function Harness({
  slots,
  selected,
  onSelect,
}: {
  slots: ModuleSlotRow[]
  selected: Partial<Record<ModuleSlot, string>>
  onSelect: (slot: ModuleSlot, id: string) => void
}) {
  const op = useRef<OverlayPanel>(null)
  return (
    <>
      <button type="button" onClick={(e) => op.current?.toggle(e)}>
        open
      </button>
      <CraftingTableModulesPopover
        op={op}
        slots={slots}
        selected={selected}
        onSelect={onSelect}
        idPrefix="t1"
      />
    </>
  )
}

function open(
  slots: ModuleSlotRow[],
  selected: Partial<Record<ModuleSlot, string>> = {},
  onSelect = vi.fn()
) {
  render(<Harness slots={slots} selected={selected} onSelect={onSelect} />)
  fireEvent.click(screen.getByText('open'))
  return { onSelect, panel: document.body.querySelector('.p-overlaypanel') as HTMLElement }
}

describe('CraftingTableModulesPopover', () => {
  it('renders one row per slot, in game core-slot order', () => {
    const { panel } = open(FOUR_SLOTS)
    expect(panel.textContent).toMatch(/Basic[\s\S]*Advanced[\s\S]*Modern[\s\S]*Specialty/)
  })

  it('shows a star chip for the paid slots and none for Specialty', () => {
    // The chip is how the popover surfaces what installing actually costs —
    // the counterweight to controls that are deliberately reversible here but
    // permanent in game.
    const { panel } = open(FOUR_SLOTS)
    expect(panel.querySelectorAll('.pi-star-fill')).toHaveLength(3)
  })

  it('renders a checkbox for a single-candidate slot and a dropdown when there are several', () => {
    const { panel } = open(FOUR_SLOTS)
    // Three generic slots, one candidate each in every shipped v14 table.
    expect(panel.querySelectorAll('.p-checkbox')).toHaveLength(3)
    // Specialty has two candidates here, so it must not collapse to a checkbox.
    expect(panel.querySelectorAll('.p-dropdown')).toHaveLength(1)
  })

  it('installs and uninstalls via the single-candidate checkbox', () => {
    // Reversibility is deliberate: this is a planning tool, and comparing table
    // configurations before spending stars is the decision it exists to serve.
    // Uninstalling is impossible in game, so nothing else forces this path.
    const onSelect = vi.fn()
    const { rerender } = render(<Harness slots={FOUR_SLOTS} selected={{}} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('open'))
    fireEvent.click(screen.getByLabelText('BasicUpgradeItem'))
    expect(onSelect).toHaveBeenCalledWith('Basic', 'pm-basic')

    onSelect.mockClear()
    rerender(<Harness slots={FOUR_SLOTS} selected={{ Basic: 'pm-basic' }} onSelect={onSelect} />)
    fireEvent.click(screen.getByLabelText('BasicUpgradeItem'))
    expect(onSelect).toHaveBeenCalledWith('Basic', '')
  })

  it('reflects the installed module in the checkbox state', () => {
    const { panel } = open(FOUR_SLOTS, { Advanced: 'pm-adv' })
    const boxes = panel.querySelectorAll('.p-checkbox')
    expect(boxes[0].getAttribute('data-p-highlight')).toBe('false')
    expect(boxes[1].getAttribute('data-p-highlight')).toBe('true')
  })

  it('offers a None entry in the multi-candidate dropdown so a slot can be cleared', async () => {
    const onSelect = vi.fn()
    const { panel } = open(FOUR_SLOTS, { Specialty: 'pm-carp' }, onSelect)
    fireEvent.click(panel.querySelector('.p-dropdown') as HTMLElement)
    fireEvent.click(await screen.findByText('None'))
    expect(onSelect).toHaveBeenCalledWith('Specialty', '')
  })

  it('renders only the slots it is given', () => {
    // Not every table exposes all four — two v14 tables derive [Modern,
    // Specialty] and one derives [Basic, Advanced, Modern].
    const { panel } = open([FOUR_SLOTS[2], FOUR_SLOTS[3]])
    expect(panel.textContent).not.toMatch(/Basic/)
    expect(panel.textContent).toMatch(/Modern/)
  })

  it('stops a checkbox click from bubbling out of the panel content', () => {
    // Regression: PrimeReact's OverlayPanel flags itself "panel-clicked" on any
    // content click, which then swallows the first outside click — so toggling a
    // checkbox used to leave the panel needing two outside clicks to close. The
    // popover stops content clicks before they reach that internal handler; a
    // click still bubbling to an ancestor proves the flag would have been set.
    const ancestorClick = vi.fn()
    render(
      <div onClick={ancestorClick}>
        <Harness slots={FOUR_SLOTS} selected={{}} onSelect={vi.fn()} />
      </div>
    )
    fireEvent.click(screen.getByText('open'))
    ancestorClick.mockClear() // ignore the trigger-button click itself
    fireEvent.click(screen.getByLabelText('BasicUpgradeItem'))
    expect(ancestorClick).not.toHaveBeenCalled()
  })

  it('lets clicks inside the slot dropdown propagate so its overlay keeps coordinating', () => {
    // The dropdown's list renders in the document body ("outside" the panel), so
    // the panel-clicked flag is what keeps this popover open while the user
    // picks from it — those clicks must be allowed through, unlike checkboxes.
    const ancestorClick = vi.fn()
    render(
      <div onClick={ancestorClick}>
        <Harness slots={FOUR_SLOTS} selected={{}} onSelect={vi.fn()} />
      </div>
    )
    fireEvent.click(screen.getByText('open'))
    ancestorClick.mockClear()
    const panel = document.body.querySelector('.p-overlaypanel') as HTMLElement
    fireEvent.click(panel.querySelector('.p-dropdown') as HTMLElement)
    expect(ancestorClick).toHaveBeenCalled()
  })
})
