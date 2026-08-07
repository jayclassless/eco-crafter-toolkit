import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ModuleSlotRow } from '../crafting-table-modules-types'
import { CraftingTableModulesCell } from '../CraftingTableModulesCell'

import '@/i18n'

const SLOTS: ModuleSlotRow[] = [
  {
    slot: 'Basic',
    starCost: 1,
    candidates: [{ id: 'pm-basic', name: 'Basic Upgrade', rawName: 'BasicUpgradeItem' }],
  },
  {
    slot: 'Modern',
    starCost: 1,
    candidates: [{ id: 'pm-modern', name: 'Modern Upgrade', rawName: 'ModernUpgradeItem' }],
  },
  {
    slot: 'Specialty',
    starCost: 0,
    candidates: [{ id: 'pm-carp', name: 'Carpentry Upgrade', rawName: 'CarpentryUpgradeItem' }],
  },
]

function renderCell(
  slots: ModuleSlotRow[],
  selected: Parameters<typeof CraftingTableModulesCell>[0]['selected'] = {}
) {
  render(
    <CraftingTableModulesCell slots={slots} selected={selected} onSelect={vi.fn()} idPrefix="t1" />
  )
}

describe('CraftingTableModulesCell', () => {
  it('renders N/A for a table that accepts no modules', () => {
    // Three v14 mining tables (Arrastra, Jaw Crusher, Stamp Mill) lost their
    // module slots entirely.
    renderCell([])
    expect(screen.getByText('N/A')).toBeInTheDocument()
    expect(screen.queryByLabelText('Upgrade Modules')).not.toBeInTheDocument()
  })

  it('shows an add affordance when every slot is empty', () => {
    renderCell(SLOTS)
    expect(screen.getByLabelText('Upgrade Modules')).toBeInTheDocument()
    expect(document.body.querySelector('.pi-plus')).toBeInTheDocument()
    expect(document.body.querySelectorAll('tbody img')).toHaveLength(0)
  })

  it('renders one icon per installed module, in slot order', () => {
    // Slot order, not selection order, so a row stays visually stable as
    // modules come and go.
    renderCell(SLOTS, { Specialty: 'pm-carp', Basic: 'pm-basic' })
    const alts = Array.from(document.body.querySelectorAll('img')).map((i) => i.getAttribute('alt'))
    expect(alts).toEqual(['Basic Upgrade', 'Carpentry Upgrade'])
    expect(document.body.querySelector('.pi-plus')).not.toBeInTheDocument()
  })

  it('ignores a selection that matches no candidate', () => {
    // A dataset update can drop a module a build still references. Rendering
    // nothing beats rendering a broken icon.
    renderCell(SLOTS, { Basic: 'pm-gone' })
    expect(document.body.querySelectorAll('img')).toHaveLength(0)
    expect(document.body.querySelector('.pi-plus')).toBeInTheDocument()
  })
})
