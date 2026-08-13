import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

const priceFormatterCache = new Map<string, Intl.NumberFormat>()
const numberFormatterCache = new Map<string, Intl.NumberFormat>()
const percentFormatterCache = new Map<string, Intl.NumberFormat>()
const durationFormatterCache = new Map<string, Intl.DurationFormat>()
const narrowDurationFormatterCache = new Map<string, Intl.DurationFormat>()
const zeroDurationFormatterCache = new Map<string, Intl.DurationFormat>()
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>()
const listFormatterCache = new Map<string, Intl.ListFormat>()
const decimalSeparatorCache = new Map<string, string>()

const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }
const DEFAULT_NUMBER_OPTIONS: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }
const DEFAULT_PERCENT_OPTIONS: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }

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

function getNarrowDurationFormatter(locale: string): Intl.DurationFormat {
  let fmt = narrowDurationFormatterCache.get(locale)
  if (!fmt) {
    fmt = new Intl.DurationFormat(locale, { style: 'narrow' })
    narrowDurationFormatterCache.set(locale, fmt)
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

function getNumberFormatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let fmt = numberFormatterCache.get(key)
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, options)
    numberFormatterCache.set(key, fmt)
  }
  return fmt
}

function getPercentFormatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let fmt = percentFormatterCache.get(key)
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, { style: 'percent', ...options })
    percentFormatterCache.set(key, fmt)
  }
  return fmt
}

function getListFormatter(locale: string): Intl.ListFormat {
  let fmt = listFormatterCache.get(locale)
  if (!fmt) {
    // 'long'/'conjunction' is the only form that stays correct across every
    // locale the datasets ship: the compact 'narrow'/'unit' variants drop the
    // separator entirely in ja, zh-Hans and ru ("A B C" or even "ABC").
    fmt = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' })
    listFormatterCache.set(locale, fmt)
  }
  return fmt
}

function getDecimalSeparator(locale: string): string {
  let sep = decimalSeparatorCache.get(locale)
  if (sep === undefined) {
    // Intl exposes no direct accessor for the separator, so read it off a
    // formatted fractional value. The fallback only fires on an engine that
    // omits the `decimal` part entirely, which no real ICU build does.
    sep =
      new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal')
        ?.value ?? '.'
    decimalSeparatorCache.set(locale, sep)
  }
  return sep
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
   * Format a non-price number for read-only display in the active locale.
   * With no options, renders a grouped integer (e.g. `1,234` in en-US,
   * `1.234` in de-DE). Pass `Intl.NumberFormatOptions` for variants:
   * `{ maximumFractionDigits: 2 }` for quantities, `{ signDisplay: 'exceptZero' }`
   * for signed deltas, etc.
   *
   * Use this for counts and quantities. Prices go through `formatPrice`,
   * percentages through `formatPercent`, and editable inputs through
   * `NumericField` (which keeps its own canonical form, see `formatPrice` doc).
   */
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string
  /**
   * Format a ratio as a localized percentage — **not** a percentage number:
   * `0.25` renders as `25%`, matching `Intl.NumberFormat`'s `style: 'percent'`.
   * A caller holding `25` must pass `25 / 100`.
   *
   * Never write the `%` in JSX or in a catalog string next to a number: sign
   * placement and spacing are locale-dependent (Turkish writes `%25`, French
   * inserts a non-breaking space), and only `Intl` gets that right. Defaults
   * to whole percentages; pass options for fractions or an explicit sign
   * (`{ signDisplay: 'exceptZero' }`).
   */
  formatPercent: (ratio: number, options?: Intl.NumberFormatOptions) => string
  /**
   * Format a craft time (in minutes) as a localized duration string. The
   * input is rounded to whole seconds, then split into minutes + seconds.
   * Zero-valued units are omitted by `Intl.DurationFormat` automatically;
   * a duration that rounds to zero falls back to "0 sec" in the active
   * locale.
   */
  formatDuration: (minutes: number) => string
  /**
   * Format an already-decomposed duration compactly — `{ days: 2, hours: 3 }`
   * renders `2d 3h` in en-US, `2 T, 3h` in de-DE, `2 д. 3 ч` in ru. Zero-valued
   * units are omitted by `Intl.DurationFormat`, so a caller can pass a fixed
   * shape and let the unset units drop out.
   *
   * This is the narrow-style counterpart to `formatDuration` (short style,
   * minutes + seconds, for craft times). Use it for compact countdowns where
   * the units come from arithmetic elsewhere — e.g. `timeUntilParts`.
   */
  formatDurationParts: (parts: { days?: number; hours?: number; minutes?: number }) => string
  /**
   * Format a Date or unix-millisecond timestamp using Intl.DateTimeFormat in
   * the active locale. Defaults to `{ dateStyle: 'medium' }`. Pass options to
   * customize (e.g. include time).
   */
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string
  /**
   * Join already-localized strings into a list phrase for the active locale —
   * `'A, B, and C'` in en-US, `'A、B和C'` in zh-Hans, `'A وB وC'` in ar. Both
   * the separator and the final conjunction are locale-dependent, so never
   * `join(', ')` a user-visible list.
   *
   * An empty array formats as `''` and a single item as itself, so callers do
   * not need to special-case either.
   */
  formatList: (values: readonly string[]) => string
  /**
   * The active locale's decimal separator — `.` in en-US, `,` in de-DE/pt-BR.
   *
   * Editable numeric inputs need this to accept back what they display:
   * `NumericField` renders committed values with this character and treats it
   * as the only decimal separator while parsing, so a user who sees `1,50`
   * can type `1,50`.
   */
  decimalSeparator: string
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
    const narrowDurationFmt = getNarrowDurationFormatter(i18n.language)
    const listFmt = getListFormatter(i18n.language)
    return {
      formatPrice: (value) => priceFmt.format(value),
      formatDuration: (minutes) => {
        const totalSeconds = Math.round(minutes * 60)
        const m = Math.floor(totalSeconds / 60)
        const s = totalSeconds % 60
        if (m === 0 && s === 0) return zeroDurationFmt.format({ seconds: 0 })
        return durationFmt.format({ minutes: m, seconds: s })
      },
      formatDurationParts: (parts) => narrowDurationFmt.format(parts),
      formatDate: (value, options) => {
        const fmt = getDateFormatter(i18n.language, options ?? DEFAULT_DATE_OPTIONS)
        return fmt.format(value)
      },
      formatNumber: (value, options) => {
        const fmt = getNumberFormatter(i18n.language, options ?? DEFAULT_NUMBER_OPTIONS)
        return fmt.format(value)
      },
      formatPercent: (ratio, options) => {
        const fmt = getPercentFormatter(i18n.language, options ?? DEFAULT_PERCENT_OPTIONS)
        return fmt.format(ratio)
      },
      formatList: (values) => listFmt.format(values),
      decimalSeparator: getDecimalSeparator(i18n.language),
    }
  }, [i18n.language])
}
