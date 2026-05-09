import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetGitHubReleasesCacheForTests } from '@/lib/github-releases'

import { AboutDialogUpdateHistoryTab } from '../AboutDialogUpdateHistoryTab'

import '@/i18n'

const SAMPLE_RELEASES = [
  {
    id: 1,
    tag_name: 'v0.2.0',
    name: 'Release 0.2.0',
    published_at: '2026-04-01T12:00:00Z',
    body: '# Highlights\n\n- [Link](https://example.com)\n- Second item',
    html_url: 'https://github.com/example/repo/releases/tag/v0.2.0',
    draft: false,
    prerelease: false,
  },
  {
    id: 2,
    tag_name: 'v0.1.0',
    name: null,
    published_at: '2026-01-15T12:00:00Z',
    body: '',
    html_url: 'https://github.com/example/repo/releases/tag/v0.1.0',
    draft: false,
    prerelease: false,
  },
]

describe('AboutDialogUpdateHistoryTab', () => {
  beforeEach(() => {
    _resetGitHubReleasesCacheForTests()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a loading spinner initially', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise(() => {}) // never resolves
    )
    render(<AboutDialogUpdateHistoryTab />)
    expect(screen.getByLabelText('Loading…')).toBeInTheDocument()
  })

  it('renders releases on success and falls back to tag_name when name is null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_RELEASES), { status: 200 })
    )
    render(<AboutDialogUpdateHistoryTab />)

    await waitFor(() => {
      expect(screen.getByText('Release 0.2.0')).toBeInTheDocument()
    })

    expect(screen.getAllByText('v0.1.0').length).toBeGreaterThanOrEqual(1)

    expect(screen.getByText('Highlights').tagName).toBe('H1')
    const link = screen.getByText('Link') as HTMLAnchorElement
    expect(link.tagName).toBe('A')
    expect(link.href).toBe('https://example.com/')

    expect(screen.getByText('No release notes provided.')).toBeInTheDocument()
  })

  it('shows an empty-state message when no releases are returned', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    )
    render(<AboutDialogUpdateHistoryTab />)
    await waitFor(() => {
      expect(screen.getByText('No releases yet.')).toBeInTheDocument()
    })
  })

  it('shows an error message + retry button on fetch failure, and refetches on retry', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('boom', { status: 500, statusText: 'Server Error' }))
      .mockResolvedValueOnce(new Response(JSON.stringify(SAMPLE_RELEASES), { status: 200 }))

    render(<AboutDialogUpdateHistoryTab />)

    await waitFor(() => {
      expect(screen.getByText('Could not load update history.')).toBeInTheDocument()
    })

    const retry = screen.getByRole('button', { name: /retry/i })
    fireEvent.click(retry)

    await waitFor(() => {
      expect(screen.getByText('Release 0.2.0')).toBeInTheDocument()
    })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
