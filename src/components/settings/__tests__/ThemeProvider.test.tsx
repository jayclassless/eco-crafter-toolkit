import { act, render } from '@testing-library/react'
import type { Store } from 'tinybase'
import type { IndexedDbPersister } from 'tinybase/persisters/persister-indexed-db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBuildStore } from '@/stores/build-store'
import { createGameDataStore } from '@/stores/game-data-store'
import { StoreContext } from '@/stores/providers'
import { createUIStore } from '@/stores/ui-store'

import { ThemeProvider } from '../ThemeProvider'

function stubPersister(): IndexedDbPersister {
  return {
    save: async () => {},
    schedule: async () => {},
  } as unknown as IndexedDbPersister
}

function makeStores(initial?: { themeMode?: string; themeColor?: string; uiScale?: number }) {
  const gameDataStore = createGameDataStore()
  const buildStore = createBuildStore()
  const uiStore = createUIStore()
  uiStore.setRow('uiState', 'main', {
    themeMode: initial?.themeMode ?? 'dark',
    themeColor: initial?.themeColor ?? 'blue',
    uiScale: initial?.uiScale ?? 14,
  })
  return { gameDataStore, buildStore, uiStore }
}

function renderTheme(stores: { gameDataStore: Store; buildStore: Store; uiStore: Store }) {
  return render(
    <StoreContext.Provider
      value={{
        ...stores,
        gameDataPersister: stubPersister(),
        buildPersister: stubPersister(),
        uiPersister: stubPersister(),
      }}
    >
      <ThemeProvider>
        <div>child</div>
      </ThemeProvider>
    </StoreContext.Provider>
  )
}

let mqlEmitter: ((e: MediaQueryListEvent) => void) | null = null

beforeEach(() => {
  document.head.innerHTML = ''
  document.documentElement.style.fontSize = ''
  mqlEmitter = null
  // jsdom lacks matchMedia by default — provide a mock with addEventListener.
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('dark'),
      media: query,
      onchange: null,
      addEventListener: (_e: string, listener: (e: MediaQueryListEvent) => void) => {
        mqlEmitter = listener
      },
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }))
  )
  // jsdom doesn't actually load <link> stylesheets — fire load synthetically.
  // Triggered by the load listener installed in ensureThemeLink.
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.head.innerHTML = ''
})

describe('ThemeProvider', () => {
  it('renders children', () => {
    const { getByText } = renderTheme(makeStores())
    expect(getByText('child')).toBeInTheDocument()
  })

  it('inserts a stylesheet link with the resolved theme href', () => {
    renderTheme(makeStores({ themeMode: 'dark', themeColor: 'green' }))
    const link = document.getElementById('theme-link') as HTMLLinkElement
    expect(link).toBeInTheDocument()
    expect(link.href).toContain('lara-dark-green')
  })

  it('applies uiScale to the document font size', () => {
    renderTheme(makeStores({ uiScale: 17 }))
    expect(document.documentElement.style.fontSize).toBe('17px')
  })

  it('switches the theme link href when uiStore changes', () => {
    const stores = makeStores({ themeMode: 'light', themeColor: 'blue' })
    renderTheme(stores)
    const link = document.getElementById('theme-link') as HTMLLinkElement
    expect(link.href).toContain('lara-light-blue')
    act(() => {
      stores.uiStore.setCell('uiState', 'main', 'themeColor', 'pink')
    })
    expect(link.href).toContain('lara-light-pink')
  })

  it('reapplies the theme on prefers-color-scheme change when in auto mode', () => {
    const stores = makeStores({ themeMode: 'auto', themeColor: 'blue' })
    renderTheme(stores)
    // Initial render with mocked matchMedia — dark match means lara-dark-blue.
    const link = document.getElementById('theme-link') as HTMLLinkElement
    expect(link.href).toContain('lara-dark-blue')

    // Flip the mock to "light" matches
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        media: '',
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }))
    )
    if (mqlEmitter) act(() => mqlEmitter!({ matches: false } as MediaQueryListEvent))
    // After the listener fires, the active themeMode is still 'auto', so the
    // ensureThemeLink call resolves to lara-light-blue.
    expect(link.href).toContain('lara-light-blue')
  })
})
