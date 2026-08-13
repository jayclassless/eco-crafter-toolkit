import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { localeProvider } from '@/i18n/__tests__/locale-provider'
import '@/i18n'

import { useLocalization } from '../use-localization'

describe('useLocalization', () => {
  describe('formatPrice', () => {
    it('formats with two fraction digits', () => {
      const { result } = renderHook(() => useLocalization())
      expect(result.current.formatPrice(0)).toBe('0.00')
      expect(result.current.formatPrice(1.5)).toBe('1.50')
      expect(result.current.formatPrice(1.234)).toBe('1.23')
      // Banker's vs round-half-up varies by engine — accept either.
      expect(result.current.formatPrice(1.235)).toMatch(/^1\.2[34]$/)
    })

    it('uses the active i18next locale (en-US groups thousands with comma)', () => {
      const { result } = renderHook(() => useLocalization())
      expect(result.current.formatPrice(1234.5)).toBe('1,234.50')
      expect(result.current.formatPrice(1000000)).toBe('1,000,000.00')
    })

    it('formats negative values', () => {
      const { result } = renderHook(() => useLocalization())
      expect(result.current.formatPrice(-1.5)).toBe('-1.50')
    })
  })

  describe('formatNumber', () => {
    it('renders a grouped integer by default', () => {
      const { result } = renderHook(() => useLocalization())
      expect(result.current.formatNumber(0)).toBe('0')
      expect(result.current.formatNumber(42)).toBe('42')
      expect(result.current.formatNumber(1234)).toBe('1,234')
      expect(result.current.formatNumber(1000000)).toBe('1,000,000')
    })

    it('rounds to integer when given a fractional value with default options', () => {
      const { result } = renderHook(() => useLocalization())
      expect(result.current.formatNumber(1234.7)).toBe('1,235')
    })

    it('respects maximumFractionDigits and trims trailing zeros', () => {
      const { result } = renderHook(() => useLocalization())
      const f = (value: number) => result.current.formatNumber(value, { maximumFractionDigits: 2 })
      expect(f(2)).toBe('2')
      expect(f(1.5)).toBe('1.5')
      expect(f(1.234)).toBe('1.23')
    })

    it('honors signDisplay: exceptZero', () => {
      const { result } = renderHook(() => useLocalization())
      const f = (value: number) => result.current.formatNumber(value, { signDisplay: 'exceptZero' })
      expect(f(25)).toBe('+25')
      expect(f(-10)).toBe('-10')
      expect(f(0)).toBe('0')
    })

    it('formats negative values with grouping', () => {
      const { result } = renderHook(() => useLocalization())
      expect(result.current.formatNumber(-1234)).toBe('-1,234')
    })
  })

  describe('formatDuration', () => {
    it('renders both minutes and seconds when both are non-zero', () => {
      const { result } = renderHook(() => useLocalization())
      expect(result.current.formatDuration(5.5)).toBe('5 min, 30 sec')
    })

    it('omits zero units', () => {
      const { result } = renderHook(() => useLocalization())
      expect(result.current.formatDuration(5)).toBe('5 min')
      expect(result.current.formatDuration(0.5)).toBe('30 sec')
    })

    it('rounds the input to whole seconds', () => {
      const { result } = renderHook(() => useLocalization())
      // 0.0125 min = 0.75 sec → rounds to 1 sec
      expect(result.current.formatDuration(0.0125)).toBe('1 sec')
      // 7.508 min = 7 min, 30.48 sec → rounds to 7 min, 30 sec
      expect(result.current.formatDuration(7.508)).toBe('7 min, 30 sec')
    })

    it('falls back to "0 sec" when the duration rounds to zero', () => {
      const { result } = renderHook(() => useLocalization())
      expect(result.current.formatDuration(0)).toBe('0 sec')
    })
  })

  describe('formatDurationParts', () => {
    it('renders compact d/h/m in en-US', () => {
      const { result } = renderHook(() => useLocalization())
      expect(result.current.formatDurationParts({ days: 2, hours: 3 })).toBe('2d 3h')
      expect(result.current.formatDurationParts({ hours: 5, minutes: 12 })).toBe('5h 12m')
      expect(result.current.formatDurationParts({ minutes: 8 })).toBe('8m')
    })

    it('omits zero-valued units, so callers can pass a fixed shape', () => {
      const { result } = renderHook(() => useLocalization())
      expect(result.current.formatDurationParts({ days: 2, hours: 0, minutes: 5 })).toBe('2d 5m')
      expect(result.current.formatDurationParts({ days: 0, hours: 0, minutes: 8 })).toBe('8m')
    })

    it('translates the unit abbreviations', () => {
      // The point of the fix: d/h/m are English, and other locales neither
      // spell nor space them the same way.
      const de = renderHook(() => useLocalization(), { wrapper: localeProvider('de-DE') })
      expect(de.result.current.formatDurationParts({ hours: 5, minutes: 12 })).toBe('5h, 12 Min.')
      const ru = renderHook(() => useLocalization(), { wrapper: localeProvider('ru') })
      expect(ru.result.current.formatDurationParts({ minutes: 8 })).toBe('8 мин')
    })
  })

  describe('formatDate', () => {
    it('formats a Date with the default medium style in en-US', () => {
      const { result } = renderHook(() => useLocalization())
      // 2026-04-25T12:00:00Z, formatted as 'Apr 25, 2026' (en-US medium)
      const date = new Date(Date.UTC(2026, 3, 25, 12, 0, 0))
      expect(result.current.formatDate(date)).toBe('Apr 25, 2026')
    })

    it('accepts a unix-millisecond timestamp', () => {
      const { result } = renderHook(() => useLocalization())
      const ms = Date.UTC(2026, 3, 25, 12, 0, 0)
      expect(result.current.formatDate(ms)).toBe('Apr 25, 2026')
    })

    it('honors custom options', () => {
      const { result } = renderHook(() => useLocalization())
      const date = new Date(Date.UTC(2026, 3, 25, 12, 0, 0))
      const formatted = result.current.formatDate(date, { year: 'numeric', month: 'long' })
      expect(formatted).toBe('April 2026')
    })
  })

  describe('formatPercent', () => {
    it('takes a ratio and renders whole percentages by default', () => {
      const { result } = renderHook(() => useLocalization())
      expect(result.current.formatPercent(0.25)).toBe('25%')
      expect(result.current.formatPercent(1)).toBe('100%')
      expect(result.current.formatPercent(0)).toBe('0%')
      // The default rounds; fractions need explicit options.
      expect(result.current.formatPercent(0.075)).toBe('8%')
    })

    it('honors fraction digits and signDisplay', () => {
      const { result } = renderHook(() => useLocalization())
      const f = (ratio: number) =>
        result.current.formatPercent(ratio, {
          signDisplay: 'exceptZero',
          maximumFractionDigits: 1,
        })
      expect(f(0.25)).toBe('+25%')
      expect(f(-0.075)).toBe('-7.5%')
      expect(f(0)).toBe('0%')
    })

    it('places the percent sign per locale', () => {
      // The whole point of routing through Intl: Turkish prefixes the sign and
      // French separates it from the number with a non-breaking space.
      const tr = renderHook(() => useLocalization(), { wrapper: localeProvider('tr') })
      expect(tr.result.current.formatPercent(0.25)).toBe('%25')
      const fr = renderHook(() => useLocalization(), { wrapper: localeProvider('fr-FR') })
      // The exact separator codepoint varies by ICU build (U+202F vs U+00A0),
      // so match on whitespace rather than pinning it.
      expect(fr.result.current.formatPercent(0.25)).toMatch(/^25\s%$/u)
    })
  })

  describe('formatList', () => {
    it('joins with the en-US conjunction form', () => {
      const { result } = renderHook(() => useLocalization())
      expect(result.current.formatList(['Iron Ore', 'Copper Ore', 'Gold Ore'])).toBe(
        'Iron Ore, Copper Ore, and Gold Ore'
      )
      expect(result.current.formatList(['Iron Ore', 'Copper Ore'])).toBe('Iron Ore and Copper Ore')
    })

    it('handles empty and single-item lists without special-casing', () => {
      const { result } = renderHook(() => useLocalization())
      expect(result.current.formatList([])).toBe('')
      expect(result.current.formatList(['Iron Ore'])).toBe('Iron Ore')
    })

    it('uses locale-specific separators and conjunctions', () => {
      const cases: Array<[string, string]> = [
        ['de-DE', 'A, B und C'],
        ['fr-FR', 'A, B et C'],
        ['ja', 'A、B、C'],
        ['zh-Hans', 'A、B和C'],
      ]
      for (const [locale, expected] of cases) {
        const { result } = renderHook(() => useLocalization(), { wrapper: localeProvider(locale) })
        expect(result.current.formatList(['A', 'B', 'C'])).toBe(expected)
      }
    })
  })

  describe('compare', () => {
    it('collates in the active language', () => {
      const en = renderHook(() => useLocalization())
      expect(['Öl', 'Zebra'].sort(en.result.current.compare)).toEqual(['Öl', 'Zebra'])

      // Swedish sorts Ö after Z, so the same two names swap.
      const sv = renderHook(() => useLocalization(), { wrapper: localeProvider('sv') })
      expect(['Öl', 'Zebra'].sort(sv.result.current.compare)).toEqual(['Zebra', 'Öl'])
    })

    it('hands out one shared collator rather than a per-call closure', () => {
      const a = renderHook(() => useLocalization())
      const b = renderHook(() => useLocalization())
      expect(a.result.current.compare).toBe(b.result.current.compare)
    })
  })

  describe('decimalSeparator', () => {
    it('is "." under the default en-US locale', () => {
      const { result } = renderHook(() => useLocalization())
      expect(result.current.decimalSeparator).toBe('.')
    })

    it('is "," for locales that use a comma', () => {
      for (const locale of ['de-DE', 'pt-BR', 'pt-PT', 'nb-NO', 'fr-FR']) {
        const { result } = renderHook(() => useLocalization(), { wrapper: localeProvider(locale) })
        expect(result.current.decimalSeparator).toBe(',')
      }
    })

    it('agrees with what formatPrice actually emits', () => {
      // The contract NumericField relies on: whatever the app displays as a
      // price must be typeable back into the field.
      for (const locale of ['en-US', 'de-DE', 'pt-BR', 'nb-NO']) {
        const { result } = renderHook(() => useLocalization(), { wrapper: localeProvider(locale) })
        const { decimalSeparator, formatPrice } = result.current
        expect(formatPrice(1.5)).toContain(`1${decimalSeparator}50`)
      }
    })
  })

  it('returns a stable object across renders when the language is unchanged', () => {
    const { result, rerender } = renderHook(() => useLocalization())
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})
