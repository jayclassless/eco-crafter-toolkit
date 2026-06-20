import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { createUIStore } from '@/stores/ui-store'

import { useTrackActiveBuild } from '../use-track-active-build'

describe('useTrackActiveBuild', () => {
  let uiStore: ReturnType<typeof createUIStore>

  beforeEach(() => {
    uiStore = createUIStore()
  })

  it('records active ids and per-dataset last-viewed build when valid', () => {
    renderHook(() => useTrackActiveBuild(uiStore, 'ds1', 'b1', true))

    expect(uiStore.getCell('uiState', 'main', 'activeDatasetId')).toBe('ds1')
    expect(uiStore.getCell('uiState', 'main', 'activeBuildId')).toBe('b1')
    expect(uiStore.getCell('lastViewedBuilds', 'ds1', 'buildId')).toBe('b1')
  })

  it('writes nothing when the build is invalid', () => {
    renderHook(() => useTrackActiveBuild(uiStore, 'ds1', 'b1', false))

    expect(uiStore.getCell('uiState', 'main', 'activeDatasetId')).toBe('')
    expect(uiStore.getCell('uiState', 'main', 'activeBuildId')).toBe('')
    expect(uiStore.hasRow('lastViewedBuilds', 'ds1')).toBe(false)
  })

  it('tracks last-viewed build per dataset across navigation', () => {
    const { rerender } = renderHook(
      ({ ds, b }: { ds: string; b: string }) => useTrackActiveBuild(uiStore, ds, b, true),
      { initialProps: { ds: 'ds1', b: 'b1' } }
    )
    rerender({ ds: 'ds2', b: 'b9' })

    expect(uiStore.getCell('lastViewedBuilds', 'ds1', 'buildId')).toBe('b1')
    expect(uiStore.getCell('lastViewedBuilds', 'ds2', 'buildId')).toBe('b9')
  })
})
