import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'
import 'primeflex/primeflex.css'
import './globals.css'
import './i18n'
import * as Sentry from '@sentry/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './sentry'
import { App } from './App'
import { initAppReady } from './lib/app-ready'
import { markLoaderMilestone } from './lib/loader-progress'

// Arm the splash watchdog before anything can throw. If React fails to mount
// (so no app-ready gate ever fires), this still force-reveals the app instead
// of leaving the user stuck on the loading screen forever.
initAppReady()

// Both marks land here because ES modules hoist all imports above the body —
// so by the time this code runs, every CSS import and i18n.init() has already
// executed. Splitting them into two milestones keeps the weights independent
// in case i18n later moves to an async backend.
markLoaderMilestone('bundle')
markLoaderMilestone('i18n')

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root not found')

createRoot(rootEl, {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
}).render(
  <StrictMode>
    <App />
  </StrictMode>
)
