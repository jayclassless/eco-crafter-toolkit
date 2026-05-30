import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import PrimeReact from 'primereact/api'
import { afterEach } from 'vitest'

// Disable PrimeReact's enter/exit animations in tests. Its overlays (Dialog,
// AutoComplete, etc.) wrap react-transition-group's CSSTransition, which drives
// "entered"/"exited" state changes off setTimeout. Those timers routinely fire
// AFTER the test that mounted the overlay has finished, producing "An update to
// Transition inside a test was not wrapped in act(...)" warnings that get blamed
// on whichever unrelated test happens to be running when the timer pops. With
// `cssTransition` off, PrimeReact's CSSTransition runs its lifecycle callbacks
// synchronously inside an effect (no timers), so the state settles within act().
PrimeReact.cssTransition = false

// Initialize react-i18next globally so components that call useTranslation()
// don't emit "you will need to pass in an i18next instance" warnings during
// every component-test render. Per-file `import '@/i18n'` is no longer needed.
import '@/i18n'

// With `isolate: false` (set in vite.config.ts test config), test files share a
// jsdom document and a single fake-indexeddb instance within each worker. RTL's
// auto-cleanup unmounts React roots created by `render()`, but PrimeReact often
// portals dialogs, toasts, and overlays directly to `document.body`. Those
// portals survive RTL's cleanup and bleed into the next test, breaking queries
// like `findByRole('button', { name: /Update Now/i })` when a previous test
// left a button with the same name behind. We sweep them here.
afterEach(() => {
  // Lambda tests opt into node env via `// @vitest-environment node`; skip the
  // DOM/IDB sweep there.
  if (typeof document === 'undefined') return
  cleanup()
  // Wipe any portal/overlay nodes RTL didn't own. Don't touch <head> — PrimeReact
  // injects its CSS via module-level "has been injected" flags that aren't reset
  // when we wipe head, so subsequent tests would render unstyled.
  document.body.replaceChildren()
  // Reset the fake-indexeddb factory so databases created in one test file
  // don't leak into the next.
  globalThis.indexedDB = new IDBFactory()
})
