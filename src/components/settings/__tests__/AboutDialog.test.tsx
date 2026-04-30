import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AboutDialog } from '../AboutDialog'

import '@/i18n'

describe('AboutDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the icon, app name, and package version in the header', () => {
    render(<AboutDialog visible onHide={() => {}} />)
    expect(screen.getByAltText('Eco Crafter Toolkit')).toBeInTheDocument()
    expect(screen.getAllByText('Eco Crafter Toolkit').length).toBeGreaterThan(0)
    expect(screen.getByText(`v${__APP_VERSION__}`)).toBeInTheDocument()
  })

  it('renders nothing when not visible', () => {
    render(<AboutDialog visible={false} onHide={() => {}} />)
    expect(screen.queryByText(/Welcome to the Eco Crafter Toolkit/i)).not.toBeInTheDocument()
  })

  it('calls onHide when the close button is clicked', () => {
    const onHide = vi.fn()
    render(<AboutDialog visible onHide={onHide} />)
    const closeBtn = document.body.querySelector('.p-dialog-header-close') as HTMLButtonElement
    expect(closeBtn).not.toBeNull()
    fireEvent.click(closeBtn)
    expect(onHide).toHaveBeenCalledTimes(1)
  })
})
