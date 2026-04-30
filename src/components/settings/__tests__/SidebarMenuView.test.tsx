import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SidebarMenuView } from '../SidebarMenuView'

import '@/i18n'

describe('SidebarMenuView', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the four menu items in order: game news, datasets, ui settings, about', () => {
    render(
      <SidebarMenuView
        onSelectGameNews={() => {}}
        onSelectDatasets={() => {}}
        onSelectUiSettings={() => {}}
        onSelectAbout={() => {}}
      />
    )
    const labels = screen.getAllByRole('menuitem').map((el) => el.textContent?.trim())
    expect(labels).toEqual(['Game News', 'Game Datasets', 'UI Settings', 'About this App'])
  })

  it('invokes onSelectGameNews when the Game News menu item is clicked', () => {
    const onSelectGameNews = vi.fn()
    render(
      <SidebarMenuView
        onSelectGameNews={onSelectGameNews}
        onSelectDatasets={() => {}}
        onSelectUiSettings={() => {}}
        onSelectAbout={() => {}}
      />
    )
    fireEvent.click(screen.getByText('Game News'))
    expect(onSelectGameNews).toHaveBeenCalledTimes(1)
  })

  it('invokes onSelectAbout when the About menu item is clicked', () => {
    const onSelectAbout = vi.fn()
    render(
      <SidebarMenuView
        onSelectGameNews={() => {}}
        onSelectDatasets={() => {}}
        onSelectUiSettings={() => {}}
        onSelectAbout={onSelectAbout}
      />
    )
    fireEvent.click(screen.getByText('About this App'))
    expect(onSelectAbout).toHaveBeenCalledTimes(1)
  })
})
