import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import { defaultLocale, locales } from './config'
import enUS from './messages/en-US.json'

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      [defaultLocale]: { translation: enUS },
    },
    fallbackLng: defaultLocale,
    supportedLngs: [...locales],
    interpolation: {
      escapeValue: false,
      prefix: '{',
      suffix: '}',
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  })
