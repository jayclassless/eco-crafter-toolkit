import { describe, expect, it } from 'vitest'

import { compareKeys, getCompare } from '../collator'

describe('getCompare', () => {
  it('collates by the requested locale, not the browser default', () => {
    // Swedish sorts Ä and Ö after Z; German (and English) sort them with A/O.
    // This is the whole point of passing a locale: with a bare localeCompare
    // the order followed the browser, so a Swedish reader saw German order.
    const names = ['Öl', 'Zebra', 'Apple', 'Ärt']
    expect([...names].sort(getCompare('sv'))).toEqual(['Apple', 'Zebra', 'Ärt', 'Öl'])
    expect([...names].sort(getCompare('de-DE'))).toEqual(['Apple', 'Ärt', 'Öl', 'Zebra'])
  })

  it('sorts embedded numbers by value', () => {
    expect(['Upgrade 10', 'Upgrade 2'].sort(getCompare('en-US'))).toEqual([
      'Upgrade 2',
      'Upgrade 10',
    ])
  })

  it('returns the same bound comparator for a repeated locale', () => {
    // Callers hand this to `sort` over thousands of rows and pass it through
    // memo dependency arrays, so a fresh function per call would both re-resolve
    // the collator and invalidate every memo holding it.
    expect(getCompare('en-US')).toBe(getCompare('en-US'))
    expect(getCompare('sv')).not.toBe(getCompare('en-US'))
  })
})

describe('compareKeys', () => {
  it('orders by code unit, independent of any locale', () => {
    const ids = ['b2', 'a10', 'a2', 'B1']
    // Uppercase sorts before lowercase (code-unit order) — deliberately NOT the
    // locale-aware ordering, since these values are never displayed.
    expect([...ids].sort(compareKeys)).toEqual(['B1', 'a10', 'a2', 'b2'])
  })

  it('reports equality for identical keys', () => {
    expect(compareKeys('same', 'same')).toBe(0)
  })
})
