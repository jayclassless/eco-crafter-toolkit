import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
// Initialize react-i18next globally so components that call useTranslation()
// don't emit "you will need to pass in an i18next instance" warnings during
// every component-test render. Per-file `import '@/i18n'` is no longer needed.
import '@/i18n'
