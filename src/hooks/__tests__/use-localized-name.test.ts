import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { __resetLocalizedNameStore, saveLocalizedNames } from '@/stores/localized-name-store'

import { useLocalizedName } from '../use-localized-name'

async function deleteDb(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('eco-crafter-localized-names')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  await __resetLocalizedNameStore()
  await deleteDb()
})

describe('useLocalizedName', () => {
  it('returns the name for the requested locale once loaded', async () => {
    await saveLocalizedNames('ds1', [
      { id: '1', entityType: 'item', entityId: 'iron', locale: 'en-US', name: 'Iron' },
      { id: '2', entityType: 'item', entityId: 'iron', locale: 'fr-FR', name: 'Fer' },
    ])

    const { result } = renderHook(() => useLocalizedName('ds1', 'fr-FR'))
    await waitFor(() => expect(result.current.ready).toBe(true))

    expect(result.current.getName('item', 'iron')).toBe('Fer')
  })

  it('defaults to en-US when no locale provided', async () => {
    await saveLocalizedNames('ds1', [
      { id: '1', entityType: 'item', entityId: 'iron', locale: 'en-US', name: 'Iron' },
    ])

    const { result } = renderHook(() => useLocalizedName('ds1'))
    await waitFor(() => expect(result.current.ready).toBe(true))

    expect(result.current.getName('item', 'iron')).toBe('Iron')
  })

  it('falls back to en-US when the requested locale is missing', async () => {
    await saveLocalizedNames('ds1', [
      { id: '1', entityType: 'item', entityId: 'iron', locale: 'en-US', name: 'Iron' },
    ])

    const { result } = renderHook(() => useLocalizedName('ds1', 'de-DE'))
    await waitFor(() => expect(result.current.ready).toBe(true))

    expect(result.current.getName('item', 'iron')).toBe('Iron')
  })

  it('returns empty string for unknown entities', async () => {
    await saveLocalizedNames('ds1', [
      { id: '1', entityType: 'item', entityId: 'iron', locale: 'en-US', name: 'Iron' },
    ])

    const { result } = renderHook(() => useLocalizedName('ds1'))
    await waitFor(() => expect(result.current.ready).toBe(true))

    expect(result.current.getName('item', 'unknown')).toBe('')
  })

  it('returns empty string while the index is still loading', () => {
    const { result } = renderHook(() => useLocalizedName('ds1'))
    expect(result.current.ready).toBe(false)
    expect(result.current.getName('item', 'iron')).toBe('')
  })

  it('re-renders once the index resolves', async () => {
    await saveLocalizedNames('ds1', [
      { id: '1', entityType: 'item', entityId: 'iron', locale: 'en-US', name: 'Iron' },
    ])

    const { result } = renderHook(() => useLocalizedName('ds1'))

    // initial render: not ready, empty
    expect(result.current.getName('item', 'iron')).toBe('')

    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.getName('item', 'iron')).toBe('Iron')
  })

  it('returns empty and not ready when given no datasetId', async () => {
    const { result } = renderHook(() => useLocalizedName(''))
    expect(result.current.ready).toBe(false)
    expect(result.current.getName('item', 'iron')).toBe('')
  })
})
