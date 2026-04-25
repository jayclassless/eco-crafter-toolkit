import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

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

  it('returns a stable object across renders when the language is unchanged', () => {
    const { result, rerender } = renderHook(() => useLocalization())
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})
