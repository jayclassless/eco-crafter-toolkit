import { describe, it, expect } from 'vitest'

import { applyMargin } from '../margins'

describe('applyMargin', () => {
  describe('markup', () => {
    it('applies markup percentage to cost price', () => {
      expect(applyMargin(100, 20, 'markup')).toBeCloseTo(120)
    })
    it('handles zero margin', () => {
      expect(applyMargin(100, 0, 'markup')).toBeCloseTo(100)
    })
    it('handles zero cost', () => {
      expect(applyMargin(0, 20, 'markup')).toBeCloseTo(0)
    })
    it('handles 100% margin', () => {
      expect(applyMargin(50, 100, 'markup')).toBeCloseTo(100)
    })
  })

  describe('grossMargin', () => {
    it('applies gross margin percentage to cost price', () => {
      expect(applyMargin(100, 20, 'grossMargin')).toBeCloseTo(125)
    })
    it('handles zero margin', () => {
      expect(applyMargin(100, 0, 'grossMargin')).toBeCloseTo(100)
    })
    it('handles zero cost', () => {
      expect(applyMargin(0, 20, 'grossMargin')).toBeCloseTo(0)
    })
    it('returns Infinity for 100% gross margin', () => {
      expect(applyMargin(100, 100, 'grossMargin')).toBe(Infinity)
    })
    it('handles margin > 100% (negative divisor)', () => {
      expect(applyMargin(100, 150, 'grossMargin')).toBe(Infinity)
    })
  })
})
