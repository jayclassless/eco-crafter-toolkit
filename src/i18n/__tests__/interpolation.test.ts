import i18n from 'i18next'
import { describe, expect, it } from 'vitest'

import '@/i18n'

import enUS from '../messages/en-US.json'

/** Every leaf string in the catalog, paired with its dotted key path. */
function catalogEntries(node: unknown, path: string[] = []): [string, string][] {
  if (typeof node === 'string') return [[path.join('.'), node]]
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => catalogEntries(v, [...path, k]))
  }
  return []
}

const ENTRIES = catalogEntries(enUS)

describe('number interpolation', () => {
  it('groups thousands in the active locale', () => {
    expect(i18n.t('priceCalculator.products.title', { count: 1234 })).toBe('Products (1,234)')
    expect(i18n.t('priceCalculator.materials.title', { count: 52100 })).toBe('Materials (52,100)')
    expect(i18n.t('biomeResources.depthRange', { min: 5, max: 1000 })).toBe('5–1,000 deep')
  })

  it('still selects the right plural form alongside formatting', () => {
    expect(i18n.t('priceCalculator.config.stars', { count: 1 })).toBe(
      '1 Star needed for this build'
    )
    expect(i18n.t('priceCalculator.config.stars', { count: 2 })).toBe(
      '2 Stars needed for this build'
    )
    expect(i18n.t('priceCalculator.config.stars', { count: 12000 })).toBe(
      '12,000 Stars needed for this build'
    )
  })

  it('honours per-placeholder format options', () => {
    // `yield` shows a fractional per-source amount, capped at 2 decimals.
    expect(
      i18n.t('settings.gatheringCalculator.yield', {
        qty: 1234.5678,
        name: 'Log',
        source: 'tree',
      })
    ).toBe('1,234.57 Log per tree')
  })

  it('leaves pre-formatted string arguments untouched', () => {
    // These call sites format via useLocalization before interpolating, so the
    // placeholders must NOT carry a number format — Intl would yield NaN.
    expect(
      i18n.t('settings.datasets.storageUsageDetail', {
        used: '1,024',
        total: '4,096',
        percent: 25,
      })
    ).toBe('1,024 MB of ~4,096 MB used (25%)')
    expect(
      i18n.t('settings.gatheringCalculator.pricePerUnit', { price: '1,234.50', name: 'Log' })
    ).toBe('1,234.50 per Log')
  })

  it('does not format identifiers that only look numeric', () => {
    // A build number and a dataset revision are labels, not quantities —
    // "revision 1,024" would be wrong.
    expect(i18n.t('build.selector.defaultName', { number: 1200 })).toBe('Build 1200')
    expect(i18n.t('settings.datasets.updateSuccessDetail', { name: 'Eco 14', rev: 1024 })).toBe(
      'Eco 14 updated to revision 1024.'
    )
  })
})

describe('catalog conventions', () => {
  // `count` is i18next's plural selector and is therefore always a raw number;
  // a bare `{count}` renders unformatted and silently loses grouping.
  it('never interpolates a bare {count} or {qty}', () => {
    const offenders = ENTRIES.filter(([, text]) => /\{(count|qty)\}/.test(text)).map(([key]) => key)
    expect(offenders).toEqual([])
  })

  it('only uses format names the built-in i18next formatter provides', () => {
    const allowed = new Set(['number', 'currency', 'datetime', 'relativetime', 'list'])
    const offenders: string[] = []
    for (const [key, text] of ENTRIES) {
      for (const match of text.matchAll(/\{[^{}]*?,\s*([a-zA-Z]+)/g)) {
        if (!allowed.has(match[1])) offenders.push(`${key}: ${match[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
