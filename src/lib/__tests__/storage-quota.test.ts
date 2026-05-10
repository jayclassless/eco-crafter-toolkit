import { afterEach, describe, expect, it, vi } from 'vitest'

import { estimateStorage, isQuotaExceeded, StorageQuotaError, toStoreError } from '../storage-quota'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isQuotaExceeded', () => {
  it('returns true for QuotaExceededError DOMException', () => {
    const err = new DOMException('over budget', 'QuotaExceededError')
    expect(isQuotaExceeded(err)).toBe(true)
  })

  it('returns true for our own StorageQuotaError class', () => {
    expect(isQuotaExceeded(new StorageQuotaError())).toBe(true)
  })

  it('returns false for unrelated DOMExceptions', () => {
    expect(isQuotaExceeded(new DOMException('boom', 'AbortError'))).toBe(false)
  })

  it('returns false for plain errors', () => {
    expect(isQuotaExceeded(new Error('something else'))).toBe(false)
    expect(isQuotaExceeded(null)).toBe(false)
    expect(isQuotaExceeded(undefined)).toBe(false)
    expect(isQuotaExceeded('string')).toBe(false)
  })
})

describe('toStoreError', () => {
  it('upgrades a QuotaExceededError DOMException to StorageQuotaError', () => {
    const err = new DOMException('full', 'QuotaExceededError')
    const wrapped = toStoreError(err)
    expect(wrapped).toBeInstanceOf(StorageQuotaError)
    expect((wrapped as StorageQuotaError).cause).toBe(err)
  })

  it('passes through an existing StorageQuotaError unchanged', () => {
    const err = new StorageQuotaError()
    expect(toStoreError(err)).toBe(err)
  })

  it('passes plain Errors through', () => {
    const err = new Error('nope')
    expect(toStoreError(err)).toBe(err)
  })

  it('wraps non-Error rejections in an Error', () => {
    expect(toStoreError('string thing')).toBeInstanceOf(Error)
    expect(toStoreError(null)).toBeInstanceOf(Error)
  })
})

describe('estimateStorage', () => {
  it('returns null when navigator.storage is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    expect(await estimateStorage()).toBeNull()
  })

  it('returns the estimate when the API resolves', async () => {
    vi.stubGlobal('navigator', {
      storage: { estimate: async () => ({ usage: 1234, quota: 5678 }) },
    })
    expect(await estimateStorage()).toEqual({ usage: 1234, quota: 5678 })
  })

  it('returns null when the API rejects', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        estimate: async () => {
          throw new Error('denied')
        },
      },
    })
    expect(await estimateStorage()).toBeNull()
  })

  it('returns null when the API returns non-numeric values', async () => {
    vi.stubGlobal('navigator', {
      storage: { estimate: async () => ({ usage: undefined, quota: 100 }) },
    })
    expect(await estimateStorage()).toBeNull()
  })
})
