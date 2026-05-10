import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach } from 'vitest'

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
