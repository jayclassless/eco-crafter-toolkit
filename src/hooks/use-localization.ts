import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

const priceFormatterCache = new Map<string, Intl.NumberFormat>()
const durationFormatterCache = new Map<string, Intl.DurationFormat>()
const zeroDurationFormatterCache = new Map<string, Intl.DurationFormat>()
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>()

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }

function getPriceFormatter(locale: string): Intl.NumberFormat {
  let fmt = priceFormatterCache.get(locale)
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    priceFormatterCache.set(locale, fmt)
  }
  return fmt
}

function getDurationFormatter(locale: string): Intl.DurationFormat {
  let fmt = durationFormatterCache.get(locale)
  if (!fmt) {
    fmt = new Intl.DurationFormat(locale, { style: 'short' })
    durationFormatterCache.set(locale, fmt)
  }
  return fmt
}

function getDateFormatter(
  locale: string,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let fmt = dateFormatterCache.get(key)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, options)
    dateFormatterCache.set(key, fmt)
  }
  return fmt
}

function getZeroDurationFormatter(locale: string): Intl.DurationFormat {
  let fmt = zeroDurationFormatterCache.get(locale)
  if (!fmt) {
    // `secondsDisplay: 'always'` so that an all-zero duration still renders
    // (the default 'auto' display would omit the zero and return '').
    fmt = new Intl.DurationFormat(locale, { style: 'short', secondsDisplay: 'always' })
    zeroDurationFormatterCache.set(locale, fmt)
  }
  return fmt
}

interface Localization {
  /**
   * Format a numeric price for read-only display. Always renders exactly 2
   * fraction digits in the active locale.
   *
   * Editable inputs intentionally do not use this — `NumericField` keeps its
   * own canonical (locale-agnostic) form so users can type partial values like
   * ".3" without premature rounding/grouping.
   */
  formatPrice: (value: number) => string
  /**
   * Format a craft time (in minutes) as a localized duration string. The
   * input is rounded to whole seconds, then split into minutes + seconds.
   * Zero-valued units are omitted by `Intl.DurationFormat` automatically;
   * a duration that rounds to zero falls back to "0 sec" in the active
   * locale.
   */
  formatDuration: (minutes: number) => string
  /**
   * Format a Date or unix-millisecond timestamp using Intl.DateTimeFormat in
   * the active locale. Defaults to `{ dateStyle: 'medium' }`. Pass options to
   * customize (e.g. include time).
   */
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string
}

/**
 * Locale-aware formatters keyed to the language i18next is currently
 * configured for. The returned object is stable across renders unless the
 * active language changes.
 */
export function useLocalization(): Localization {
  const { i18n } = useTranslation()
  return useMemo(() => {
    const priceFmt = getPriceFormatter(i18n.language)
    const durationFmt = getDurationFormatter(i18n.language)
    const zeroDurationFmt = getZeroDurationFormatter(i18n.language)
    return {
      formatPrice: (value) => priceFmt.format(value),
      formatDuration: (minutes) => {
        const totalSeconds = Math.round(minutes * 60)
        const m = Math.floor(totalSeconds / 60)
        const s = totalSeconds % 60
        if (m === 0 && s === 0) return zeroDurationFmt.format({ seconds: 0 })
        return durationFmt.format({ minutes: m, seconds: s })
      },
      formatDate: (value, options) => {
        const fmt = getDateFormatter(i18n.language, options ?? DEFAULT_DATE_OPTIONS)
        return fmt.format(value)
      },
    }
  }, [i18n.language])
}
