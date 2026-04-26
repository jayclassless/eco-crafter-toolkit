import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RowActionsMenu } from '../RowActionsMenu'

import '@/i18n'

describe('Products RowActionsMenu', () => {
  it('returns null when no actions are provided', () => {
    const { container } = render(<RowActionsMenu />)
    expect(container.firstChild).toBeNull()
  })

  it('renders only the actions whose callback is provided', () => {
    const onMove = vi.fn()
    const { container } = render(<RowActionsMenu onMoveToMaterials={onMove} />)
    fireEvent.click(container.querySelector('button')!)
    expect(screen.getByText('Treat as a Material')).toBeInTheDocument()
    expect(screen.queryByText('Delete recipe')).not.toBeInTheDocument()
  })

  it('fires onMoveToMaterials when the move action is clicked', () => {
    const onMove = vi.fn()
    const { container } = render(<RowActionsMenu onMoveToMaterials={onMove} />)
    fireEvent.click(container.querySelector('button')!)
    fireEvent.click(screen.getByText('Treat as a Material'))
    expect(onMove).toHaveBeenCalled()
  })

  it('fires onDeleteRecipe when the delete action is clicked', () => {
    const onDelete = vi.fn()
    const { container } = render(<RowActionsMenu onDeleteRecipe={onDelete} />)
    fireEvent.click(container.querySelector('button')!)
    fireEvent.click(screen.getByText('Delete recipe'))
    expect(onDelete).toHaveBeenCalled()
  })
})
