import { createInstance } from 'i18next'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'

import enUS from '../messages/en-US.json'

/**
 * Builds a render wrapper backed by an i18next instance pinned to `locale`,
 * for exercising locale-derived behaviour (decimal separators, date order,
 * digit grouping) against locales the app's `supportedLngs` does not yet allow.
 *
 * The en-US catalog is loaded under whatever locale is requested, so copy stays
 * English while `Intl` formatting follows `locale`. That is the point: these
 * tests assert formatting, not translated wording.
 *
 * Deliberately does NOT `.use(initReactI18next)` — that registers the instance
 * as react-i18next's *global* default, which leaks the locale into every later
 * test in the file that renders without a wrapper. `I18nextProvider` supplies
 * the instance through context, which is all `useTranslation` reads.
 */
export function localeProvider(locale: string) {
  const instance = createInstance()
  void instance.init({
    lng: locale,
    resources: { [locale]: { translation: enUS } },
    // Init is synchronous here: resources are inline, with no backend to await.
    interpolation: { escapeValue: false, prefix: '{', suffix: '}' },
  })
  return ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={instance}>{children}</I18nextProvider>
  )
}
