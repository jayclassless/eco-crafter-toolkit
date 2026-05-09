import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetGitHubReleasesCacheForTests } from '@/lib/github-releases'

import { AboutDialog } from '../AboutDialog'

import '@/i18n'

describe('AboutDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    _resetGitHubReleasesCacheForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  it('renders the About tab content by default', () => {
    render(<AboutDialog visible onHide={() => {}} />)
    expect(screen.getByText(/Welcome to the Eco Crafter Toolkit/i)).toBeInTheDocument()
  })

  it('renders the Update History tab when activated', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    )
    render(<AboutDialog visible onHide={() => {}} />)
    const tab = screen.getByRole('tab', { name: /update history/i })
    fireEvent.click(tab)
    await waitFor(() => {
      expect(screen.getByText('No releases yet.')).toBeInTheDocument()
    })
  })

  it('does not fetch GitHub releases when the dialog is hidden', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<AboutDialog visible={false} onHide={() => {}} />)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
