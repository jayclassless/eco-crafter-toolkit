import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'
import 'primeflex/primeflex.css'
import './globals.css'
import './i18n'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { markLoaderMilestone } from './lib/loader-progress'

// Both marks land here because ES modules hoist all imports above the body —
// so by the time this code runs, every CSS import and i18n.init() has already
// executed. Splitting them into two milestones keeps the weights independent
// in case i18n later moves to an async backend.
markLoaderMilestone('bundle')
markLoaderMilestone('i18n')

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root not found')

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
)
