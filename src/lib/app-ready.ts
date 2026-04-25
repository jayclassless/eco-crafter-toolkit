/**
 * Coordinates the hand-off from the static loader in `index.html` to the
 * live React app. The loader stays visible until three independent gates
 * have fired:
 *
 *   - stores:       tinybase persisters finished async init
 *   - theme:        PrimeReact theme <link> has loaded its CSS
 *   - firstRender:  AppInner mounted real content (not a null return)
 *
 * A 5 second watchdog force-reveals the app if any gate fails to fire, so
 * a broken theme fetch or store crash can't leave the user stuck on the
 * loading screen forever.
 */

import { snapLoaderTo100 } from './loader-progress'

const WATCHDOG_MS = 10000
const FADE_MS = 150

type Gate = 'stores' | 'theme' | 'firstRender'

const gates: Record<Gate, boolean> = {
  stores: false,
  theme: false,
  firstRender: false,
}

let watchdog: ReturnType<typeof setTimeout> | null = null
let revealed = false

function ensureWatchdog(): void {
  if (watchdog !== null || revealed) return
  watchdog = setTimeout(() => {
    if (revealed) return
    const pending = (Object.keys(gates) as Gate[]).filter((g) => !gates[g])
    console.warn(
      `[app-ready] watchdog fired after ${WATCHDOG_MS}ms; force-revealing app. Pending gates: ${pending.join(', ') || 'none'}`
    )
    reveal()
  }, WATCHDOG_MS)
}

function markGate(gate: Gate): void {
  if (revealed || gates[gate]) return
  gates[gate] = true
  ensureWatchdog()
  if (gates.stores && gates.theme && gates.firstRender) {
    reveal()
  }
}

function reveal(): void {
  if (revealed) return
  revealed = true
  if (watchdog !== null) {
    clearTimeout(watchdog)
    watchdog = null
  }
  // Snap the progress bar to 100 before the fade kicks in. Covers both the
  // happy path (all gates fired) and the watchdog path (some gate stalled,
  // bar may still be mid-tween).
  snapLoaderTo100()
  if (typeof document === 'undefined') return
  const loader = document.getElementById('app-loader')
  if (!loader) return
  loader.classList.add('hidden')
  const remove = () => loader.remove()
  loader.addEventListener('transitionend', remove, { once: true })
  // Safety: if transitionend doesn't fire (e.g. element is already hidden
  // via CSS, or transitions are disabled), remove after the fade duration.
  setTimeout(remove, FADE_MS + 50)
}

export function markStoresReady(): void {
  markGate('stores')
}

export function markThemeReady(): void {
  markGate('theme')
}

export function markFirstRenderReady(): void {
  markGate('firstRender')
}

/**
 * Test-only: reset all module state between tests.
 */
export function __resetAppReady(): void {
  gates.stores = false
  gates.theme = false
  gates.firstRender = false
  if (watchdog !== null) {
    clearTimeout(watchdog)
    watchdog = null
  }
  revealed = false
}
