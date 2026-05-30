import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import {
  __resetAppReady,
  initAppReady,
  markFirstRenderReady,
  markStoresReady,
  markThemeReady,
} from '../app-ready'

function installLoader(): HTMLDivElement {
  const loader = document.createElement('div')
  loader.id = 'app-loader'
  document.body.appendChild(loader)
  return loader
}

function dispatchTransitionEnd(el: HTMLElement): void {
  el.dispatchEvent(new Event('transitionend'))
}

describe('app-ready', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetAppReady()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.useRealTimers()
    __resetAppReady()
    document.body.innerHTML = ''
  })

  it('does not remove the loader until all three gates fire', () => {
    const loader = installLoader()

    markStoresReady()
    expect(loader.classList.contains('hidden')).toBe(false)
    expect(document.getElementById('app-loader')).toBe(loader)

    markThemeReady()
    expect(loader.classList.contains('hidden')).toBe(false)
    expect(document.getElementById('app-loader')).toBe(loader)

    markFirstRenderReady()
    expect(loader.classList.contains('hidden')).toBe(true)
    // Not removed yet — waiting on transitionend or fallback timeout
    expect(document.getElementById('app-loader')).toBe(loader)

    dispatchTransitionEnd(loader)
    expect(document.getElementById('app-loader')).toBeNull()
  })

  it('removes loader via fallback timeout if transitionend never fires', () => {
    const loader = installLoader()

    markStoresReady()
    markThemeReady()
    markFirstRenderReady()
    expect(loader.classList.contains('hidden')).toBe(true)
    expect(document.getElementById('app-loader')).toBe(loader)

    vi.advanceTimersByTime(200)
    expect(document.getElementById('app-loader')).toBeNull()
  })

  it('marker functions are idempotent', () => {
    const loader = installLoader()

    markStoresReady()
    markStoresReady()
    markThemeReady()
    markThemeReady()
    // Still not all three — loader stays
    expect(loader.classList.contains('hidden')).toBe(false)

    markFirstRenderReady()
    markFirstRenderReady()
    expect(loader.classList.contains('hidden')).toBe(true)
  })

  it('does not throw when called with no loader in the DOM', () => {
    expect(() => {
      markStoresReady()
      markThemeReady()
      markFirstRenderReady()
    }).not.toThrow()
  })

  it('watchdog force-reveals after the watchdog timeout if gates never all fire', () => {
    const loader = installLoader()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    markStoresReady()
    // theme + firstRender never fire
    vi.advanceTimersByTime(9999)
    expect(loader.classList.contains('hidden')).toBe(false)

    vi.advanceTimersByTime(1)
    expect(loader.classList.contains('hidden')).toBe(true)
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy.mock.calls[0][0]).toContain('theme')
    expect(warnSpy.mock.calls[0][0]).toContain('firstRender')
    expect(warnSpy.mock.calls[0][0]).not.toContain('stores')

    warnSpy.mockRestore()
  })

  it('initAppReady arms the watchdog so a crash before any gate still reveals', () => {
    const loader = installLoader()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // No gate ever fires (e.g. React failed to mount). Before initAppReady the
    // watchdog was only armed from markGate, so nothing would have revealed.
    initAppReady()
    vi.advanceTimersByTime(9999)
    expect(loader.classList.contains('hidden')).toBe(false)

    vi.advanceTimersByTime(1)
    expect(loader.classList.contains('hidden')).toBe(true)
    expect(warnSpy).toHaveBeenCalledOnce()
    const msg = warnSpy.mock.calls[0][0]
    expect(msg).toContain('stores')
    expect(msg).toContain('theme')
    expect(msg).toContain('firstRender')

    warnSpy.mockRestore()
  })

  it('initAppReady is idempotent and does not re-arm a second watchdog', () => {
    installLoader()
    initAppReady()
    initAppReady()
    // A single watchdog reveals once; advancing past it must not throw or
    // schedule a second reveal.
    expect(() => vi.advanceTimersByTime(10000)).not.toThrow()
  })

  it('does not call reveal twice if gates fire after watchdog', () => {
    const loader = installLoader()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    markStoresReady()
    vi.advanceTimersByTime(10000)
    expect(loader.classList.contains('hidden')).toBe(true)

    // Late arrivals should be no-ops
    expect(() => {
      markThemeReady()
      markFirstRenderReady()
    }).not.toThrow()

    warnSpy.mockRestore()
  })
})
