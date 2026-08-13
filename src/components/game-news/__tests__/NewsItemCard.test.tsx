import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { localeProvider } from '@/i18n/__tests__/locale-provider'
import type { SteamNewsItem } from '@/lib/steam-news'

import { NewsItemCard } from '../NewsItemCard'

import '@/i18n'

function newsItem(overrides: Partial<SteamNewsItem> = {}): SteamNewsItem {
  return {
    gid: 'n1',
    title: 'Update 14.1',
    url: 'https://example.invalid/news/1',
    author: 'strangeloopgames',
    contents: 'Patch notes',
    feedlabel: 'Community Announcements',
    // 2026-04-25T12:00:00Z
    date: Date.UTC(2026, 3, 25, 12, 0, 0) / 1000,
    ...overrides,
  }
}

describe('NewsItemCard', () => {
  it('renders the date and author as one catalog phrase', () => {
    // The separator used to be glued on in JSX, so neither it nor the ordering
    // was reachable by a translator.
    render(<NewsItemCard item={newsItem()} />)
    expect(screen.getByText('Apr 25, 2026 · by strangeloopgames')).toBeInTheDocument()
  })

  it('renders the date alone when the item has no author', () => {
    render(<NewsItemCard item={newsItem({ author: '' })} />)
    expect(screen.getByText('Apr 25, 2026')).toBeInTheDocument()
  })

  it('formats the date in the app locale', () => {
    render(<NewsItemCard item={newsItem()} />, { wrapper: localeProvider('de-DE') })
    expect(screen.getByText('25.04.2026 · by strangeloopgames')).toBeInTheDocument()
  })
})
