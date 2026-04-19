import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'
import 'primeflex/primeflex.css'
import './globals.css'
import './i18n'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root not found')

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
)
