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
