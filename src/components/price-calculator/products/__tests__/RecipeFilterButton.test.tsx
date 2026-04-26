import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RecipeFilterButton } from '../RecipeFilterButton'

import '@/i18n'

const baseProps = {
  skillOptions: [
    { id: 's1', name: 'Mining' },
    { id: 's2', name: 'Carpentry' },
  ],
  hiddenSkills: new Set<string>(),
  showUnskilled: true,
  onToggleSkill: vi.fn(),
  onToggleUnskilled: vi.fn(),
  onSetAllSkills: vi.fn(),
  craftingTableOptions: [{ id: 'ct1', name: 'Workbench' }],
  hiddenCraftingTables: new Set<string>(),
  onToggleCraftingTable: vi.fn(),
  onSetAllCraftingTables: vi.fn(),
  tagOptions: [
    { id: 'tag-wood', name: 'WoodTag', kind: 'tag' as const },
    { id: 'tag-part', name: 'Parts', kind: 'part' as const },
  ],
  hiddenTags: new Set<string>(),
  showParts: true,
  showUntagged: true,
  onToggleTag: vi.fn(),
  onTogglePart: vi.fn(),
  onToggleUntagged: vi.fn(),
  onSetAllTags: vi.fn(),
  onlyLevelAccessible: false,
  onToggleOnlyLevelAccessible: vi.fn(),
}

describe('RecipeFilterButton', () => {
  it('shows the empty filter icon when nothing is hidden', () => {
    const { container } = render(<RecipeFilterButton {...baseProps} />)
    expect(container.querySelector('.pi-filter')).toBeInTheDocument()
    expect(container.querySelector('.pi-filter-fill')).toBeNull()
  })

  it('shows the filled filter icon when any filter is active', () => {
    const { container } = render(
      <RecipeFilterButton {...baseProps} hiddenSkills={new Set(['s1'])} />
    )
    expect(container.querySelector('.pi-filter-fill')).toBeInTheDocument()
  })

  it('opens the overlay and shows the option lists', () => {
    const { container } = render(<RecipeFilterButton {...baseProps} />)
    fireEvent.click(container.querySelector('button')!)
    // Skills section
    expect(screen.getByLabelText('Mining')).toBeInTheDocument()
    expect(screen.getByLabelText('Carpentry')).toBeInTheDocument()
    // Crafting tables section
    expect(screen.getByLabelText('Workbench')).toBeInTheDocument()
    // Tag/part options
    expect(screen.getByLabelText('WoodTag')).toBeInTheDocument()
    expect(screen.getByLabelText('Parts')).toBeInTheDocument()
  })

  it('routes skill / unskilled / level checkbox toggles through the right callbacks', () => {
    const onToggleSkill = vi.fn()
    const onToggleUnskilled = vi.fn()
    const onToggleOnlyLevelAccessible = vi.fn()
    const { container } = render(
      <RecipeFilterButton
        {...baseProps}
        onToggleSkill={onToggleSkill}
        onToggleUnskilled={onToggleUnskilled}
        onToggleOnlyLevelAccessible={onToggleOnlyLevelAccessible}
      />
    )
    fireEvent.click(container.querySelector('button')!)
    fireEvent.click(screen.getByLabelText('Mining'))
    expect(onToggleSkill).toHaveBeenCalledWith('s1')
    fireEvent.click(screen.getByLabelText('Unskilled'))
    expect(onToggleUnskilled).toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Only show level/talent-accessible recipes'))
    expect(onToggleOnlyLevelAccessible).toHaveBeenCalled()
  })

  it('routes part toggles to onTogglePart and tag toggles to onToggleTag', () => {
    const onTogglePart = vi.fn()
    const onToggleTag = vi.fn()
    const { container } = render(
      <RecipeFilterButton {...baseProps} onTogglePart={onTogglePart} onToggleTag={onToggleTag} />
    )
    fireEvent.click(container.querySelector('button')!)
    fireEvent.click(screen.getByLabelText('Parts'))
    expect(onTogglePart).toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('WoodTag'))
    expect(onToggleTag).toHaveBeenCalledWith('tag-wood')
  })

  it('All / None buttons call onSetAll* with the right boolean', () => {
    const onSetAllSkills = vi.fn()
    const onSetAllCraftingTables = vi.fn()
    const onSetAllTags = vi.fn()
    const { container } = render(
      <RecipeFilterButton
        {...baseProps}
        onSetAllSkills={onSetAllSkills}
        onSetAllCraftingTables={onSetAllCraftingTables}
        onSetAllTags={onSetAllTags}
      />
    )
    fireEvent.click(container.querySelector('button')!)
    const allButtons = Array.from(document.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'All'
    )
    const noneButtons = Array.from(document.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'None'
    )
    expect(allButtons).toHaveLength(3)
    expect(noneButtons).toHaveLength(3)
    fireEvent.click(allButtons[0])
    expect(onSetAllSkills).toHaveBeenCalledWith(false)
    fireEvent.click(noneButtons[0])
    expect(onSetAllSkills).toHaveBeenCalledWith(true)
    fireEvent.click(allButtons[1])
    expect(onSetAllCraftingTables).toHaveBeenCalledWith(false)
    fireEvent.click(noneButtons[2])
    expect(onSetAllTags).toHaveBeenCalledWith(true)
  })
})
