import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import {
  __resetLoaderProgress,
  markLoaderMilestone,
  snapLoaderTo100,
  type LoaderMilestone,
} from '../loader-progress'

interface ProgressEls {
  fill: HTMLDivElement
  text: HTMLDivElement
}

function installProgressEls(): ProgressEls {
  const fill = document.createElement('div')
  fill.id = 'app-loader-progress-fill'
  fill.style.transform = 'scaleX(0)'
  document.body.appendChild(fill)

  const text = document.createElement('div')
  text.id = 'app-loader-progress-text'
  text.textContent = '0%'
  document.body.appendChild(text)

  return { fill, text }
}

function readScale(fill: HTMLElement): number {
  const m = fill.style.transform.match(/scaleX\(([^)]+)\)/)
  return m ? parseFloat(m[1]) : 0
}

function readPercent(text: HTMLElement): number {
  const m = (text.textContent || '').match(/(\d+)%/)
  return m ? parseInt(m[1], 10) : 0
}

const ALL_MILESTONES: LoaderMilestone[] = [
  'bundle',
  'i18n',
  'storeProviderMounted',
  'persistersSmall',
  'persisterGameData',
  'localizedNames',
  'theme',
  'firstRender',
]

// Mirrors the production weights. Kept as a separate constant so the test
// fails loudly if the implementation drifts from what the assertions assume.
const WEIGHTS: Record<LoaderMilestone, number> = {
  bundle: 10,
  i18n: 1,
  storeProviderMounted: 2,
  persistersSmall: 4,
  persisterGameData: 70,
  localizedNames: 3,
  theme: 5,
  firstRender: 5,
}
const GAMEDATA_CAP = 0.95

// Drive the rAF loop a bunch of times so the tween can converge.
function flushFrames(n: number): void {
  for (let i = 0; i < n; i++) vi.advanceTimersByTime(16)
}

describe('loader-progress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetLoaderProgress()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.useRealTimers()
    __resetLoaderProgress()
    document.body.innerHTML = ''
  })

  it('milestone weights sum to 100', () => {
    let total = 0
    for (const id of ALL_MILESTONES) total += WEIGHTS[id]
    expect(total).toBe(100)
  })

  it('does not throw when no progress DOM exists', () => {
    expect(() => {
      markLoaderMilestone('bundle')
      flushFrames(60)
      snapLoaderTo100()
    }).not.toThrow()
  })

  it('writes scaleX and percent text after milestones fire', () => {
    const { fill, text } = installProgressEls()
    markLoaderMilestone('bundle')
    markLoaderMilestone('i18n')
    flushFrames(120)
    const expected = WEIGHTS.bundle + WEIGHTS.i18n
    expect(readScale(fill)).toBeCloseTo(expected / 100, 2)
    expect(readPercent(text)).toBe(expected)
  })

  it('milestones are idempotent', () => {
    const { fill } = installProgressEls()
    markLoaderMilestone('bundle')
    markLoaderMilestone('bundle')
    markLoaderMilestone('bundle')
    flushFrames(120)
    expect(readScale(fill)).toBeCloseTo(WEIGHTS.bundle / 100, 2)
  })

  it('snapLoaderTo100 jumps the bar to 100 immediately', () => {
    const { fill, text } = installProgressEls()
    markLoaderMilestone('bundle')
    flushFrames(2) // bar is somewhere between 0 and 5
    snapLoaderTo100()
    expect(readScale(fill)).toBe(1)
    expect(readPercent(text)).toBe(100)
  })

  it('milestones fired after snap are ignored', () => {
    const { fill, text } = installProgressEls()
    snapLoaderTo100()
    markLoaderMilestone('bundle')
    flushFrames(60)
    expect(readScale(fill)).toBe(1)
    expect(readPercent(text)).toBe(100)
  })

  it('gameData wall-clock estimate advances target but never reaches the milestone slot', () => {
    const { fill } = installProgressEls()
    markLoaderMilestone('bundle')
    markLoaderMilestone('i18n')
    markLoaderMilestone('storeProviderMounted')
    markLoaderMilestone('persistersSmall')
    const preGameDataSum =
      WEIGHTS.bundle + WEIGHTS.i18n + WEIGHTS.storeProviderMounted + WEIGHTS.persistersSmall
    const saturated = (preGameDataSum + WEIGHTS.persisterGameData * GAMEDATA_CAP) / 100
    const slotUpperBound = (preGameDataSum + WEIGHTS.persisterGameData) / 100

    flushFrames(600) // long past GAMEDATA_EXPECTED_MS — estimator should be saturated
    const scale = readScale(fill)
    expect(scale).toBeGreaterThan(preGameDataSum / 100 + 0.1) // estimator did advance
    expect(scale).toBeLessThan(slotUpperBound) // never crossed into the gameData slot
    expect(scale).toBeCloseTo(saturated, 2)
  })

  it('firing persisterGameData after estimator runs jumps the target up', () => {
    const { fill } = installProgressEls()
    markLoaderMilestone('bundle')
    markLoaderMilestone('i18n')
    markLoaderMilestone('storeProviderMounted')
    markLoaderMilestone('persistersSmall')
    flushFrames(60) // estimator partway through

    markLoaderMilestone('persisterGameData')
    flushFrames(120)
    const expected =
      WEIGHTS.bundle +
      WEIGHTS.i18n +
      WEIGHTS.storeProviderMounted +
      WEIGHTS.persistersSmall +
      WEIGHTS.persisterGameData
    expect(readScale(fill)).toBeCloseTo(expected / 100, 2)
  })

  it('all milestones fired together converge to 100', () => {
    const { fill, text } = installProgressEls()
    for (const id of ALL_MILESTONES) markLoaderMilestone(id)
    flushFrames(120)
    expect(readScale(fill)).toBe(1)
    expect(readPercent(text)).toBe(100)
  })
})
