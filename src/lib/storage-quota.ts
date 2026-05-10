/**
 * Typed error raised when an IndexedDB write fails because the browser's
 * storage quota for this origin has been exhausted. Centralized here so the
 * UI can distinguish quota failures from other errors with a single
 * `instanceof` check rather than re-detecting `DOMException` names.
 */
export class StorageQuotaError extends Error {
  constructor(cause?: unknown) {
    super('Storage quota exceeded')
    this.name = 'StorageQuotaError'
    if (cause !== undefined) this.cause = cause
  }
}

export function isQuotaExceeded(err: unknown): boolean {
  if (err instanceof StorageQuotaError) return true
  return err instanceof DOMException && err.name === 'QuotaExceededError'
}

/**
 * Convert an IDB rejection into a typed error. Quota failures become
 * StorageQuotaError; everything else passes through as a plain Error.
 */
export function toStoreError(err: unknown): Error {
  if (err instanceof StorageQuotaError) return err
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return new StorageQuotaError(err)
  }
  if (err instanceof Error) return err
  return new Error(String(err))
}

export interface StorageEstimate {
  usage: number
  quota: number
}

/**
 * Wrap `navigator.storage.estimate()` defensively. Returns null on browsers
 * that don't expose the API or in test environments (jsdom). The reported
 * values are deliberately fuzzy across browsers — treat them as advisory.
 */
export async function estimateStorage(): Promise<StorageEstimate | null> {
  try {
    if (typeof navigator === 'undefined') return null
    const storage = navigator.storage
    if (!storage?.estimate) return null
    const est = await storage.estimate()
    if (typeof est.usage !== 'number' || typeof est.quota !== 'number') return null
    return { usage: est.usage, quota: est.quota }
  } catch {
    return null
  }
}
